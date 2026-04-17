import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!PLACES_KEY) {
	console.error('GOOGLE_PLACES_API_KEY must be set in .env');
	process.exit(1);
}

const city = process.argv[2];
const filterQuery = city
	? supabase.from('places').select('id, name, city, google_rating').eq('city', city).is('google_rating', null)
	: supabase.from('places').select('id, name, city, google_rating').is('google_rating', null);

const { data: places, error } = await filterQuery;
if (error) {
	console.error('Fetch error:', error.message);
	process.exit(1);
}

console.log(`Found ${places.length} places without Google rating${city ? ` in ${city}` : ''}`);

let updated = 0;
for (const place of places) {
	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': PLACES_KEY,
				'X-Goog-FieldMask': 'places.displayName,places.rating'
			},
			body: JSON.stringify({ textQuery: `${place.name}, ${place.city}` })
		});

		if (!res.ok) {
			console.log(`  ✗ ${place.name}: API error (${res.status})`);
			continue;
		}

		const data = await res.json();
		const rating = data.places?.[0]?.rating;

		if (rating) {
			await supabase.from('places').update({ google_rating: rating }).eq('id', place.id);
			console.log(`  ${place.name}: ${rating}`);
			updated++;
		} else {
			console.log(`  ${place.name}: no rating found`);
		}
	} catch (err) {
		console.log(`  ✗ ${place.name}: ${err.message}`);
	}

	// Rate limit
	await new Promise((r) => setTimeout(r, 100));
}

console.log(`\nDone! Updated ${updated}/${places.length} places.`);
