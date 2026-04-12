import 'dotenv/config';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const MAPBOX = process.env.MAPBOX_ACCESS_TOKEN;
const CLAUDE = process.env.CLAUDE_API_KEY;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const base = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

const cityGeo = {
	'San Francisco': { proximity: '-122.44,37.76', bbox: '-122.55,37.70,-122.35,37.85' },
	'New York': { proximity: '-74.00,40.71', bbox: '-74.10,40.60,-73.85,40.85' },
	'Paris': { proximity: '2.35,48.86', bbox: '2.20,48.80,2.50,48.95' },
	'Tokyo': { proximity: '139.69,35.68', bbox: '139.50,35.50,139.95,35.85' }
};

// Fetch all records missing Address
async function fetchRecords() {
	const records = [];
	let offset;
	const filter = encodeURIComponent('AND({Name}!="", OR({Address}=BLANK(), {Address}=""))');
	do {
		const url = `${base}?filterByFormula=${filter}&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

// Batch lookup addresses via Claude
async function batchGetAddresses(places) {
	const list = places.map((p, i) => `${i + 1}. "${p.name}" in ${p.city}`).join('\n');

	const prompt = `For each place below, provide its street address. Return a JSON array where each element has:
- index (integer matching the number)
- address (string — the full street address, e.g. "600 Guerrero St, San Francisco, CA 94110" or "2-14-15 Jingumae, Shibuya-ku, Tokyo 150-0001". Use "" if unknown.)

Places:
${list}

Return ONLY valid JSON, no markdown or preamble.`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': CLAUDE,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-6',
			max_tokens: 8192,
			messages: [{ role: 'user', content: prompt }]
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Claude API failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	let text = data.content[0].text.trim();
	if (text.startsWith('```')) {
		text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}
	return JSON.parse(text);
}

// Geocode an address via Mapbox v5
async function geocodeAddress(address, city) {
	const config = cityGeo[city] || {};
	const proximity = config.proximity ? `&proximity=${config.proximity}` : '';
	const bbox = config.bbox ? `&bbox=${config.bbox}` : '';

	const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX}&limit=1${proximity}${bbox}`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json();
	if (!data.features?.length) return null;
	const [lng, lat] = data.features[0].center;
	return { lat, lng };
}

// Main
const records = await fetchRecords();
console.log(`Found ${records.length} records without addresses`);

if (records.length === 0) {
	console.log('Nothing to do!');
	process.exit(0);
}

// Process in batches of 25 for Claude (to stay within token limits)
let totalUpdated = 0;
let totalFailed = 0;

for (let i = 0; i < records.length; i += 25) {
	const batch = records.slice(i, i + 25);
	const places = batch.map(r => ({
		id: r.id,
		name: r.fields.Name,
		city: r.fields.City || 'San Francisco'
	}));

	console.log(`\nBatch ${Math.floor(i / 25) + 1}: Looking up ${places.length} addresses via Claude...`);
	const addresses = await batchGetAddresses(places);

	// Geocode each address and prepare updates
	const updates = [];
	for (const place of places) {
		const addrResult = addresses.find(a => a.index === places.indexOf(place) + 1);
		const address = addrResult?.address || '';

		if (!address) {
			console.log(`  ⚠ No address found for: ${place.name}`);
			totalFailed++;
			continue;
		}

		const coords = await geocodeAddress(address, place.city);
		if (!coords) {
			console.log(`  ⚠ Could not geocode: ${place.name} (${address})`);
			totalFailed++;
			continue;
		}

		updates.push({
			id: place.id,
			fields: { Address: address, Lat: coords.lat, Lng: coords.lng }
		});

		// Small delay between geocoding requests
		await new Promise(r => setTimeout(r, 100));
	}

	// Upload updates in batches of 10
	for (let j = 0; j < updates.length; j += 10) {
		const uploadBatch = updates.slice(j, j + 10);
		const res = await fetch(base, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({ records: uploadBatch })
		});
		const data = await res.json();
		totalUpdated += data.records.length;
		console.log(`  Updated ${data.records.length} records`);
		await new Promise(r => setTimeout(r, 250));
	}
}

console.log(`\nDone! ${totalUpdated} updated, ${totalFailed} failed`);
