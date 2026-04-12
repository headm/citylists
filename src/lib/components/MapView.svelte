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
	let markers = [];
	let userMarker;
	let mapboxgl;
	let mapReady = $state(false);

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

		map.on('load', () => {
			mapReady = true;
		});

		// Get user location via browser API and show blue dot
		if ('geolocation' in navigator) {
			navigator.geolocation.watchPosition(
				(pos) => {
					const { latitude, longitude } = pos.coords;

					if (!userMarker && map) {
						const el = document.createElement('div');
						el.style.cssText = 'width: 14px; height: 14px; background: #4285F4; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(66,133,244,0.5);';
						userMarker = new mapboxgl.Marker({ element: el })
							.setLngLat([longitude, latitude])
							.addTo(map);

						// Only fly to user if they're near the selected city
						const center = cityCenters[city] || cityCenters['San Francisco'];
						const dist = Math.sqrt(
							Math.pow(latitude - center.lat, 2) +
							Math.pow(longitude - center.lng, 2)
						);
						// ~0.5 degrees ≈ roughly 50km — close enough to be "in the city"
						if (dist < 0.5) {
							map.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1500 });
						}
					} else if (userMarker) {
						userMarker.setLngLat([longitude, latitude]);
					}
				},
				() => {
					// Location unavailable (e.g. desktop without GPS) — stay on city center
				},
				{ enableHighAccuracy: true, timeout: 5000 }
			);
		}
	});

	onDestroy(() => {
		markers.forEach((m) => m.remove());
		markers = [];
		if (userMarker) userMarker.remove();
		if (map) map.remove();
	});

	function updateMarkers() {
		if (!map || !mapboxgl) return;

		markers.forEach((m) => m.remove());
		markers = [];

		for (const place of places) {
			if (!place.Lat || !place.Lng) continue;

			const stars = place.Stars ? ' ' + '*'.repeat(place.Stars) : '';
			const desc = place.Description || '';
			const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(place.Name + ' ' + city)}`;

			const popup = new mapboxgl.Popup({ offset: 25, maxWidth: '260px' }).setHTML(
				`<div style="font-family: system-ui, -apple-system, sans-serif;">
					<strong style="font-size: 0.9rem;">${place.Name}${stars}</strong>
					${desc ? `<p style="margin: 0.25rem 0; font-size: 0.75rem; color: #555;">${desc}</p>` : ''}
					<a href="${googleUrl}" target="_blank" rel="noopener" style="font-size: 0.7rem; color: #0066cc; text-decoration: none;">Google</a>
				</div>`
			);

			const el = document.createElement('div');
			el.style.cssText = 'width: 12px; height: 12px; background: #111; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer;';

			const marker = new mapboxgl.Marker({ element: el })
				.setLngLat([place.Lng, place.Lat])
				.setPopup(popup)
				.addTo(map);

			markers.push(marker);
		}
	}

	$effect(() => {
		// Access length and individual items to create proper reactive dependency
		const _ = places.length && places.map(p => p.id);
		if (mapReady) updateMarkers();
	});

	$effect(() => {
		const _ = city;
		if (map && mapReady) {
			const center = cityCenters[city] || cityCenters['San Francisco'];
			map.flyTo({ center: [center.lng, center.lat], zoom: center.zoom, duration: 1000 });
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
