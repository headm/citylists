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
	let mapboxgl;

	onMount(async () => {
		mapboxgl = (await import('mapbox-gl')).default;
		await import('mapbox-gl/dist/mapbox-gl.css');

		mapboxgl.accessToken = accessToken;

		const center = cityCenters[city] || cityCenters['San Francisco'];

		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/light-v11',
			center: [center.lng, center.lat],
			zoom: center.zoom
		});

		map.addControl(new mapboxgl.NavigationControl(), 'top-right');

		map.on('load', () => {
			updateMarkers();
		});
	});

	onDestroy(() => {
		markers.forEach((m) => m.remove());
		markers = [];
		if (map) map.remove();
	});

	function updateMarkers() {
		if (!map || !mapboxgl) return;

		// Remove existing markers
		markers.forEach((m) => m.remove());
		markers = [];

		// Add new markers
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
		// React to places changes
		places;
		updateMarkers();
	});

	$effect(() => {
		// React to city changes
		if (map && city) {
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
