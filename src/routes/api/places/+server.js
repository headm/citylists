import { json } from '@sveltejs/kit';
import { fetchPlaces, createPlace } from '$lib/server/airtable.js';

export async function GET({ url }) {
	const city = url.searchParams.get('city') || undefined;

	try {
		const places = await fetchPlaces(city);
		return json(places);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}

export async function POST({ request }) {
	const fields = await request.json();

	try {
		const place = await createPlace(fields);
		return json(place, { status: 201 });
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
