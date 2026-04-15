<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const cities = ['San Francisco', 'New York', 'Paris', 'Tokyo'];
	const sources = ['All', 'Eater', 'Infatuation', 'Google', 'Yelp'];

	let candidates = $state([]);
	let selectedCity = $state('San Francisco');
	let selectedSource = $state('All');
	let loading = $state(false);
	let processingId = $state(null);

	let filteredCandidates = $derived(
		selectedSource === 'All'
			? candidates
			: candidates.filter((c) => c.Source === selectedSource)
	);

	async function loadCandidates() {
		loading = true;
		try {
			const params = new URLSearchParams({ city: selectedCity, status: 'Pending' });
			const res = await fetch(`/api/candidates?${params}`);
			if (res.ok) candidates = await res.json();
		} finally {
			loading = false;
		}
	}

	async function approve(id) {
		processingId = id;
		try {
			const res = await fetch('/api/candidates/approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (res.ok) {
				candidates = candidates.filter((c) => c.id !== id);
			}
		} finally {
			processingId = null;
		}
	}

	async function dismiss(id) {
		processingId = id;
		try {
			const res = await fetch('/api/candidates/dismiss', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (res.ok) {
				candidates = candidates.filter((c) => c.id !== id);
			}
		} finally {
			processingId = null;
		}
	}

	$effect(() => {
		const _ = selectedCity;
		if (browser) loadCandidates();
	});

	onMount(() => loadCandidates());
</script>

<svelte:head>
	<title>Candidates — City Lists</title>
</svelte:head>

<main>
	<header>
		<h1>{selectedCity} <span class="subtitle">Candidates</span></h1>
		<a href="/" class="back-link">← Back</a>
	</header>

	<div class="city-tabs">
		{#each cities as city}
			<button class:active={selectedCity === city} onclick={() => { selectedCity = city; }}>
				{city}
			</button>
		{/each}
	</div>

	<div class="source-tabs">
		{#each sources as source}
			<button class:active={selectedSource === source} onclick={() => { selectedSource = source; }}>
				{source}
			</button>
		{/each}
	</div>

	<p class="count">
		{#if loading}
			Loading…
		{:else}
			{filteredCandidates.length} pending candidate{filteredCandidates.length !== 1 ? 's' : ''}
		{/if}
	</p>

	<div class="card-list">
		{#each filteredCandidates as candidate (candidate.id)}
			{@const isProcessing = processingId === candidate.id}
			<div class="card" class:processing={isProcessing}>
				{#if candidate.Photo}
					<img
						src={`/api/photo?ref=${encodeURIComponent(candidate.Photo)}&maxWidthPx=560&maxHeightPx=200`}
						alt=""
						class="card-photo"
						style="display:none"
						onload={(e) => { e.target.style.display = 'block'; }}
					/>
				{/if}

				<div class="card-body">
					<div class="card-header">
						<strong class="card-name">{candidate.Name}</strong>
						{#if candidate.Source}
							<span class="source-badge" data-source={candidate.Source}>{candidate.Source}</span>
						{/if}
					</div>

					{#if candidate.PriceLevel}
						<span class="price">{candidate.PriceLevel}</span>
					{/if}

					{#if candidate.Description}
						<p class="card-desc">{candidate.Description}</p>
					{/if}

					{#if candidate.Address}
						<p class="card-address">{candidate.Address}</p>
					{/if}

					{#if candidate.Cuisine}
						<div class="tags">
							{#each [].concat(candidate.Cuisine) as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}

					<div class="card-actions">
						<button class="btn-approve" disabled={isProcessing} onclick={() => approve(candidate.id)}>
							{isProcessing ? 'Approving…' : '✓ Approve'}
						</button>
						<button class="btn-dismiss" disabled={isProcessing} onclick={() => dismiss(candidate.id)}>
							✗ Dismiss
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if !loading && filteredCandidates.length === 0}
		<div class="empty">No pending candidates</div>
	{/if}
</main>

<style>
	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 1rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0;
	}

	.subtitle {
		font-weight: 400;
		color: #888;
		font-size: 1rem;
	}

	.back-link {
		font-size: 0.85rem;
		color: #555;
		text-decoration: none;
	}

	.city-tabs, .source-tabs {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}

	.city-tabs button, .source-tabs button {
		padding: 0.35rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 999px;
		background: white;
		font-size: 0.8rem;
		cursor: pointer;
		color: #333;
	}

	.city-tabs button.active, .source-tabs button.active {
		background: #111;
		color: white;
		border-color: #111;
	}

	.count {
		font-size: 0.8rem;
		color: #888;
		margin: 0.75rem 0;
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.card {
		border: 1px solid #e5e5e5;
		border-radius: 10px;
		overflow: hidden;
		background: white;
		transition: opacity 0.2s;
	}

	.card.processing {
		opacity: 0.5;
		pointer-events: none;
	}

	.card-photo {
		width: 100%;
		max-height: 150px;
		object-fit: cover;
	}

	.card-body {
		padding: 0.75rem;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.25rem;
	}

	.card-name {
		font-size: 1rem;
	}

	.source-badge {
		font-size: 0.6rem;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		background: #eee;
		color: #555;
	}

	.source-badge[data-source="Eater"] { background: #fee; color: #c33; }
	.source-badge[data-source="Infatuation"] { background: #eef; color: #33c; }
	.source-badge[data-source="Google"] { background: #efe; color: #3a3; }
	.source-badge[data-source="Yelp"] { background: #fef0e0; color: #c63; }

	.price {
		font-size: 0.75rem;
		color: #888;
	}

	.card-desc {
		font-size: 0.8rem;
		color: #555;
		margin: 0.3rem 0;
	}

	.card-address {
		font-size: 0.75rem;
		color: #999;
		margin: 0.2rem 0;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin: 0.4rem 0;
	}

	.tag {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
		background: #f0f0f0;
		border-radius: 4px;
		color: #555;
	}

	.card-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.btn-approve, .btn-dismiss {
		flex: 1;
		padding: 0.5rem;
		border: none;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-approve {
		background: #111;
		color: white;
	}

	.btn-dismiss {
		background: #f0f0f0;
		color: #555;
	}

	.btn-approve:disabled, .btn-dismiss:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.empty {
		background: #ececec;
		border-radius: 12px;
		color: #999;
		padding: 3rem;
		text-align: center;
		font-size: 0.9rem;
		margin-top: 1rem;
	}
</style>
