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
				Stars: enriched.stars || 0,
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

	// --- Grouping & Filtering ---
	let groupBy = $state('Category');
	let filterField = $state(null);
	let filterValue = $state(null);

	function getGroupValue(place, field) {
		const val = place[field];
		if (Array.isArray(val)) return val[0] || 'Other';
		return val || 'Other';
	}

	function getFilterOptions(field) {
		const vals = new Set();
		$places.forEach((p) => {
			if (!p.Name) return;
			const v = p[field];
			if (Array.isArray(v)) v.forEach((x) => vals.add(x));
			else if (v) vals.add(v);
		});
		return [...vals].sort();
	}

	function toggleFilter(field, value) {
		if (filterField === field && filterValue === value) {
			filterField = null;
			filterValue = null;
		} else {
			filterField = field;
			filterValue = value;
		}
	}

	let filteredPlaces = $derived(
		$places.filter((p) => {
			if (!p.Name) return false;
			if (!filterField || !filterValue) return true;
			const v = p[filterField];
			if (Array.isArray(v)) return v.includes(filterValue);
			return v === filterValue;
		})
	);

	let groupedPlaces = $derived(() => {
		const groups = {};
		filteredPlaces.forEach((p) => {
			const key = getGroupValue(p, groupBy);
			if (!groups[key]) groups[key] = [];
			groups[key].push(p);
		});
		return groups;
	});

	function stars(n) {
		return n ? ' ' + '*'.repeat(n) : '';
	}

	function tags(place) {
		const parts = [];
		// Neighborhood always first
		if (groupBy !== 'Neighborhood' && place.Neighborhood) {
			const hoods = Array.isArray(place.Neighborhood) ? place.Neighborhood : [place.Neighborhood];
			parts.push(...hoods);
		}
		if (place.Cuisine) {
			const cuisines = Array.isArray(place.Cuisine) ? place.Cuisine : [place.Cuisine];
			parts.push(...cuisines);
		}
		if (groupBy !== 'Category' && place.Category) parts.push(place.Category);
		return parts;
	}
</script>

<main>
	<header>
		<h1>
			<select value={$selectedCity} onchange={(e) => selectCity(e.target.value)}>
				{#each cities as city}
					<option value={city}>{city}</option>
				{/each}
			</select>
		</h1>
		<button class="add-btn" onclick={() => (showAddForm = !showAddForm)}>
			{showAddForm ? 'Cancel' : '+'}
		</button>
	</header>

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
						Stars (Michelin)
						<input type="number" min="0" max="3" bind:value={enriched.stars} />
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

	<div class="controls">
		<div class="group-by">
			<span class="label">Group:</span>
			{#each ['Category', 'Neighborhood', 'Type'] as field}
				<button class:active={groupBy === field} onclick={() => { groupBy = field; filterField = null; filterValue = null; }}>
					{field}
				</button>
			{/each}
		</div>

		<div class="filters">
			<span class="label">Filter:</span>
			{#each getFilterOptions(groupBy) as opt}
				<button
					class="filter-pill"
					class:active={filterField === groupBy && filterValue === opt}
					onclick={() => toggleFilter(groupBy, opt)}
				>
					{opt}
				</button>
			{/each}
		</div>
	</div>

	<section>
		{#if filteredPlaces.length === 0}
			<p>No places yet.</p>
		{:else}
			{@const groups = groupedPlaces()}
			{#each Object.entries(groups) as [group, items]}
				<h3 class="group-heading">{group}</h3>
				<ul class="compact-list">
					{#each items as place}
						<li>
							<strong>{place.Name}</strong>{stars(place.Stars)}
							{#if place.Description}
								<span class="desc"> — {place.Description}</span>
							{/if}
							{#each tags(place) as tag}
								<span class="tag-pill">{tag}</span>
							{/each}
						</li>
					{/each}
				</ul>
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

	header h1 select {
		font-size: inherit;
		font-weight: inherit;
		font-family: inherit;
		border: none;
		background: none;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
		padding: 0;
		padding-right: 1.2rem;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right center;
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

	.controls {
		margin-bottom: 1rem;
	}

	.group-by {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}

	.controls .label {
		font-size: 0.8rem;
		color: #888;
		margin-right: 0.15rem;
	}

	.group-by button {
		padding: 0.25rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		font-size: 0.75rem;
	}

	.group-by button.active {
		background: #111;
		color: white;
		border-color: #111;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.filter-pill {
		padding: 0.2rem 0.5rem;
		border: 1px solid #ddd;
		border-radius: 12px;
		background: white;
		cursor: pointer;
		font-size: 0.7rem;
		color: #555;
	}

	.filter-pill.active {
		background: #111;
		color: white;
		border-color: #111;
	}

	.group-heading {
		font-size: 0.85rem;
		font-weight: 600;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 1rem 0 0.25rem;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.25rem;
	}

	.compact-list {
		list-style: disc;
		padding-left: 1.25rem;
		margin: 0 0 0.5rem;
	}

	.compact-list li {
		font-size: 0.85rem;
		line-height: 1.5;
		margin-bottom: 0.3rem;
	}

	.compact-list .desc {
		color: #555;
	}

	.tag-pill {
		display: inline-block;
		background: #f0f0f0;
		color: #666;
		padding: 0.05rem 0.35rem;
		border-radius: 3px;
		font-size: 0.65rem;
		margin-left: 0.2rem;
		vertical-align: middle;
	}
</style>
