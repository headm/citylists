<script>
	import { selectedCity, places } from '$lib/stores.js';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import MapView from '$lib/components/MapView.svelte';

	const cities = ['San Francisco', 'New York', 'Tokyo'];

	let showAddForm = $state(false);
	let showFilterModal = $state(false);
	let viewMode = $state('list');
	let listStyle = $state('cards');
	let showCityPicker = $state(false);
	let showGroupPicker = $state(false);
	let controlsVisible = $state(true);
	let stickyHeaderEl;
	let lastScrollY = 0;
	let scrollAnchor = 0;
	let lastDirection = 'up';
	let transitioning = $state(false);
	let controlsSettled = $derived(controlsVisible && !transitioning);
	let addName = $state('');
	let enriching = $state(false);
	let saving = $state(false);

let enriched = $state(null);
	let fieldOptions = $state({ Category: [], Type: [] });
	let duplicateWarning = $state(null);

	function checkDuplicate() {
		const name = addName.trim().toLowerCase();
		const match = $places.find((p) => p.Name && p.Name.toLowerCase() === name);
		duplicateWarning = match ? match.Name : null;
	}

	async function loadPlaces(city) {
		const res = await fetch(`/api/places?city=${encodeURIComponent(city)}`);
		if (res.ok) {
			$places = await res.json();
		}
	}

	onMount(async () => {
		loadPlaces($selectedCity);
		const res = await fetch('/api/field-options');
		if (res.ok) fieldOptions = await res.json();

		function updateHeaderHeight() {
			if (stickyHeaderEl) {
				const rect = stickyHeaderEl.getBoundingClientRect();
				document.documentElement.style.setProperty('--sticky-header-height', rect.bottom + 'px');
			}
		}

		function setControlsVisible(v) {
			if (controlsVisible !== v && !transitioning) {
				controlsVisible = v;
				transitioning = true;
			}
		}

		// Ignore scroll deltas smaller than this — filters out Chrome mobile
		// address bar expand/collapse which fires scroll events without real user scroll
		const SCROLL_NOISE_THRESHOLD = 2;

		function onScroll() {
			const y = window.scrollY;
			const delta = Math.abs(y - lastScrollY);

			if (y < 10) {
				setControlsVisible(true);
				lastDirection = 'up';
				scrollAnchor = y;
			} else if (delta < SCROLL_NOISE_THRESHOLD) {
				// Skip — likely Chrome address bar animation, not a real scroll
			} else if (y > lastScrollY) {
				if (lastDirection !== 'down') {
					lastDirection = 'down';
					scrollAnchor = y;
				}
				if (filteredPlaces.length > 0 && viewMode !== 'map') setControlsVisible(false);
			} else if (y < lastScrollY) {
				// Ignore rubber-band bounce at the bottom of the page
				const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 5;
				if (lastDirection !== 'up') {
					lastDirection = 'up';
					scrollAnchor = y;
				}
				if (scrollAnchor - y > 15 && !atBottom) {
					setControlsVisible(true);
				}
			}
			lastScrollY = y;
			requestAnimationFrame(updateHeaderHeight);
		}

		function onTransitionEnd() {
			transitioning = false;
			updateHeaderHeight();
		}

		updateHeaderHeight();
		window.addEventListener('scroll', onScroll, { passive: true });
		stickyHeaderEl?.addEventListener('transitionend', onTransitionEnd);
		return () => {
			window.removeEventListener('scroll', onScroll);
			stickyHeaderEl?.removeEventListener('transitionend', onTransitionEnd);
		};
	});

	$effect(() => {
		if (browser) {
			document.body.style.overflow = (showAddForm || showFilterModal) ? 'hidden' : '';
		}
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
				if (enriched.correctedName) {
					addName = enriched.correctedName;
				}
				checkDuplicate();
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
				Mode: enriched.mode || selectedMode,
				Neighborhood: enriched.neighborhood ? [].concat(enriched.neighborhood) : [],
				Cuisine: enriched.cuisine ? [].concat(enriched.cuisine) : [],
				Category: enriched.category || '',
				Type: enriched.type || '',
				Description: enriched.description || '',
				Stars: enriched.stars || 0,
				URL: enriched.url || '',
				Address: enriched.address || '',
				Lat: enriched.lat || null,
				Lng: enriched.lng || null,
				Photo: enriched.photoReference || '',
				PriceLevel: enriched.priceLevel || '',
				Hours: enriched.hours || ''
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
		duplicateWarning = null;
	}


	// --- Mode ---
	const modes = ['Food & Drink', 'Things to Do', 'All'];
	let selectedMode = $state('Food & Drink');

	const modeConfig = {
		'Food & Drink': {
			groupOptions: ['Neighborhood', 'Category', 'Type'],
			filterFields: ['Neighborhood', 'Category', 'Type', 'Cuisine'],
			defaultGroup: 'Neighborhood'
		},
		'Things to Do': {
			groupOptions: ['Neighborhood'],
			filterFields: ['Neighborhood'],
			defaultGroup: 'Neighborhood'
		},
		'All': {
			groupOptions: ['Neighborhood'],
			filterFields: ['Neighborhood'],
			defaultGroup: 'Neighborhood'
		}
	};

	function selectMode(mode) {
		selectedMode = mode;
		const config = modeConfig[mode];
		groupBy = config.defaultGroup;
		clearFilters();
	}

	// --- Grouping & Filtering ---
	let groupBy = $state('Neighborhood');
	let activeFilters = $state({ Neighborhood: new Set(), Category: new Set(), Type: new Set(), Cuisine: new Set() });

	let currentFilterFields = $derived(modeConfig[selectedMode].filterFields);
	let currentGroupOptions = $derived(modeConfig[selectedMode].groupOptions);

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

	function toggleFilterValue(field, value) {
		const s = activeFilters[field];
		if (s.has(value)) {
			s.delete(value);
		} else {
			s.add(value);
		}
		activeFilters = { ...activeFilters };
	}

	function filterCount(field) {
		return activeFilters[field]?.size || 0;
	}

	function clearFilters() {
		activeFilters = { Neighborhood: new Set(), Category: new Set(), Type: new Set(), Cuisine: new Set() };
	}

	let hasActiveFilters = $derived(
		currentFilterFields.some((f) => activeFilters[f]?.size > 0)
	);

	let totalFilterCount = $derived(
		currentFilterFields.reduce((sum, f) => sum + (activeFilters[f]?.size || 0), 0)
	);

	let filteredPlaces = $derived(
		$places.filter((p) => {
			if (!p.Name) return false;
			// Mode filter
			if (selectedMode !== 'All' && p.Mode !== selectedMode) return false;
			for (const field of currentFilterFields) {
				const selected = activeFilters[field];
				if (!selected || selected.size === 0) continue;
				const val = p[field];
				if (Array.isArray(val)) {
					if (!val.some((v) => selected.has(v))) return false;
				} else {
					if (!selected.has(val)) return false;
				}
			}
			return true;
		})
	);

	const groupSortOrders = {
		Category: ['Casual', 'Elevated', 'Fancy'],
		Type: ['Restaurant', 'Bakery', 'Coffee', 'Bar', 'Shop']
	};

	let groupedPlaces = $derived(() => {
		const groups = {};
		filteredPlaces.forEach((p) => {
			const key = getGroupValue(p, groupBy);
			if (!groups[key]) groups[key] = [];
			groups[key].push(p);
		});

		const keys = Object.keys(groups);
		const order = groupSortOrders[groupBy];
		if (order) {
			keys.sort((a, b) => {
				const ai = order.indexOf(a);
				const bi = order.indexOf(b);
				// Known values first in order, unknown values at end alphabetically
				if (ai !== -1 && bi !== -1) return ai - bi;
				if (ai !== -1) return -1;
				if (bi !== -1) return 1;
				return a.localeCompare(b);
			});
		} else {
			keys.sort((a, b) => a.localeCompare(b));
		}

		const sorted = {};
		keys.forEach((k) => { sorted[k] = groups[k]; });
		return sorted;
	});

	function stars(n) {
		return n ? ' ' + '*'.repeat(n) : '';
	}

	function tags(place) {
		const parts = [];
		// Neighborhood always first
		if (groupBy !== 'Neighborhood' && place.Neighborhood) {
			const hoods = Array.isArray(place.Neighborhood) ? place.Neighborhood : [place.Neighborhood];
			hoods.forEach((v, i) => parts.push({ value: v, field: 'Neighborhood', index: i }));
		}
		if (place.Cuisine) {
			const cuisines = Array.isArray(place.Cuisine) ? place.Cuisine : [place.Cuisine];
			cuisines.forEach((v, i) => parts.push({ value: v, field: 'Cuisine', index: i }));
		}
		if (groupBy !== 'Category' && place.Category) {
			parts.push({ value: place.Category, field: 'Category', index: 0 });
		}
		if (groupBy !== 'Type' && place.Type) {
			parts.push({ value: place.Type, field: 'Type', index: 0 });
		}
		return parts;
	}

	let editingTag = $state(null);

	function toggleTagEdit(placeId, field, index) {
		if (editingTag && editingTag.placeId === placeId && editingTag.field === field && editingTag.index === index) {
			editingTag = null;
		} else {
			editingTag = { placeId, field, index };
		}
	}

	async function updateTag(place, field, index, newValue) {
		const current = place[field];
		let updated;
		if (Array.isArray(current)) {
			updated = [...current];
			updated[index] = newValue;
		} else {
			updated = newValue;
		}

		const res = await fetch('/api/places', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: place.id, fields: { [field]: updated } })
		});

		if (res.ok) {
			const result = await res.json();
			const idx = $places.findIndex((p) => p.id === place.id);
			if (idx !== -1) {
				$places[idx] = result;
				$places = [...$places];
			}
		}
	}

	async function togglePin(place) {
		const newPinned = !place.Pinned;
		const res = await fetch('/api/places', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: place.id, fields: { Pinned: newPinned } })
		});
		if (res.ok) {
			const idx = $places.findIndex((p) => p.id === place.id);
			if (idx !== -1) {
				$places[idx] = { ...$places[idx], Pinned: newPinned };
				$places = [...$places];
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<main onclick={(e) => { if (!e.target.closest('.tag-wrap')) editingTag = null; if (!e.target.closest('h1')) showCityPicker = false; if (!e.target.closest('.group-picker')) showGroupPicker = false; }}>
	<div class="sticky-header" bind:this={stickyHeaderEl}>
		<header>
			<h1>
				<span class="city-title" onclick={() => { showCityPicker = !showCityPicker; }}>{$selectedCity} <span class="chevron">&#9662;</span></span>
				{#if showCityPicker}
					<div class="city-dropdown">
						{#each cities as c}
							<button class:active={$selectedCity === c} onclick={() => { selectCity(c); showCityPicker = false; }}>{c}</button>
						{/each}
					</div>
				{/if}
			</h1>
			<div class="header-actions">
				<button class="add-btn" class:has-selections={hasActiveFilters} onclick={() => { showFilterModal = true; }}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
					{#if hasActiveFilters}<span class="header-badge">{totalFilterCount}</span>{/if}
				</button>
				<button class="add-btn" onclick={() => { if (showAddForm) { resetForm(); } else { showAddForm = true; } }}>
					{showAddForm ? '\u00d7' : '+'}
				</button>
			</div>
		</header>

		<div class="controls-wrapper" class:controls-hidden={!controlsVisible} class:controls-settled={controlsSettled}>
			<div class="controls">
				<div class="group-by">
					{#each modes as mode}
						<button class:active={selectedMode === mode} onclick={() => selectMode(mode)}>
							{mode}
						</button>
					{/each}
				</div>

				{#if viewMode === 'list'}
					<div class="group-by-select">
						<div class="group-by-left">
							<span class="label">Group by</span>
							<span class="group-picker" onclick={() => { showGroupPicker = !showGroupPicker; }}>
								{groupBy} <span class="chevron group-chevron">&#9662;</span>
								{#if showGroupPicker}
									<div class="group-dropdown">
										{#each currentGroupOptions as field}
											<button class:active={groupBy === field} onclick={(e) => { e.stopPropagation(); groupBy = field; showGroupPicker = false; }}>{field}</button>
										{/each}
									</div>
								{/if}
							</span>
						</div>
						<button class="list-style-toggle" onclick={() => { listStyle = listStyle === 'compact' ? 'cards' : 'compact'; }}>
							{#if listStyle === 'compact'}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
							{:else}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#snippet placeList(items)}
		{#if listStyle === 'cards'}
			{@render placeCards(items)}
		{:else}
			<ul class="compact-list">
				{#each items as place}
					<li class:pinned={place.Pinned}>
						<a class="place-name" href={`https://www.google.com/search?q=${encodeURIComponent(place.Name + ' ' + $selectedCity)}`} target="_blank" rel="noopener"><strong>{place.Name}</strong></a>{stars(place.Stars)}
						{#if place.Description}
							<span class="desc"> — {place.Description}</span>
						{/if}
						{#each tags(place) as tag}
							<span class="tag-wrap">
								<span
									class="tag-pill"
									onclick={() => toggleTagEdit(place.id, tag.field, tag.index)}
								>{tag.value}</span>
								{#if editingTag && editingTag.placeId === place.id && editingTag.field === tag.field && editingTag.index === tag.index}
									<div class="tag-dropdown">
										{#each getFilterOptions(tag.field) as opt}
											<button
												class:active={opt === tag.value}
												onclick={() => { updateTag(place, tag.field, tag.index, opt); editingTag = null; }}
											>{opt}</button>
										{/each}
									</div>
								{/if}
							</span>
						{/each}
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}

	{#snippet placeCards(items)}
		<div class="card-list">
			{#each items as place}
				<div class="place-card" class:pinned={place.Pinned}>
					<button class="pin-btn" class:pinned={place.Pinned} onclick={() => togglePin(place)} title={place.Pinned ? 'Unpin' : 'Pin'}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill={place.Pinned ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
					</button>
					<div class="card-photo">
						{#if place.Photo}
							<img
								src={`/api/photo?ref=${encodeURIComponent(place.Photo)}&maxWidthPx=120&maxHeightPx=120`}
								alt={place.Name}
								loading="lazy"
							/>
						{/if}
					</div>
					<div class="card-content">
						<div class="card-header">
							<a class="place-name" href={`https://www.google.com/search?q=${encodeURIComponent(place.Name + ' ' + $selectedCity)}`} target="_blank" rel="noopener"><strong>{place.Name}</strong></a>{stars(place.Stars)}
						</div>
						{#if place.GoogleRating || place.TabelogRating || place.PriceLevel}
							<div class="card-ratings">
								{#if place.GoogleRating}
									<span class="card-rating">{place.GoogleRating}<span class="rating-star">&#9733;</span></span>
								{/if}
								{#if place.TabelogRating}
									<span class="card-rating tabelog">T {place.TabelogRating}</span>
								{/if}
								{#if place.PriceLevel}
									<span class="card-price">{place.PriceLevel}</span>
								{/if}
							</div>
						{/if}
						{#if place.Description}
							<p class="card-desc">{place.Description}</p>
						{/if}
						<div class="card-tags">
							{#each tags(place) as tag}
								<span class="tag-wrap">
									<span
										class="tag-pill"
										onclick={() => toggleTagEdit(place.id, tag.field, tag.index)}
									>{tag.value}</span>
									{#if editingTag && editingTag.placeId === place.id && editingTag.field === tag.field && editingTag.index === tag.index}
										<div class="tag-dropdown">
											{#each getFilterOptions(tag.field) as opt}
												<button
													class:active={opt === tag.value}
													onclick={() => { updateTag(place, tag.field, tag.index, opt); editingTag = null; }}
												>{opt}</button>
											{/each}
										</div>
									{/if}
								</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/snippet}

	{#if viewMode === 'map'}
		{#if browser}
			<MapView
				places={filteredPlaces}
				accessToken={env.PUBLIC_MAPBOX_TOKEN}
				city={$selectedCity}
				onTogglePin={togglePin}
			/>
		{/if}
	{:else}
		<section>
			{#if filteredPlaces.length === 0}
				<div class="empty-state">No places yet</div>
			{:else}
				{@const groups = groupedPlaces()}
				{#each Object.entries(groups) as [group, items]}
					<h3 class="group-heading">{group}</h3>
					{#if selectedMode === 'All'}
						{@const foodItems = items.filter(p => p.Mode === 'Food & Drink')}
						{@const activityItems = items.filter(p => p.Mode === 'Things to Do')}
						{#if activityItems.length > 0}
							<h4 class="subsection-heading">Things to Do</h4>
							{@render placeList(activityItems)}
						{/if}
						{#if foodItems.length > 0}
							<h4 class="subsection-heading">Food & Drink</h4>
							{@render placeList(foodItems)}
						{/if}
					{:else}
						{@render placeList(items)}
					{/if}
				{/each}
			{/if}
		</section>
	{/if}
</main>

<button class="view-toggle-pill" onclick={() => { viewMode = viewMode === 'list' ? 'map' : 'list'; }}>
	{#if viewMode === 'list'}
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
		Map
	{:else}
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
		List
	{/if}
</button>

{#if showAddForm}
	<div class="modal-overlay">
		<div class="modal">
			<header>
				<h1>Add Place</h1>
				<button class="add-btn" onclick={resetForm}>&times;</button>
			</header>
				<div class="row">
					<input
						bind:value={addName}
						placeholder="Place name..."
						disabled={enriching}
					/>
					<button class="enrich-btn" onclick={enrich} disabled={enriching || !addName.trim()}>
						{enriching ? 'Loading...' : 'Enrich'}
					</button>
				</div>
				<p class="city-label">City: {$selectedCity}</p>

				{#if duplicateWarning}
					<p class="duplicate-warning">⚠ "{duplicateWarning}" already exists in your list</p>
				{/if}

				{#if enriched}
					<div class="fields">
						{#if enriched.photoReference}
							<img
								src={`/api/photo?ref=${encodeURIComponent(enriched.photoReference)}&maxWidthPx=560`}
								alt={addName}
								class="enriched-photo"
							/>
						{/if}
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
							<select bind:value={enriched.category}>
								<option value="">—</option>
								{#each fieldOptions.Category || [] as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</label>
						<label>
							Type
							<select bind:value={enriched.type}>
								<option value="">—</option>
								{#each fieldOptions.Type || [] as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</label>
						<label>
							Stars (Michelin)
							<select bind:value={enriched.stars}>
								<option value={0}>None</option>
								<option value={1}>*</option>
								<option value={2}>**</option>
								<option value={3}>***</option>
							</select>
						</label>
						{#if enriched.priceLevel}
							<label>
								Price Level
								<input bind:value={enriched.priceLevel} />
							</label>
						{/if}
						<label>
							Description
							<input bind:value={enriched.description} />
						</label>
						{#if enriched.hours}
							<label>
								Hours
								<textarea bind:value={enriched.hours} rows="4" readonly></textarea>
							</label>
						{/if}
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
	</div>
{/if}

{#if showFilterModal}
	<div class="modal-overlay">
		<div class="modal">
			<header>
				<h1>Filters</h1>
				<div class="header-actions">
					<button class="reset-link" class:inactive={!hasActiveFilters} onclick={clearFilters}>Reset</button>
					<button class="add-btn" onclick={() => { showFilterModal = false; }}>&times;</button>
				</div>
			</header>

			{#each currentFilterFields as field}
				<div class="filter-section">
					<h3 class="filter-section-title">{field}</h3>
					<div class="filter-options">
						{#each getFilterOptions(field) as opt}
							<button
								class="filter-pill"
								class:active={activeFilters[field]?.has(opt)}
								onclick={() => toggleFilterValue(field, opt)}
							>
								{opt}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.view-toggle-pill {
		position: fixed;
		bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
		left: 50%;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 1rem 1.75rem;
		background: #111;
		color: white;
		border: none;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 500;
		font-family: system-ui, -apple-system, sans-serif;
		cursor: pointer;
		box-shadow: 0 2px 12px rgba(0,0,0,0.25);
	}

	main {
		max-width: 600px;
		margin: 0 auto;
		padding: 1rem;
		padding-top: 0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.sticky-header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: white;
		padding-top: calc(0.5rem + env(safe-area-inset-top, 0px));
		padding-bottom: 0;
		margin: 0 calc(-1rem - 8px);
		padding-left: 1rem;
		padding-right: 1rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.modal > header {
		margin-bottom: 1.25rem;
	}


	header h1 {
		margin: 0;
		position: relative;
		min-width: 0;
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

	.header-actions {
		display: flex;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.add-btn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 1px solid #ccc;
		background: white;
		color: #111;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		-webkit-appearance: none;
	}

	.add-btn.has-selections {
		background: #111;
		border-color: #111;
		color: white;
		stroke: white;
	}

	.header-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		background: #111;
		color: white;
		font-size: 0.55rem;
		font-weight: 600;
		border-radius: 50%;
		width: 16px;
		height: 16px;
		line-height: 16px;
		text-align: center;
		border: 2px solid white;
	}

	.add-btn.has-selections .header-badge {
		background: white;
		color: #111;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: white;
		z-index: 200;
		overflow-y: auto;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.modal {
		max-width: 600px;
		margin: 0 auto;
		padding: 1rem;
		padding-top: calc(1rem + env(safe-area-inset-top, 0px));
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
		font-size: 1rem;
	}

	.enrich-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #111;
		border-radius: 6px;
		background: #111;
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.enrich-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.duplicate-warning {
		margin: 0.5rem 0 0;
		padding: 0.4rem 0.6rem;
		background: #fff3cd;
		color: #856404;
		border-radius: 6px;
		font-size: 0.8rem;
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

	.enriched-photo {
		width: 100%;
		max-height: 200px;
		object-fit: cover;
		border-radius: 8px;
	}

	.fields textarea {
		padding: 0.4rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 0.85rem;
		background: #f5f5f5;
		resize: none;
		font-family: inherit;
	}

	.fields input,
	.fields select {
		padding: 0.4rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		font-size: 0.9rem;
		background: white;
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

	.controls-wrapper {
		display: grid;
		grid-template-rows: 1fr;
		padding-bottom: 1rem;
		overflow: hidden;
		transition: grid-template-rows 0.25s ease, padding-bottom 0.25s ease;
	}

	.controls-wrapper.controls-settled {
		overflow: visible;
	}

	.controls-wrapper.controls-hidden {
		grid-template-rows: 0fr;
		padding-bottom: 0;
	}

	.controls {
		overflow: visible;
		min-height: 0;
	}

	.group-by {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.controls .label {
		font-size: 0.9rem;
		color: #888;
	}

	.group-by button {
		padding: 0.45rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: white;
		color: #333;
		cursor: pointer;
		font-size: 0.75rem;
	}

	.group-by button.active {
		background: #111;
		color: white;
		border-color: #111;
	}

	.group-by-select {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-top: 0.75rem;
	}

	.group-by-left {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}

	.list-style-toggle {
		background: none;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 0.25rem 0.35rem;
		cursor: pointer;
		color: #666;
		display: flex;
		align-items: center;
	}

	.group-chevron {
		font-size: 0.85em;
		vertical-align: baseline;
	}

	.group-picker {
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		color: #333;
		position: relative;
	}

	.group-dropdown {
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
		min-width: 140px;
		margin-top: 4px;
	}

	.group-dropdown button {
		padding: 0.6rem 1rem;
		border: none;
		background: none;
		text-align: left;
		font-size: 0.85rem;
		cursor: pointer;
		color: #333;
	}

	.group-dropdown button:hover {
		background: #f5f5f5;
	}

	.group-dropdown button.active {
		font-weight: 600;
	}

	.filter-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		background: #fafafa;
		border-radius: 6px;
		border: 1px solid #eee;
	}

	.filter-pill {
		padding: 0.5rem 0.85rem;
		border: 1px solid #ddd;
		border-radius: 999px;
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

	.filter-section {
		margin-bottom: 1.25rem;
	}

	.filter-section-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #555;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin: 0 0 0.5rem;
	}

	.reset-link {
		border: none;
		background: none;
		color: #333;
		cursor: pointer;
		font-size: 0.85rem;
		text-decoration: underline;
		font-weight: 600;
		padding: 0;
		margin-right: 0.5rem;
	}

	.reset-link.inactive {
		color: #ccc;
	}

	.empty-state {
		background: #ececec;
		border-radius: 12px;
		color: #999;
		text-align: center;
		padding: 4rem 1rem;
		font-size: 0.9rem;
		margin: 0.5rem -8px 0;
	}

	.group-heading {
		font-size: 0.85rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 calc(-1rem - 8px) 0.25rem;
		padding: 0.4rem 1rem;
		position: sticky;
		top: var(--sticky-header-height, 0px);
		z-index: 5;
	}

	@media (max-width: 600px) {
		.group-heading, .subsection-heading {
			margin-left: calc(-1rem - 8px - env(safe-area-inset-left, 0px));
			margin-right: calc(-1rem - 8px - env(safe-area-inset-right, 0px));
			padding-left: calc(1rem + env(safe-area-inset-left, 0px));
			padding-right: calc(1rem + env(safe-area-inset-right, 0px));
		}
	}

	.group-heading {
		color: #555;
		background: #f5f5f5;
	}

	.subsection-heading {
		font-size: 0.7rem;
		font-weight: 600;
		color: #5a7a9b;
		background: #eef3f8;
		margin: 0.4rem calc(-1rem - 8px) 0.15rem;
		padding: 0.25rem 1rem;
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

	.place-name {
		text-decoration: none;
		color: inherit;
	}

	.compact-list .desc {
		color: #555;
	}

	.tag-wrap {
		position: relative;
		display: inline;
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
		cursor: pointer;
	}

	.tag-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
		z-index: 20;
		display: flex;
		flex-direction: column;
		max-height: 200px;
		overflow-y: auto;
		min-width: 140px;
	}

	.tag-dropdown button {
		padding: 0.4rem 0.6rem;
		border: none;
		background: none;
		text-align: left;
		font-size: 0.75rem;
		cursor: pointer;
		color: #333;
	}

	.tag-dropdown button:hover {
		background: #f5f5f5;
	}

	.tag-dropdown button.active {
		font-weight: 600;
	}

	/* ── Card view ── */

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.25rem 0 0.5rem;
	}

	.place-card {
		position: relative;
		display: flex;
		gap: 0.6rem;
		padding: 0.5rem;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		background: white;
	}

	.card-photo {
		width: 60px;
		height: 60px;
		flex-shrink: 0;
		border-radius: 6px;
		overflow: hidden;
		background: #eee;
	}

	.card-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.card-content {
		flex: 1;
		min-width: 0;
	}

	.card-header {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.15rem;
	}

	.card-price {
		font-size: 0.7rem;
		color: #888;
	}

	.card-ratings {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.1rem;
	}

	.card-rating {
		font-size: 0.7rem;
		color: #666;
	}

	.rating-star {
		color: #f5a623;
		margin-left: 1px;
	}

	.card-rating.tabelog {
		color: #888;
	}

	.card-desc {
		font-size: 0.75rem;
		color: #555;
		margin: 0.15rem 0 0.2rem;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin-left: -0.35rem;
	}

	/* ── Pinned states ── */

	.pin-btn {
		position: absolute;
		top: 0.2rem;
		right: 0.2rem;
		background: none;
		border: none;
		cursor: pointer;
		color: #ccc;
		padding: 0.65rem;
		line-height: 1;
		border-radius: 3px;
		-webkit-tap-highlight-color: transparent;
	}

	.pin-btn:hover {
		color: #999;
	}

	.pin-btn.pinned {
		color: #d4a017;
	}

	.place-card.pinned {
		background: #fffbf0;
		border-color: #f0e6c8;
	}

	.compact-list li.pinned .place-name strong {
		color: #b8860b;
	}
</style>
