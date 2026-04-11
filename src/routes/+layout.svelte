<script>
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js');
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>City Lists</title>
	<meta name="description" content="Curated city guides for SF, New York, and Paris" />
</svelte:head>

{@render children()}
