import { json } from '@sveltejs/kit';
import { fetchFieldOptions } from '$lib/server/supabase.js';

export async function GET() {
	try {
		const options = await fetchFieldOptions();
		return json(options);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
