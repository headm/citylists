import 'dotenv/config';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

const PRICE_LEVEL_MAP = {
	PRICE_LEVEL_FREE: 'Free',
	PRICE_LEVEL_INEXPENSIVE: '$',
	PRICE_LEVEL_MODERATE: '$$',
	PRICE_LEVEL_EXPENSIVE: '$$$',
	PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

// --- Fetch all NYC records ---
async function fetchNYCRecords() {
	let all = [];
	let offset = null;
	do {
		const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`);
		url.searchParams.set('pageSize', '100');
		url.searchParams.set('filterByFormula', `{City} = "New York"`);
		if (offset) url.searchParams.set('offset', offset);
		const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
		const data = await res.json();
		all.push(...data.records);
		offset = data.offset;
	} while (offset);
	return all;
}

// --- Google Places search ---
async function searchGooglePlaces(name, city) {
	const fieldMask = [
		'places.id',
		'places.displayName',
		'places.formattedAddress',
		'places.location',
		'places.priceLevel',
		'places.currentOpeningHours',
		'places.photos',
		'places.websiteUri',
		'places.googleMapsUri'
	].join(',');

	const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
			'X-Goog-FieldMask': fieldMask
		},
		body: JSON.stringify({ textQuery: `${name}, ${city}` })
	});

	if (!response.ok) return null;
	const data = await response.json();
	if (!data.places?.length) return null;

	const place = data.places[0];
	return {
		address: place.formattedAddress || null,
		lat: place.location?.latitude || null,
		lng: place.location?.longitude || null,
		priceLevel: PRICE_LEVEL_MAP[place.priceLevel] || null,
		hours: place.currentOpeningHours?.weekdayDescriptions?.join('\n') || null,
		placeId: place.id || null,
		url: place.websiteUri || place.googleMapsUri || null
	};
}

// Photo storage is just the durable place ID now. Never build a media URL with the
// API key in it — that key used to end up in the database and get served to clients.
// Image bytes are cached by scripts/backfill-photos.js; see src/lib/server/photos.js.

// --- Geocode via Mapbox fallback ---
async function geocode(name, address) {
	if (!MAPBOX_ACCESS_TOKEN) return null;
	try {
		if (address) {
			const res = await fetch(
				`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
			);
			if (res.ok) {
				const data = await res.json();
				if (data.features?.length) {
					const [lng, lat] = data.features[0].center;
					return { lat, lng };
				}
			}
		}
		const res = await fetch(
			`https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(name + ' New York')}&access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&types=poi&language=en`
		);
		if (res.ok) {
			const data = await res.json();
			if (data.features?.length) {
				const [lng, lat] = data.features[0].geometry.coordinates;
				return { lat, lng };
			}
		}
	} catch {}
	return null;
}

// --- Update Airtable batch ---
async function updateBatch(batch) {
	const response = await fetch(
		`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE)}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ records: batch, typecast: true })
		}
	);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable update failed (${response.status}): ${body}`);
	}
	return response.json();
}

// --- Main ---
console.log('Fetching NYC records...');
const records = await fetchNYCRecords();
console.log(`Found ${records.length} NYC records`);

// Filter to records missing key fields
const needsUpdate = records.filter((r) => {
	const f = r.fields;
	return !f.Lat || !f.Lng || !f.Address || !f.Photo;
});
console.log(`${needsUpdate.length} records need Google Places data`);

const updates = [];
let success = 0;
let failed = 0;

for (let i = 0; i < needsUpdate.length; i++) {
	const record = needsUpdate[i];
	const name = record.fields.Name;
	console.log(`  [${i + 1}/${needsUpdate.length}] ${name}...`);

	try {
		const gp = await searchGooglePlaces(name, 'New York City');

		const fields = {};

		if (gp) {
			if (gp.address && !record.fields.Address) fields.Address = gp.address;
			if (gp.lat && gp.lng && !record.fields.Lat) {
				fields.Lat = gp.lat;
				fields.Lng = gp.lng;
			}
			if (gp.priceLevel && !record.fields.PriceLevel) fields.PriceLevel = gp.priceLevel;
			if (gp.hours && !record.fields.Hours) fields.Hours = gp.hours;
			if (gp.placeId && !record.fields.Photo) fields.Photo = gp.placeId;
			if (gp.url && !record.fields.URL) fields.URL = gp.url;
		}

		// Fallback geocoding if still no coords
		if (!fields.Lat && !record.fields.Lat) {
			const geo = await geocode(name, gp?.address || record.fields.Address);
			if (geo) {
				fields.Lat = geo.lat;
				fields.Lng = geo.lng;
			}
		}

		if (Object.keys(fields).length > 0) {
			updates.push({ id: record.id, fields });
			success++;
			console.log(`    ✓ ${Object.keys(fields).join(', ')}`);
		} else {
			console.log(`    — no new data`);
		}
	} catch (err) {
		console.log(`    ✗ ${err.message}`);
		failed++;
	}

	// Rate limit: Google Places allows ~10 QPS, be conservative
	if ((i + 1) % 5 === 0) await new Promise((r) => setTimeout(r, 500));
}

// Upload updates in batches of 10
console.log(`\nUpdating ${updates.length} records in Airtable...`);
for (let i = 0; i < updates.length; i += 10) {
	const batch = updates.slice(i, i + 10);
	await updateBatch(batch);
	console.log(`  Batch ${Math.floor(i / 10) + 1}: ${batch.length} records updated`);
	if (i + 10 < updates.length) await new Promise((r) => setTimeout(r, 250));
}

console.log(`\nDone! Updated: ${success}, Failed: ${failed}, Skipped: ${needsUpdate.length - success - failed}`);
