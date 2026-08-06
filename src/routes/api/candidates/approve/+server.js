import { json } from '@sveltejs/kit';
import { fetchCandidateById, updateCandidate, createPlace, fetchPlaces, fetchFieldOptions, fetchNeighborhoodsForCity } from '$lib/server/supabase.js';
import { enrichPlace } from '$lib/server/enrich.js';

function normalize(s) {
	return s.toLowerCase().replace(/[''`\-\.]/g, '').replace(/\s+/g, ' ').trim();
}

export async function POST({ request }) {
	const { id } = await request.json();
	if (!id) return json({ error: 'id is required' }, { status: 400 });

	try {
		// Fetch the candidate
		const candidate = await fetchCandidateById(id);

		// Check for duplicates in Places table
		const existingPlaces = await fetchPlaces(candidate.City);
		const candidateName = normalize(candidate.Name);
		const duplicate = existingPlaces.find((p) => normalize(p.Name) === candidateName);
		if (duplicate) {
			// Auto-dismiss the duplicate candidate
			await updateCandidate(id, { Status: 'Dismissed' });
			return json({ error: `"${candidate.Name}" already exists in your places list` }, { status: 409 });
		}

		// Run full enrichment (Claude classification + Google Places)
		const [fieldOptions, cityNeighborhoods] = await Promise.all([
			fetchFieldOptions(),
			fetchNeighborhoodsForCity(candidate.City)
		]);
		fieldOptions.Neighborhood = cityNeighborhoods;

		const enriched = await enrichPlace(candidate.Name, candidate.City, fieldOptions);

		// Build place fields, preferring enriched data but falling back to candidate data
		const fields = {
			Name: enriched.correctedName || candidate.Name,
			City: candidate.City,
			Mode: enriched.mode || 'Food & Drink',
			Neighborhood: enriched.neighborhood ? [].concat(enriched.neighborhood) : [],
			Cuisine: enriched.cuisine ? [].concat(enriched.cuisine) : [],
			Category: enriched.category || '',
			Type: enriched.type || '',
			Description: enriched.description || candidate.Description || '',
			Stars: enriched.stars || 0,
			Address: enriched.address || candidate.Address || '',
			Lat: enriched.lat || candidate.Lat || null,
			Lng: enriched.lng || candidate.Lng || null,
			Photo: enriched.placeId || candidate.Photo || '',
			PriceLevel: enriched.priceLevel || candidate.PriceLevel || '',
			Hours: enriched.hours || candidate.Hours || '',
			URL: enriched.url || '',
			GoogleRating: enriched.googleRating || null
		};

		// Create in Places table
		const place = await createPlace(fields);

		// Mark candidate as approved
		await updateCandidate(id, { Status: 'Approved' });

		return json(place);
	} catch (err) {
		return json({ error: err.message }, { status: 502 });
	}
}
