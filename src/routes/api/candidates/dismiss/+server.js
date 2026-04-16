import { json } from '@sveltejs/kit';
import { updateCandidate } from '$lib/server/supabase.js';

export async function POST({ request }) {
	const { id } = await request.json();
	if (!id) return json({ error: 'id is required' }, { status: 400 });

	try {
		await updateCandidate(id, { Status: 'Dismissed' });
		return json({ ok: true });
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
