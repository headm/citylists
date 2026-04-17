<svelte:head>
	<link href="https://api.mapbox.com/mapbox-gl-js/v3.21.0/mapbox-gl.css" rel="stylesheet" />
</svelte:head>

<script>
	import { onMount, onDestroy } from 'svelte';

	let { places = [], accessToken = '', city = 'San Francisco', onTogglePin = null } = $props();

	const cityCenters = {
		'San Francisco': { lng: -122.44, lat: 37.76, zoom: 12 },
		'New York': { lng: -74.0, lat: 40.71, zoom: 12 },
		'Paris': { lng: 2.35, lat: 48.86, zoom: 12 },
		'Tokyo': { lng: 139.69, lat: 35.68, zoom: 11.5 }
	};

	const MODE_COLORS = {
		'Food & Drink': '#E07A5F',
		'Things to Do': '#457B9D'
	};

	let mapContainer;
	let map;
	let popup;
	let userMarker;
	let mapboxgl;
	let mapReady = $state(false);
	let userLat = $state(null);
	let userLng = $state(null);
	let watchId = null;
	let hasFlownToUser = false;

	// Global handler for pin toggle from popup HTML buttons
	if (typeof window !== 'undefined') {
		window.__mapPinToggle = (placeId) => {
			const place = places.find((p) => p.id === placeId);
			if (place && onTogglePin) onTogglePin(place);
		};
	}

	function isNearCity(lat, lng, cityName) {
		const center = cityCenters[cityName] || cityCenters['San Francisco'];
		const dist = Math.sqrt(
			Math.pow(lat - center.lat, 2) +
			Math.pow(lng - center.lng, 2)
		);
		return dist < 0.5;
	}

	// Generate a GeoJSON circle polygon (no turf dependency)
	function createCircle(lng, lat, radiusKm, points = 64) {
		const coords = [];
		const earthRadius = 6371; // km
		for (let i = 0; i <= points; i++) {
			const angle = (i / points) * 2 * Math.PI;
			const dLat = (radiusKm / earthRadius) * Math.cos(angle);
			const dLng = (radiusKm / earthRadius) * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
			coords.push([lng + dLng * (180 / Math.PI), lat + dLat * (180 / Math.PI)]);
		}
		return {
			type: 'Feature',
			geometry: { type: 'Polygon', coordinates: [coords] }
		};
	}

	function placesToGeoJSON(places) {
		const seen = new Map();
		return {
			type: 'FeatureCollection',
			features: places
				.filter((p) => p.Lat && p.Lng)
				.map((p) => {
					let lng = p.Lng;
					let lat = p.Lat;
					// Jitter co-located points so they don't stack
					const key = lat.toFixed(4) + ',' + lng.toFixed(4);
					const count = seen.get(key) || 0;
					seen.set(key, count + 1);
					if (count > 0) {
						const angle = (count * 137.5) * Math.PI / 180;
						const radius = 0.0003 * count;
						lat += Math.sin(angle) * radius;
						lng += Math.cos(angle) * radius;
					}
					return {
						type: 'Feature',
						properties: {
							name: p.Name,
							stars: p.Stars || 0,
							description: p.Description || '',
							id: p.id,
							mode: p.Mode || '',
							cuisine: Array.isArray(p.Cuisine) ? p.Cuisine.join(', ') : (p.Cuisine || ''),
							category: p.Category || '',
							type: p.Type || '',
							priceLevel: p.PriceLevel || '',
							photoReference: p.Photo || '',
							googleRating: p.GoogleRating || null,
							pinned: p.Pinned || false
						},
						geometry: {
							type: 'Point',
							coordinates: [lng, lat]
						}
					};
				})
		};
	}

	function buildPlacePopupHTML(props) {
		const stars = props.stars ? ' ' + '*'.repeat(props.stars) : '';
		const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(props.name + ' ' + city)}`;
		const modeColor = MODE_COLORS[props.mode] || '#111';

		let html = '<div style="font-family: system-ui, -apple-system, sans-serif;">';

		// Photo — hidden until loaded to prevent layout jump
		if (props.photoReference) {
			html += `<img src="/api/photo?ref=${encodeURIComponent(props.photoReference)}&maxWidthPx=280&maxHeightPx=150" style="display:none; width:100%; max-height:120px; object-fit:cover; border-radius:6px; margin-bottom:0.4rem;" alt="" onload="this.style.display='block'" />`;
		}

		// Name + stars
		html += `<strong style="font-size: 0.9rem;">${props.name}${stars}</strong>`;

		// Rating & price
		if (props.googleRating || props.priceLevel) {
			html += '<div style="font-size: 0.7rem; color: #666; margin-top: 0.1rem;">';
			if (props.googleRating) {
				html += `${props.googleRating}<span style="color: #f5a623; margin-left: 1px;">&#9733;</span>`;
			}
			if (props.priceLevel) {
				html += `${props.googleRating ? ' &nbsp;' : ''}<span style="color: #888;">${props.priceLevel}</span>`;
			}
			html += '</div>';
		}

		// Tags row
		const tags = [props.cuisine, props.category, props.type].filter(Boolean);
		if (tags.length) {
			html += '<div style="margin: 0.3rem 0; display: flex; flex-wrap: wrap; gap: 0.2rem;">';
			for (const tag of tags) {
				html += `<span style="font-size: 0.65rem; padding: 0.1rem 0.35rem; background: #f0f0f0; border-radius: 4px; color: #555;">${tag}</span>`;
			}
			html += '</div>';
		}

		// Description
		if (props.description) {
			html += `<p style="margin: 0.25rem 0 0.3rem; font-size: 0.75rem; color: #555;">${props.description}</p>`;
		}

		// Footer: Google link + pin toggle
		html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.2rem;">';
		html += `<a href="${googleUrl}" target="_blank" rel="noopener" style="font-size: 0.7rem; color: #0066cc; text-decoration: none;">Google</a>`;
		const pinColor = props.pinned === true || props.pinned === 'true' ? '#d4a017' : '#ccc';
		const pinFill = props.pinned === true || props.pinned === 'true' ? 'currentColor' : 'none';
		html += `<button onclick="window.__mapPinToggle('${props.id}')" style="background:none; border:none; cursor:pointer; color:${pinColor}; padding:0.15rem; line-height:1;"><svg width="14" height="14" viewBox="0 0 24 24" fill="${pinFill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></button>`;
		html += '</div></div>';
		return html;
	}

	onMount(async () => {
		const mapboxModule = await import('mapbox-gl');
		const MapboxWorker = (await import('mapbox-gl/dist/mapbox-gl-csp-worker?worker')).default;
		mapboxgl = mapboxModule.default;
		mapboxgl.workerClass = MapboxWorker;
		mapboxgl.accessToken = accessToken;

		const defaultCenter = cityCenters[city] || cityCenters['San Francisco'];

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/light-v11',
			center: [defaultCenter.lng, defaultCenter.lat],
			zoom: defaultCenter.zoom
		});

		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		popup = new mapboxgl.Popup({ offset: 25, maxWidth: '280px', closeButton: false });

		map.on('load', () => {
			// Walking distance ring source (empty until user location acquired)
			map.addSource('walk-ring', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] }
			});

			map.addLayer({
				id: 'walk-ring-fill',
				type: 'fill',
				source: 'walk-ring',
				paint: {
					'fill-color': 'rgba(66, 133, 244, 0.06)',
				}
			});

			map.addLayer({
				id: 'walk-ring-border',
				type: 'line',
				source: 'walk-ring',
				paint: {
					'line-color': 'rgba(66, 133, 244, 0.25)',
					'line-width': 1.5,
					'line-dasharray': [4, 3]
				}
			});

			// Places source (no clustering)
			map.addSource('places', {
				type: 'geojson',
				data: placesToGeoJSON(places)
			});

			// Place dots — color-coded by mode
			map.addLayer({
				id: 'unclustered-point',
				type: 'circle',
				source: 'places',
				paint: {
					'circle-color': [
						'case',
						['get', 'pinned'], '#d4a017',
						['match', ['get', 'mode'],
							'Food & Drink', '#E07A5F',
							'Things to Do', '#457B9D',
							'#111'
						]
					],
					'circle-radius': [
						'interpolate', ['linear'], ['zoom'],
						10, 4,
						12, 9,
						14, 10
					],
					'circle-stroke-width': [
						'interpolate', ['linear'], ['zoom'],
						10, 1,
						12, 2,
						14, 2.5
					],
					'circle-stroke-color': '#fff'
				}
			});

			// Place name labels at higher zoom
			map.addLayer({
				id: 'place-labels',
				type: 'symbol',
				source: 'places',
				minzoom: 12,
				layout: {
					'text-field': ['get', 'name'],
					'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
					'text-size': 11,
					'text-offset': [0, 1.2],
					'text-anchor': 'top',
					'text-allow-overlap': false,
					'text-optional': true
				},
				paint: {
					'text-color': '#333',
					'text-halo-color': '#fff',
					'text-halo-width': 1
				}
			});

			// Click point → show rich popup
			map.on('click', 'unclustered-point', (e) => {
				const f = e.features[0];
				const coords = f.geometry.coordinates.slice();
				popup.setLngLat(coords)
					.setHTML(buildPlacePopupHTML(f.properties))
					.addTo(map);
			});

			// Cursor changes
			map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
			map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });

			mapReady = true;
		});

		// User location
		if ('geolocation' in navigator) {
			watchId = navigator.geolocation.watchPosition(
				(pos) => {
					const lat = pos.coords.latitude;
					const lng = pos.coords.longitude;
					userLat = lat;
					userLng = lng;

					// Update walking ring
					if (map && mapReady) {
						const ringSource = map.getSource('walk-ring');
						if (ringSource) {
							ringSource.setData({
								type: 'FeatureCollection',
								features: [createCircle(lng, lat, 1.6)]
							});
						}
					}

					if (!userMarker && map && mapboxgl) {
						const el = document.createElement('div');
						el.style.cssText = 'width: 14px; height: 14px; background: #4285F4; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(66,133,244,0.5);';
						userMarker = new mapboxgl.Marker({ element: el })
							.setLngLat([lng, lat])
							.addTo(map);

						if (!hasFlownToUser && isNearCity(lat, lng, city)) {
							map.flyTo({ center: [lng, lat], zoom: 12, duration: 1500 });
							hasFlownToUser = true;
						}
					} else if (userMarker) {
						userMarker.setLngLat([lng, lat]);
					}
				},
				() => {},
				{ enableHighAccuracy: true, timeout: 10000 }
			);
		}
	});

	onDestroy(() => {
		if (watchId !== null) navigator.geolocation.clearWatch(watchId);
		if (userMarker) userMarker.remove();
		if (popup) popup.remove();
		if (map) map.remove();
	});

	function updateSource() {
		if (!map || !mapReady) return;
		const source = map.getSource('places');
		if (source) {
			source.setData(placesToGeoJSON(places));
		}
	}

	$effect(() => {
		const _ = places.length && places.map(p => p.id);
		if (mapReady) updateSource();
	});

	$effect(() => {
		const _ = city;
		if (map && mapReady) {
			if (userLat !== null && userLng !== null && isNearCity(userLat, userLng, city)) {
				map.flyTo({ center: [userLng, userLat], zoom: 12, duration: 1000 });
			} else {
				const center = cityCenters[city] || cityCenters['San Francisco'];
				map.flyTo({ center: [center.lng, center.lat], zoom: center.zoom, duration: 1000 });
			}
		}
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<style>
	.map-container {
		height: calc(100vh - 120px);
		height: calc(100dvh - 120px);
		overflow: hidden;
		border-radius: 8px;
		margin-left: -8px;
		margin-right: -8px;
		width: calc(100% + 16px);
	}

	@media (max-width: 600px) {
		.map-container {
			height: calc(100vh - 110px);
			height: calc(100dvh - 110px);
			width: 100vw;
			margin-left: calc(-1rem - 8px);
			border-radius: 0;
		}
	}
</style>
