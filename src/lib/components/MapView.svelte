<svelte:head>
	<link href="https://api.mapbox.com/mapbox-gl-js/v3.21.0/mapbox-gl.css" rel="stylesheet" />
</svelte:head>

<script>
	import { onMount, onDestroy } from 'svelte';

	let { places = [], accessToken = '', city = 'San Francisco' } = $props();

	const cityCenters = {
		'San Francisco': { lng: -122.44, lat: 37.76, zoom: 12 },
		'New York': { lng: -74.0, lat: 40.71, zoom: 12 },
		'Paris': { lng: 2.35, lat: 48.86, zoom: 12 },
		'Tokyo': { lng: 139.69, lat: 35.68, zoom: 11.5 }
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

	function isNearCity(lat, lng, cityName) {
		const center = cityCenters[cityName] || cityCenters['San Francisco'];
		const dist = Math.sqrt(
			Math.pow(lat - center.lat, 2) +
			Math.pow(lng - center.lng, 2)
		);
		return dist < 0.5;
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
							id: p.id
						},
						geometry: {
							type: 'Point',
							coordinates: [lng, lat]
						}
					};
				})
		};
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

		popup = new mapboxgl.Popup({ offset: 25, maxWidth: '260px', closeButton: false });

		map.on('load', () => {
			// Add clustered source
			map.addSource('places', {
				type: 'geojson',
				data: placesToGeoJSON(places),
				cluster: true,
				clusterMaxZoom: 15,
				clusterRadius: 40
			});

			// Cluster circles
			map.addLayer({
				id: 'clusters',
				type: 'circle',
				source: 'places',
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': '#111',
					'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 10, 24],
					'circle-stroke-width': 2,
					'circle-stroke-color': '#fff'
				}
			});

			// Cluster count labels
			map.addLayer({
				id: 'cluster-count',
				type: 'symbol',
				source: 'places',
				filter: ['has', 'point_count'],
				layout: {
					'text-field': ['get', 'point_count_abbreviated'],
					'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
					'text-size': 12
				},
				paint: {
					'text-color': '#fff'
				}
			});

			// Individual place dots
			map.addLayer({
				id: 'unclustered-point',
				type: 'circle',
				source: 'places',
				filter: ['!', ['has', 'point_count']],
				paint: {
					'circle-color': '#111',
					'circle-radius': 6,
					'circle-stroke-width': 2,
					'circle-stroke-color': '#fff'
				}
			});

			// Click cluster → zoom in
			map.on('click', 'clusters', (e) => {
				const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
				if (!features.length) return;
				const coords = features[0].geometry.coordinates;
				map.easeTo({ center: coords, zoom: map.getZoom() + 3, duration: 500 });
			});

			// Click individual point → show popup
			map.on('click', 'unclustered-point', (e) => {
				const f = e.features[0];
				const coords = f.geometry.coordinates.slice();
				const stars = f.properties.stars ? ' ' + '*'.repeat(f.properties.stars) : '';
				const desc = f.properties.description;
				const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(f.properties.name + ' ' + city)}`;

				popup.setLngLat(coords).setHTML(
					`<div style="font-family: system-ui, -apple-system, sans-serif;">
						<strong style="font-size: 0.9rem;">${f.properties.name}${stars}</strong>
						${desc ? `<p style="margin: 0.25rem 0; font-size: 0.75rem; color: #555;">${desc}</p>` : ''}
						<a href="${googleUrl}" target="_blank" rel="noopener" style="font-size: 0.7rem; color: #0066cc; text-decoration: none;">Google</a>
					</div>`
				).addTo(map);
			});

			// Cursor changes
			map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
			map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
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

					if (!userMarker && map && mapboxgl) {
						const el = document.createElement('div');
						el.style.cssText = 'width: 14px; height: 14px; background: #4285F4; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(66,133,244,0.5);';
						userMarker = new mapboxgl.Marker({ element: el })
							.setLngLat([lng, lat])
							.addTo(map);

						if (!hasFlownToUser && isNearCity(lat, lng, city)) {
							map.flyTo({ center: [lng, lat], zoom: 14, duration: 1500 });
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
				map.flyTo({ center: [userLng, userLat], zoom: 14, duration: 1000 });
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
		width: 100%;
		height: 60vh;
		border-radius: 8px;
		overflow: hidden;
	}
</style>
