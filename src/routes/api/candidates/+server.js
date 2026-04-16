import { json } from '@sveltejs/kit';
import { fetchCandidates } from '$lib/server/supabase.js';

export async function GET({ url }) {
	const city = url.searchParams.get('city') || undefined;
	const status = url.searchParams.get('status') || 'Pending';

	try {
		const candidates = await fetchCandidates(city, status);
		return json(candidates);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
