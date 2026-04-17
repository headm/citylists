<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const cities = ['San Francisco', 'New York', 'Paris', 'Tokyo'];
	let candidates = $state([]);
	let selectedCity = $state('San Francisco');
	let showCityPicker = $state(false);
	let loading = $state(false);
	let processingId = $state(null);
	let pipelineRunning = $state(false);
	let pipelineLog = $state([]);
	let showPipelineLog = $state(false);
	let logContainer;

	async function runPipeline() {
		pipelineRunning = true;
		pipelineLog = [];
		showPipelineLog = true;

		try {
			const res = await fetch('/api/candidates/discover', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ city: selectedCity })
			});

			if (res.status === 409) {
				pipelineLog = ['Pipeline is already running.'];
				pipelineRunning = false;
				return;
			}

			if (!res.ok) {
				pipelineLog = [`Error: ${res.status}`];
				pipelineRunning = false;
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop();
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					try {
						const event = JSON.parse(line.slice(6));
						if (event.done) {
							pipelineRunning = false;
							loadCandidates();
						} else if (event.log) {
							pipelineLog = [...pipelineLog, event.log];
							if (logContainer) {
								requestAnimationFrame(() => { logContainer.scrollTop = logContainer.scrollHeight; });
							}
						}
					} catch {}
				}
			}
		} catch (err) {
			pipelineLog = [...pipelineLog, `Error: ${err.message}`];
		}
		pipelineRunning = false;
	}

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
			} else if (res.status === 409) {
				// Duplicate — auto-dismissed by server
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<main onclick={(e) => { if (!e.target.closest('h1')) showCityPicker = false; }}>
	<header>
		<h1>
			<span class="city-title" onclick={() => { showCityPicker = !showCityPicker; }}>{selectedCity} <span class="chevron">&#9662;</span></span>
			{#if showCityPicker}
				<div class="city-dropdown">
					{#each cities as c}
						<button class:active={selectedCity === c} onclick={() => { selectedCity = c; showCityPicker = false; }}>{c}</button>
					{/each}
				</div>
			{/if}
			<span class="subtitle">Candidates</span>
		</h1>
		<div class="header-actions">
			<button class="btn-pipeline" disabled={pipelineRunning} onclick={runPipeline}>
				{pipelineRunning ? 'Running...' : 'Run Discovery'}
			</button>
			<a href="/" class="back-link">← Back</a>
		</div>
	</header>

	{#if showPipelineLog}
		<div class="pipeline-log" bind:this={logContainer}>
			{#each pipelineLog as line}
				<div>{line}</div>
			{/each}
			{#if pipelineRunning}
				<div class="log-spinner">...</div>
			{/if}
		</div>
	{/if}

	<p class="count">
		{#if loading}
			Loading…
		{:else}
			{candidates.length} pending candidate{candidates.length !== 1 ? 's' : ''}
		{/if}
	</p>

	<div class="card-list">
		{#each candidates as candidate (candidate.id)}
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
						<a class="card-name" href={`https://www.google.com/search?q=${encodeURIComponent(candidate.Name + ' ' + selectedCity)}`} target="_blank" rel="noopener"><strong>{candidate.Name}</strong></a>
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

	{#if !loading && candidates.length === 0}
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
		position: relative;
	}

	.subtitle {
		font-weight: 400;
		color: #888;
		font-size: 1rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.back-link {
		font-size: 0.85rem;
		color: #555;
		text-decoration: none;
	}

	.btn-pipeline {
		padding: 0.35rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 8px;
		background: white;
		font-size: 0.8rem;
		cursor: pointer;
		color: #333;
		white-space: nowrap;
	}

	.btn-pipeline:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.pipeline-log {
		background: #1a1a1a;
		color: #ccc;
		font-family: 'SF Mono', Menlo, monospace;
		font-size: 0.7rem;
		line-height: 1.5;
		padding: 0.75rem;
		border-radius: 8px;
		max-height: 200px;
		overflow-y: auto;
		margin-bottom: 0.75rem;
	}

	.log-spinner {
		color: #666;
	}

	.city-title {
		cursor: pointer;
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		vertical-align: bottom;
	}

	.chevron {
		font-size: 0.75em;
		color: #888;
		vertical-align: 0.1em;
	}

	.city-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 30;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 180px;
	}

	.city-dropdown button {
		padding: 0.6rem 1rem;
		border: none;
		background: none;
		text-align: left;
		font-size: 1rem;
		cursor: pointer;
		color: #333;
	}

	.city-dropdown button:hover {
		background: #f5f5f5;
	}

	.city-dropdown button.active {
		font-weight: 600;
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
		text-decoration: none;
		color: inherit;
	}

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
