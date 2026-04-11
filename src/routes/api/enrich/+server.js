import { json } from '@sveltejs/kit';
import { fetchFieldOptions } from '$lib/server/airtable.js';
import { enrichPlace } from '$lib/server/enrich.js';

export async function POST({ request }) {
	const { name, city } = await request.json();

	if (!name || !city) {
		return json({ error: 'name and city are required' }, { status: 400 });
	}

	try {
		const fieldOptions = await fetchFieldOptions();
		const result = await enrichPlace(name, city, fieldOptions);
		return json(result);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
