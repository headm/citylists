import { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } from '$env/static/private';

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

const headers = {
	Authorization: `Bearer ${AIRTABLE_TOKEN}`,
	'Content-Type': 'application/json'
};

/**
 * Fetch places from Airtable, optionally filtered by city.
 * Returns flat objects with `id` plus all fields.
 */
export async function fetchPlaces(city) {
	const url = new URL(BASE_URL);

	if (city) {
		url.searchParams.set('filterByFormula', `{City} = "${city}"`);
	}

	url.searchParams.set('pageSize', '100');

	const response = await fetch(url, { headers });

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable fetch failed (${response.status}): ${body}`);
	}

	const data = await response.json();

	return data.records.map((record) => ({
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
