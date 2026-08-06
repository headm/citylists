import 'dotenv/config';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const base = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

if (!PLACES_KEY) {
	console.error('GOOGLE_PLACES_API_KEY not set in .env');
	process.exit(1);
}

const PRICE_LEVEL_MAP = {
	PRICE_LEVEL_FREE: 'Free',
	PRICE_LEVEL_INEXPENSIVE: '$',
	PRICE_LEVEL_MODERATE: '$$',
	PRICE_LEVEL_EXPENSIVE: '$$$',
	PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

const FIELD_MASK = [
	'places.id',
	'places.displayName',
	'places.formattedAddress',
	'places.location',
	'places.priceLevel',
	'places.currentOpeningHours',
	'places.photos'
].join(',');

// Fetch all records from Airtable
async function fetchRecords() {
	const records = [];
	let offset;
	const filter = encodeURIComponent('{Name}!=""');
	do {
		const url = `${base}?filterByFormula=${filter}&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

// Normalize a name for fuzzy comparison
function normalize(s) {
	return s.toLowerCase().replace(/[''`\-\.]/g, '').replace(/\s+/g, ' ').trim();
}

// Check if two names are a reasonable match
function namesMatch(input, returned) {
	const a = normalize(input);
	const b = normalize(returned);
	// One contains the other, or they share a significant overlap
	return a.includes(b) || b.includes(a);
}

// Raw Places API search
async function searchPlacesRaw(query) {
	try {
		const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': PLACES_KEY,
				'X-Goog-FieldMask': FIELD_MASK
			},
			body: JSON.stringify({ textQuery: query })
		});

		if (!response.ok) return null;
		const data = await response.json();
		if (!data.places?.length) return null;

		const place = data.places[0];
		return {
			displayName: place.displayName?.text || '',
			address: place.formattedAddress || null,
			lat: place.location?.latitude || null,
			lng: place.location?.longitude || null,
			priceLevel: PRICE_LEVEL_MAP[place.priceLevel] || null,
			hours: place.currentOpeningHours?.weekdayDescriptions?.join('\n') || null,
			placeId: place.id || null
		};
	} catch {
		return null;
	}
}

// Search Google Places API with name-mismatch fallback
async function searchPlace(name, city) {
	// Try with city first
	let result = await searchPlacesRaw(`${name}, ${city}`);

	// If the returned name doesn't match, retry without city
	if (result && !namesMatch(name, result.displayName)) {
		console.log(`    ↻ Name mismatch: "${name}" → "${result.displayName}", retrying without city`);
		const retry = await searchPlacesRaw(name);
		if (retry && namesMatch(name, retry.displayName)) {
			result = retry;
		} else {
			// Keep original if retry also doesn't match
			console.log(`    ↻ Retry also mismatched ("${retry?.displayName || 'no result'}"), keeping original`);
		}
	}

	return result;
}

// Track seen coordinates to detect stacking
const seenCoords = new Map();

function addJitter(lat, lng) {
	const key = lat.toFixed(4) + ',' + lng.toFixed(4);
	const count = seenCoords.get(key) || 0;
	seenCoords.set(key, count + 1);
	if (count > 0) {
		const angle = (count * 137.5) * Math.PI / 180;
		const radius = 0.001 + (count * 0.0005);
		lat += Math.sin(angle) * radius;
		lng += Math.cos(angle) * radius;
	}
	return { lat, lng };
}

const records = await fetchRecords();
console.log(`Found ${records.length} records to backfill`);

let success = 0;
let failed = 0;

for (let i = 0; i < records.length; i += 10) {
	const batch = records.slice(i, i + 10);

	const updates = [];
	for (const record of batch) {
		const name = record.fields.Name;
		const city = record.fields.City || '';

		const result = await searchPlace(name, city);
		if (result && result.lat && result.lng) {
			const coords = addJitter(result.lat, result.lng);
			const fields = {
				Lat: coords.lat,
				Lng: coords.lng,
				Address: result.address || '',
				Photo: result.placeId || '',
				PriceLevel: result.priceLevel || '',
				Hours: result.hours || ''
			};
			updates.push({ id: record.id, fields });
		} else {
			console.log(`  ⚠ No results: ${name} (${city})`);
			failed++;
		}
		await new Promise((r) => setTimeout(r, 100));
	}

	if (updates.length > 0) {
		const res = await fetch(base, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({ records: updates })
		});
		const data = await res.json();
		if (data.error) {
			console.error(`  ✗ Airtable error: ${data.error.message}`);
			failed += updates.length;
		} else {
			success += data.records.length;
			const names = updates.map((u) => batch.find((r) => r.id === u.id)?.fields.Name).join(', ');
			console.log(`  Batch ${Math.floor(i / 10) + 1}: updated ${data.records.length} — ${names}`);
		}
	}

	if (i + 10 < records.length) await new Promise((r) => setTimeout(r, 250));
}

console.log(`\nDone! ${success} updated, ${failed} failed`);
