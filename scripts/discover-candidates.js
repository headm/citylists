import 'dotenv/config';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const PLACES_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const CANDIDATES_TABLE = process.env.AIRTABLE_CANDIDATES_TABLE || 'Candidates';
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const YELP_KEY = process.env.YELP_API_KEY;

const airtableHeaders = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const placesUrl = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(PLACES_TABLE)}`;
const candidatesUrl = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(CANDIDATES_TABLE)}`;

if (!PLACES_KEY || !CLAUDE_KEY) {
	console.error('GOOGLE_PLACES_API_KEY and CLAUDE_API_KEY must be set in .env');
	process.exit(1);
}

const PRICE_LEVEL_MAP = {
	PRICE_LEVEL_FREE: 'Free',
	PRICE_LEVEL_INEXPENSIVE: '$',
	PRICE_LEVEL_MODERATE: '$$',
	PRICE_LEVEL_EXPENSIVE: '$$$',
	PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

const CITY_CONFIGS = {
	'San Francisco': {
		eaterUrls: [
			'https://sf.eater.com/maps/best-san-francisco-restaurants-38'
		],
		infatuationUrls: [
			'https://www.theinfatuation.com/san-francisco/guides/the-infatuation-picks'
		],
		googleQueries: ['best restaurants San Francisco', 'top rated restaurants San Francisco', 'new restaurants San Francisco'],
		yelpLocation: 'San Francisco, CA'
	},
	'New York': {
		eaterUrls: [
			'https://ny.eater.com/maps/best-new-york-restaurants-38'
		],
		infatuationUrls: [
			'https://www.theinfatuation.com/new-york/guides/the-infatuation-picks'
		],
		googleQueries: ['best restaurants New York', 'top rated restaurants Manhattan'],
		yelpLocation: 'New York, NY'
	},
	'Tokyo': {
		eaterUrls: [
			'https://www.eater.com/maps/best-restaurants-tokyo'
		],
		infatuationUrls: [],
		googleQueries: ['best restaurants Tokyo', 'top rated restaurants Tokyo'],
		yelpLocation: 'Tokyo, Japan'
	},
	'Paris': {
		eaterUrls: [
			'https://www.eater.com/maps/best-restaurants-paris'
		],
		infatuationUrls: [],
		googleQueries: ['best restaurants Paris', 'top rated restaurants Paris'],
		yelpLocation: 'Paris, France'
	}
};

// ── Utilities ──

function normalize(s) {
	return s.toLowerCase().replace(/[''`\-\.]/g, '').replace(/\s+/g, ' ').trim();
}

async function delay(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

// ── Airtable helpers ──

async function fetchNames(baseUrl, city) {
	const names = [];
	let offset;
	const filter = encodeURIComponent(`{City} = "${city}"`);
	do {
		const url = `${baseUrl}?filterByFormula=${filter}&fields%5B%5D=Name&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers: airtableHeaders });
		const data = await res.json();
		if (!data.records) {
			if (data.error) console.log(`  ⚠ ${data.error.message}`);
			break;
		}
		for (const r of data.records) {
			if (r.fields.Name) names.push(r.fields.Name);
		}
		offset = data.offset;
	} while (offset);
	return names;
}

async function batchCreateCandidates(records) {
	for (let i = 0; i < records.length; i += 10) {
		const batch = records.slice(i, i + 10);
		const res = await fetch(candidatesUrl, {
			method: 'POST',
			headers: airtableHeaders,
			body: JSON.stringify({
				records: batch.map((fields) => ({ fields })),
				typecast: true
			})
		});
		const data = await res.json();
		if (data.error) {
			console.error(`  ✗ Airtable error: ${data.error.message}`);
		} else {
			console.log(`  Created ${data.records.length} candidates`);
		}
		if (i + 10 < records.length) await delay(250);
	}
}

// ── Claude HTML extraction ──

async function extractNamesWithClaude(html, sourceDescription) {
	const truncated = html.slice(0, 100000);

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': CLAUDE_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-6',
			max_tokens: 4096,
			tools: [{
				name: 'extract_restaurants',
				description: 'Extract restaurant names from an article',
				input_schema: {
					type: 'object',
					properties: {
						names: { type: 'array', items: { type: 'string' }, description: 'Restaurant names found in the article' }
					},
					required: ['names']
				}
			}],
			tool_choice: { type: 'tool', name: 'extract_restaurants' },
			messages: [{
				role: 'user',
				content: `Extract all restaurant/bar/cafe names from this ${sourceDescription} article. Only include actual establishment names, not section headers or author names.\n\n${truncated}`
			}]
		})
	});

	if (!response.ok) {
		console.error(`  ✗ Claude API failed (${response.status})`);
		return [];
	}

	const data = await response.json();
	const toolBlock = data.content.find((b) => b.type === 'tool_use');
	return toolBlock?.input?.names || [];
}

// ── Source scrapers ──

async function scrapeEater(url) {
	console.log(`  Fetching Eater: ${url}`);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityLists/1.0)' }
		});
		if (!res.ok) { console.log(`  ✗ Eater fetch failed (${res.status})`); return []; }
		const html = await res.text();
		const names = await extractNamesWithClaude(html, 'Eater');
		console.log(`  Found ${names.length} names from Eater`);
		return names.map((name) => ({ name, source: 'Eater', sourceUrl: url }));
	} catch (err) {
		console.log(`  ✗ Eater error: ${err.message}`);
		return [];
	}
}

async function scrapeInfatuation(url) {
	console.log(`  Fetching Infatuation: ${url}`);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityLists/1.0)' }
		});
		if (!res.ok) { console.log(`  ✗ Infatuation fetch failed (${res.status})`); return []; }
		const html = await res.text();
		const names = await extractNamesWithClaude(html, 'Infatuation');
		console.log(`  Found ${names.length} names from Infatuation`);
		return names.map((name) => ({ name, source: 'Infatuation', sourceUrl: url }));
	} catch (err) {
		console.log(`  ✗ Infatuation error: ${err.message}`);
		return [];
	}
}

async function discoverFromGoogle(queries, city) {
	const results = [];
	const seen = new Set();

	for (const query of queries) {
		console.log(`  Google Places: "${query}"`);
		try {
			const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': PLACES_KEY,
					'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount'
				},
				body: JSON.stringify({ textQuery: query })
			});
			if (!res.ok) continue;
			const data = await res.json();
			for (const place of data.places || []) {
				const name = place.displayName?.text;
				if (!name || seen.has(normalize(name))) continue;
				if ((place.rating || 0) >= 4.5 && (place.userRatingCount || 0) >= 50) {
					seen.add(normalize(name));
					results.push({ name, source: 'Google', sourceUrl: '' });
				}
			}
		} catch {}
		await delay(100);
	}
	console.log(`  Found ${results.length} from Google (≥4.5★)`);
	return results;
}

async function discoverFromYelp(location, city) {
	if (!YELP_KEY) {
		console.log('  Skipping Yelp (no YELP_API_KEY)');
		return [];
	}

	console.log(`  Yelp: ${location}`);
	try {
		const params = new URLSearchParams({
			location,
			categories: 'restaurants',
			sort_by: 'rating',
			limit: '50'
		});
		const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
			headers: { Authorization: `Bearer ${YELP_KEY}` }
		});
		if (!res.ok) { console.log(`  ✗ Yelp failed (${res.status})`); return []; }
		const data = await res.json();
		const filtered = (data.businesses || [])
			.filter((b) => b.rating >= 4.0 && b.review_count >= 100)
			.map((b) => ({ name: b.name, source: 'Yelp', sourceUrl: b.url || '' }));
		console.log(`  Found ${filtered.length} from Yelp (≥4★, ≥100 reviews)`);
		return filtered;
	} catch (err) {
		console.log(`  ✗ Yelp error: ${err.message}`);
		return [];
	}
}

// ── Google Places enrichment ──

async function enrichWithPlaces(name, city) {
	try {
		const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': PLACES_KEY,
				'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.priceLevel,places.currentOpeningHours,places.photos'
			},
			body: JSON.stringify({ textQuery: `${name}, ${city}` })
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (!data.places?.length) return null;

		const place = data.places[0];
		return {
			address: place.formattedAddress || '',
			lat: place.location?.latitude || null,
			lng: place.location?.longitude || null,
			priceLevel: PRICE_LEVEL_MAP[place.priceLevel] || '',
			hours: place.currentOpeningHours?.weekdayDescriptions?.join('\n') || '',
			photo: place.photos?.[0]?.name || ''
		};
	} catch {
		return null;
	}
}

// ── Main ──

const targetCity = process.argv[2];
const citiesToProcess = targetCity ? [targetCity] : Object.keys(CITY_CONFIGS);

for (const city of citiesToProcess) {
	const config = CITY_CONFIGS[city];
	if (!config) {
		console.log(`No config for "${city}", skipping`);
		continue;
	}

	console.log(`\n=== ${city} ===`);

	// 1. Build dedup set
	console.log('Fetching existing names for deduplication...');
	const [placeNames, candidateNames] = await Promise.all([
		fetchNames(placesUrl, city),
		fetchNames(candidatesUrl, city)
	]);
	const existingNames = new Set([
		...placeNames.map(normalize),
		...candidateNames.map(normalize)
	]);
	console.log(`  ${placeNames.length} places + ${candidateNames.length} candidates already exist`);

	// 2. Discover from sources
	const discovered = [];

	for (const url of config.eaterUrls) {
		discovered.push(...await scrapeEater(url));
		await delay(500);
	}

	for (const url of config.infatuationUrls) {
		discovered.push(...await scrapeInfatuation(url));
		await delay(500);
	}

	discovered.push(...await discoverFromGoogle(config.googleQueries, city));
	discovered.push(...await discoverFromYelp(config.yelpLocation, city));

	// 3. Deduplicate
	const uniqueByName = new Map();
	for (const d of discovered) {
		const key = normalize(d.name);
		if (!existingNames.has(key) && !uniqueByName.has(key)) {
			uniqueByName.set(key, d);
		}
	}
	const newCandidates = [...uniqueByName.values()];
	console.log(`\n${discovered.length} total discovered, ${newCandidates.length} new after dedup`);

	if (newCandidates.length === 0) continue;

	// 4. Enrich via Google Places
	console.log('Enriching with Google Places...');
	const records = [];
	for (const c of newCandidates) {
		const enriched = await enrichWithPlaces(c.name, city);
		records.push({
			Name: c.name,
			City: city,
			Source: c.source,
			SourceURL: c.sourceUrl,
			Status: 'Pending',
			Address: enriched?.address || '',
			Lat: enriched?.lat || null,
			Lng: enriched?.lng || null,
			Photo: enriched?.photo || '',
			PriceLevel: enriched?.priceLevel || '',
			Hours: enriched?.hours || ''
		});
		await delay(100);
	}

	// 5. Batch create
	console.log(`Creating ${records.length} candidates in Airtable...`);
	await batchCreateCandidates(records);
}

console.log('\nDone!');
