import 'dotenv/config';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const MAPBOX = process.env.MAPBOX_ACCESS_TOKEN;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const base = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

if (!MAPBOX) {
	console.error('MAPBOX_ACCESS_TOKEN not set in .env');
	process.exit(1);
}

// Fetch all records missing Lat
async function fetchRecordsWithoutCoords() {
	const records = [];
	let offset;
	do {
		const url = `${base}?filterByFormula=${encodeURIComponent('AND({Name}!="", OR({Lat}=BLANK(), {Lng}=BLANK()))')}&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

async function geocode(name, neighborhood, city) {
	const parts = [name, neighborhood, city].filter(Boolean);
	const query = parts.join(', ');
	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX}&limit=1`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json();
	if (!data.features?.length) return null;
	const [lng, lat] = data.features[0].center;
	return { lat, lng };
}

const records = await fetchRecordsWithoutCoords();
console.log(`Found ${records.length} records without coordinates`);

let success = 0;
let failed = 0;

for (let i = 0; i < records.length; i += 10) {
	const batch = records.slice(i, i + 10);

	// Geocode each record in the batch
	const updates = [];
	for (const record of batch) {
		const name = record.fields.Name;
		const neighborhood = Array.isArray(record.fields.Neighborhood)
			? record.fields.Neighborhood[0]
			: record.fields.Neighborhood || '';
		const city = record.fields.City || '';

		const coords = await geocode(name, neighborhood, city);
		if (coords) {
			updates.push({ id: record.id, fields: { Lat: coords.lat, Lng: coords.lng } });
		} else {
			console.log(`  ⚠ Could not geocode: ${name} (${neighborhood}, ${city})`);
			failed++;
		}
		// Small delay between geocoding requests
		await new Promise((r) => setTimeout(r, 100));
	}

	if (updates.length > 0) {
		const res = await fetch(base, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({ records: updates })
		});
		const data = await res.json();
		success += data.records.length;
		console.log(`  Batch ${Math.floor(i / 10) + 1}: geocoded ${data.records.length} records`);
	}

	// Rate limit
	if (i + 10 < records.length) await new Promise((r) => setTimeout(r, 250));
}

console.log(`Done! ${success} geocoded, ${failed} failed`);
