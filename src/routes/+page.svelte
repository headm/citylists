<script>
	import { selectedCity, places } from '$lib/stores.js';
	import { onMount } from 'svelte';

	const cities = ['San Francisco', 'New York', 'Paris'];

	let showAddForm = $state(false);
	let addName = $state('');
	let enriching = $state(false);
	let saving = $state(false);
	let enriched = $state(null);

	async function loadPlaces(city) {
		const res = await fetch(`/api/places?city=${encodeURIComponent(city)}`);
		if (res.ok) {
			$places = await res.json();
		}
	}

	onMount(() => {
		loadPlaces($selectedCity);
	});

	function selectCity(city) {
		$selectedCity = city;
		loadPlaces(city);
	}

	async function enrich() {
		if (!addName.trim()) return;
		enriching = true;
		try {
			const res = await fetch('/api/enrich', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: addName.trim(), city: $selectedCity })
			});
			if (res.ok) {
				enriched = await res.json();
			}
		} finally {
			enriching = false;
		}
	}

	async function savePlace() {
		if (!enriched) return;
		saving = true;
		try {
			const fields = {
				Name: addName.trim(),
				City: $selectedCity,
				Neighborhood: enriched.neighborhood ? [].concat(enriched.neighborhood) : [],
				Cuisine: enriched.cuisine ? [].concat(enriched.cuisine) : [],
				Category: enriched.category || '',
				Type: enriched.type || '',
				Description: enriched.description || '',
				URL: enriched.url || ''
			};
			const res = await fetch('/api/places', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(fields)
			});
			if (res.ok) {
				const created = await res.json();
				$places = [...$places, created];
				resetForm();
			}
		} finally {
			saving = false;
		}
	}

	function resetForm() {
		showAddForm = false;
		addName = '';
		enriched = null;
	}
</script>

<main>
	<header>
		<h1>City Lists</h1>
		<button class="add-btn" onclick={() => (showAddForm = !showAddForm)}>
			{showAddForm ? 'Cancel' : '+'}
		</button>
	</header>

	<nav>
		{#each cities as city}
			<button
				class:active={$selectedCity === city}
				onclick={() => selectCity(city)}
			>
				{city}
			</button>
		{/each}
	</nav>

	{#if showAddForm}
		<div class="add-form">
			<div class="row">
				<input
					bind:value={addName}
					placeholder="Place name..."
					disabled={enriching}
				/>
				<button onclick={enrich} disabled={enriching || !addName.trim()}>
					{enriching ? 'Loading...' : 'Enrich'}
				</button>
			</div>
			<p class="city-label">City: {$selectedCity}</p>

			{#if enriched}
				<div class="fields">
					<label>
						Neighborhood
						<input bind:value={enriched.neighborhood} />
					</label>
					<label>
						Cuisine (comma-separated)
						<input
							value={Array.isArray(enriched.cuisine) ? enriched.cuisine.join(', ') : enriched.cuisine}
							oninput={(e) => { enriched.cuisine = e.target.value.split(',').map(s => s.trim()).filter(Boolean); }}
						/>
					</label>
					<label>
						Category
						<input bind:value={enriched.category} />
					</label>
					<label>
						Type
						<input bind:value={enriched.type} />
					</label>
					<label>
						Description
						<input bind:value={enriched.description} />
					</label>
					<label>
						URL
						<input bind:value={enriched.url} placeholder="Optional" />
					</label>
					<button class="save-btn" onclick={savePlace} disabled={saving}>
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<section>
		{#if $places.length === 0}
			<p>No places yet.</p>
		{:else}
			{#each $places as place}
				{#if place.Name}
					<div class="card">
						<h2>{place.Name}</h2>
						{#if place.Description}<p class="desc">{place.Description}</p>{/if}
						<div class="meta">
							{#if place.Type}<span class="pill">{place.Type}</span>{/if}
							{#if place.Category}<span class="pill">{place.Category}</span>{/if}
							{#if place.Neighborhood}
								{#each place.Neighborhood as n}<span class="pill">{n}</span>{/each}
							{/if}
							{#if place.Cuisine}
								{#each place.Cuisine as c}<span class="pill">{c}</span>{/each}
							{/if}
						</div>
						{#if place.URL}<a href={place.URL} target="_blank" rel="noopener">Link</a>{/if}
					</div>
				{/if}
			{/each}
		{/if}
	</section>
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
		align-items: center;
		margin-bottom: 0.75rem;
	}

	header h1 {
		margin: 0;
	}

	.add-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid #ccc;
		background: white;
		font-size: 1.2rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	nav {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	nav button {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: white;
		cursor: pointer;
		font-size: 0.9rem;
	}

	nav button.active {
		background: #111;
		color: white;
		border-color: #111;
	}

	.add-form {
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		background: #fafafa;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.row input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 0.9rem;
	}

	.row button {
		padding: 0.5rem 1rem;
		border: 1px solid #111;
		border-radius: 6px;
		background: #111;
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.row button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.city-label {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: #888;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.fields label {
		font-size: 0.8rem;
		color: #555;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.fields input {
		padding: 0.4rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 0.9rem;
	}

	.save-btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		background: #111;
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
		margin-top: 0.25rem;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.card {
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
	}

	.card h2 {
		margin: 0 0 0.25rem;
		font-size: 1.1rem;
	}

	.desc {
		margin: 0 0 0.5rem;
		color: #555;
		font-size: 0.9rem;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.pill {
		background: #f0f0f0;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #333;
	}

	a {
		font-size: 0.8rem;
		color: #0066cc;
	}
</style>
