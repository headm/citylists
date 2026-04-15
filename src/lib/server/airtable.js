import { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } from '$env/static/private';

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
const CANDIDATES_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent('Candidates')}`;

const headers = {
	Authorization: `Bearer ${AIRTABLE_TOKEN}`,
	'Content-Type': 'application/json'
};

/**
 * Fetch places from Airtable, optionally filtered by city.
 * Returns flat objects with `id` plus all fields.
 */
export async function fetchPlaces(city) {
	const allRecords = [];
	let offset;

	do {
		const url = new URL(BASE_URL);

		if (city) {
			url.searchParams.set('filterByFormula', `{City} = "${city}"`);
		}

		url.searchParams.set('pageSize', '100');
		if (offset) url.searchParams.set('offset', offset);

		const response = await fetch(url, { headers });

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Airtable fetch failed (${response.status}): ${body}`);
		}

		const data = await response.json();
		allRecords.push(...data.records);
		offset = data.offset;
	} while (offset);

	return allRecords.map((record) => ({
		id: record.id,
		...record.fields
	}));
}

/**
 * Fetch distinct neighborhood values for a given city from existing records.
 */
export async function fetchNeighborhoodsForCity(city) {
	const url = new URL(BASE_URL);
	url.searchParams.set('filterByFormula', `{City} = "${city}"`);
	url.searchParams.set('fields[]', 'Neighborhood');
	url.searchParams.set('pageSize', '100');

	const neighborhoods = new Set();
	let offset;

	do {
		if (offset) url.searchParams.set('offset', offset);
		const response = await fetch(url, { headers });
		if (!response.ok) break;
		const data = await response.json();
		data.records.forEach((r) => {
			const val = r.fields.Neighborhood;
			if (Array.isArray(val)) val.forEach((v) => neighborhoods.add(v));
			else if (val) neighborhoods.add(val);
		});
		offset = data.offset;
	} while (offset);

	return [...neighborhoods].sort();
}

/**
 * Fetch select field options from the Airtable table schema.
 * Returns an object like { Neighborhood: ["Mission", ...], Cuisine: [...], ... }
 */
export async function fetchFieldOptions() {
	const url = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable schema fetch failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	const table = data.tables.find((t) => t.name === AIRTABLE_TABLE_NAME);
	if (!table) return {};

	const options = {};
	for (const field of table.fields) {
		if (field.options?.choices) {
			options[field.name] = field.options.choices.map((c) => c.name);
		}
	}
	return options;
}

/**
 * Create a new place in Airtable.
 * Returns the created record as a flat object.
 */
/**
 * Update fields on an existing Airtable record.
 */
export async function updatePlace(id, fields) {
	const response = await fetch(`${BASE_URL}/${id}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ fields, typecast: true })
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable update failed (${response.status}): ${body}`);
	}

	const data = await response.json();

	return {
		id: data.id,
		...data.fields
	};
}

export async function createPlace(fields) {
	const response = await fetch(BASE_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({ fields, typecast: true })
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable create failed (${response.status}): ${body}`);
	}

	const data = await response.json();

	return {
		id: data.id,
		...data.fields
	};
}

// ── Candidates table ──

/**
 * Fetch candidates, optionally filtered by city and status.
 */
export async function fetchCandidates(city, status = 'Pending') {
	const allRecords = [];
	let offset;

	do {
		const url = new URL(CANDIDATES_URL);
		const parts = [];
		if (city) parts.push(`{City} = "${city}"`);
		if (status) parts.push(`{Status} = "${status}"`);
		if (parts.length) {
			url.searchParams.set('filterByFormula', parts.length === 1 ? parts[0] : `AND(${parts.join(', ')})`);
		}
		url.searchParams.set('pageSize', '100');
		if (offset) url.searchParams.set('offset', offset);

		const response = await fetch(url, { headers });
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Airtable candidates fetch failed (${response.status}): ${body}`);
		}
		const data = await response.json();
		allRecords.push(...data.records);
		offset = data.offset;
	} while (offset);

	return allRecords.map((record) => ({ id: record.id, ...record.fields }));
}

/**
 * Fetch a single candidate by ID.
 */
export async function fetchCandidateById(id) {
	const response = await fetch(`${CANDIDATES_URL}/${id}`, { headers });
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable candidate fetch failed (${response.status}): ${body}`);
	}
	const data = await response.json();
	return { id: data.id, ...data.fields };
}

/**
 * Create a new candidate record.
 */
export async function createCandidate(fields) {
	const response = await fetch(CANDIDATES_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({ fields, typecast: true })
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable candidate create failed (${response.status}): ${body}`);
	}
	const data = await response.json();
	return { id: data.id, ...data.fields };
}

/**
 * Update a candidate record.
 */
export async function updateCandidate(id, fields) {
	const response = await fetch(`${CANDIDATES_URL}/${id}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ fields, typecast: true })
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable candidate update failed (${response.status}): ${body}`);
	}
	const data = await response.json();
	return { id: data.id, ...data.fields };
}
