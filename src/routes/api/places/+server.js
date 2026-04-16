import { json } from '@sveltejs/kit';
import { fetchPlaces, createPlace, updatePlace } from '$lib/server/supabase.js';

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

export async function PATCH({ request }) {
	const { id, fields } = await request.json();

	if (!id) {
		return json({ error: 'id is required' }, { status: 400 });
	}

	try {
		const place = await updatePlace(id, fields);
		return json(place);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
