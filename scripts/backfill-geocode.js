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

// Fetch records — pass --all flag to re-geocode everything
const regeoAll = process.argv.includes('--all');

async function fetchRecords() {
	const records = [];
	let offset;
	const filter = regeoAll
		? encodeURIComponent('{Name}!=""')
		: encodeURIComponent('AND({Name}!="", OR({Lat}=BLANK(), {Lng}=BLANK()))');
	do {
		const url = `${base}?filterByFormula=${filter}&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

const cityConfig = {
	'San Francisco': { proximity: '-122.44,37.76', bbox: '-122.55,37.70,-122.35,37.85' },
	'New York': { proximity: '-74.00,40.71', bbox: '-74.10,40.60,-73.85,40.85' },
	'Paris': { proximity: '2.35,48.86', bbox: '2.20,48.80,2.50,48.95' },
	'Tokyo': { proximity: '139.69,35.68', bbox: '139.50,35.50,139.95,35.85' }
};

// Track seen coordinates to detect stacking
const seenCoords = new Map();

async function geocode(name, neighborhood, city) {
	const config = cityConfig[city] || {};
	const proximityParam = config.proximity ? `&proximity=${config.proximity}` : '';
	const bboxParam = config.bbox ? `&bbox=${config.bbox}` : '';

	// Try Searchbox with name + neighborhood for specificity
	const searchQuery = neighborhood ? `${name} ${neighborhood}` : name;
	const url = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(searchQuery)}&access_token=${MAPBOX}&limit=1&types=poi&language=en${proximityParam}${bboxParam}`;
	const res = await fetch(url);
	if (res.ok) {
		const data = await res.json();
		if (data.features?.length) {
			const [lng, lat] = data.features[0].geometry.coordinates;
			return addJitter({ lat, lng });
		}
	}

	// Fallback: v5 geocoding with full context + bbox
	const parts = [name, neighborhood, city].filter(Boolean);
	const fallbackUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(parts.join(', '))}.json?access_token=${MAPBOX}&limit=1${proximityParam}${config.bbox ? '&bbox=' + config.bbox : ''}`;
	const fbRes = await fetch(fallbackUrl);
	if (!fbRes.ok) return null;
	const fbData = await fbRes.json();
	if (!fbData.features?.length) return null;
	const [lng, lat] = fbData.features[0].center;
	return addJitter({ lat, lng });
}

// Add small random offset when coordinates are duplicated
function addJitter(coords) {
	const key = coords.lat.toFixed(4) + ',' + coords.lng.toFixed(4);
	const count = seenCoords.get(key) || 0;
	seenCoords.set(key, count + 1);
	if (count > 0) {
		// Spread in a circle ~100-300m radius around the point
		const angle = (count * 137.5) * Math.PI / 180; // golden angle for even spread
		const radius = 0.001 + (count * 0.0005); // ~100-300m
		coords.lat += Math.sin(angle) * radius;
		coords.lng += Math.cos(angle) * radius;
	}
	return coords;
}

const records = await fetchRecords();
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
