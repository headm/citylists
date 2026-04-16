import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const YELP_KEY = process.env.YELP_API_KEY;

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

if (!PLACES_KEY || !CLAUDE_KEY) {
	console.error('GOOGLE_PLACES_API_KEY and CLAUDE_API_KEY must be set in .env');
	process.exit(1);
}
if (!process.env.PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
	console.error('PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
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
		eaterIndex: 'https://sf.eater.com/maps',
		eaterLinkPattern: '/maps/',
		eaterBase: 'https://sf.eater.com',
		infatuationIndex: 'https://www.theinfatuation.com/san-francisco/guides',
		infatuationLinkPattern: '/san-francisco/guides/',
		infatuationBase: 'https://www.theinfatuation.com',
		michelinUrl: 'https://guide.michelin.com/us/en/california/san-francisco/restaurants',
		googleQueries: ['best restaurants San Francisco', 'top rated restaurants San Francisco', 'new restaurants San Francisco', 'trending restaurants San Francisco'],
		yelpLocation: 'San Francisco, CA'
	},
	'New York': {
		eaterIndex: 'https://ny.eater.com/maps',
		eaterLinkPattern: '/maps/',
		eaterBase: 'https://ny.eater.com',
		infatuationIndex: 'https://www.theinfatuation.com/new-york/guides',
		infatuationLinkPattern: '/new-york/guides/',
		infatuationBase: 'https://www.theinfatuation.com',
		michelinUrl: 'https://guide.michelin.com/us/en/new-york-state/new-york/restaurants',
		googleQueries: ['best restaurants New York', 'top rated restaurants Manhattan', 'trending restaurants New York'],
		yelpLocation: 'New York, NY'
	},
	'Tokyo': {
		eaterIndex: 'https://www.eater.com/international-maps',
		eaterLinkPattern: '/maps/',
		eaterBase: 'https://www.eater.com',
		eaterCityFilter: 'tokyo',
		tabelogUrls: [
			'https://tabelog.com/en/tokyo/rstLst/?SrtT=rt&Srt=D&sort_mode=1',
			'https://tabelog.com/en/tokyo/rstLst/?SrtT=inbound_access&Srt=D&sort_mode=1',
			'https://tabelog.com/en/tokyo/rstLst/?SrtT=inbound_most_reserved&Srt=D&sort_mode=1',
		],
		infatuationIndex: '',
		infatuationLinkPattern: '',
		infatuationBase: '',
		michelinUrl: 'https://guide.michelin.com/jp/en/tokyo-region/tokyo/restaurants',
		googleQueries: ['best restaurants Tokyo', 'top rated restaurants Tokyo', 'trending restaurants Tokyo'],
		yelpLocation: 'Tokyo, Japan'
	},
	'Paris': {
		eaterIndex: 'https://www.eater.com/international-maps',
		eaterLinkPattern: '/maps/',
		eaterBase: 'https://www.eater.com',
		eaterCityFilter: 'paris',
		infatuationIndex: '',
		infatuationLinkPattern: '',
		infatuationBase: '',
		michelinUrl: 'https://guide.michelin.com/fr/en/ile-de-france/paris/restaurants',
		googleQueries: ['best restaurants Paris', 'top rated restaurants Paris', 'trending restaurants Paris'],
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

// ── Supabase helpers ──

async function fetchNames(table, city) {
	const { data, error } = await supabase.from(table).select('name').eq('city', city);
	if (error) {
		console.log(`  ⚠ ${error.message}`);
		return [];
	}
	return data.map((r) => r.name).filter(Boolean);
}

async function batchCreateCandidates(records) {
	const rows = records.map((r) => ({
		name: r.Name,
		city: r.City,
		source: r.Source || '',
		source_url: r.SourceURL || '',
		status: r.Status || 'Pending',
		address: r.Address || '',
		lat: r.Lat || null,
		lng: r.Lng || null,
		photo: r.Photo || '',
		price_level: r.PriceLevel || '',
		hours: r.Hours || ''
	}));

	// Supabase can handle bulk inserts, but let's chunk at 100 to be safe
	for (let i = 0; i < rows.length; i += 100) {
		const batch = rows.slice(i, i + 100);
		const { data, error } = await supabase.from('candidates').insert(batch).select();
		if (error) {
			console.error(`  ✗ Supabase error: ${error.message}`);
		} else {
			console.log(`  Created ${data.length} candidates`);
		}
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

// ── Dynamic URL discovery ──

async function discoverUrls(indexUrl, linkPattern, baseUrl, cityFilter) {
	if (!indexUrl) return [];

	console.log(`  Crawling index: ${indexUrl}`);
	try {
		const res = await fetch(indexUrl, { headers: { 'User-Agent': BROWSER_UA } });
		if (!res.ok) { console.log(`  ✗ Index fetch failed (${res.status})`); return []; }
		const html = await res.text();

		const urls = new Set();
		const regex = new RegExp(`href="(${linkPattern.replace('/', '\\/')}[^"]*)"`, 'g');
		let match;
		while ((match = regex.exec(html)) !== null) {
			const href = match[1];
			if (href === linkPattern || href === linkPattern.slice(0, -1)) continue;
			if (cityFilter && !href.includes(cityFilter)) continue;
			urls.add(href.startsWith('http') ? href : `${baseUrl}${href}`);
		}
		console.log(`  Discovered ${urls.size} list URLs from ${indexUrl}`);
		return [...urls];
	} catch (err) {
		console.log(`  ✗ Index crawl error: ${err.message}`);
		return [];
	}
}

// ── Source scrapers ──

async function scrapeTabelog(urls, pages = 3) {
	const results = [];
	for (const baseUrl of urls) {
		console.log(`  Fetching Tabelog: ${baseUrl} (${pages} pages)`);
		for (let pg = 1; pg <= pages; pg++) {
			try {
				const url = pg === 1 ? baseUrl : `${baseUrl}&PG=${pg}`;
				const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
				if (!res.ok) { console.log(`  ✗ Tabelog fetch failed (${res.status})`); break; }
				const html = await res.text();

				const regex = /cpy-rst-name"[^>]*>([^<]+)</g;
				let match;
				let count = 0;
				while ((match = regex.exec(html)) !== null) {
					const name = match[1].trim();
					if (name) { results.push({ name, source: 'Tabelog', sourceUrl: baseUrl }); count++; }
				}
				if (count === 0) break;
				await delay(300);
			} catch (err) {
				console.log(`  ✗ Tabelog error: ${err.message}`);
				break;
			}
		}
	}
	console.log(`  Found ${results.length} total names from Tabelog`);
	return results;
}

async function scrapeMichelin(url) {
	console.log(`  Fetching Michelin Guide: ${url}`);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': BROWSER_UA }
		});
		if (!res.ok) { console.log(`  ✗ Michelin fetch failed (${res.status})`); return []; }
		const html = await res.text();
		const names = await extractNamesWithClaude(html, 'Michelin Guide');
		console.log(`  Found ${names.length} names from Michelin Guide`);
		return names.map((name) => ({ name, source: 'Michelin', sourceUrl: url }));
	} catch (err) {
		console.log(`  ✗ Michelin error: ${err.message}`);
		return [];
	}
}

async function scrapeEater(url) {
	console.log(`  Fetching Eater: ${url}`);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': BROWSER_UA }
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
			headers: { 'User-Agent': BROWSER_UA }
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
				if ((place.rating || 0) >= 4.4 && (place.userRatingCount || 0) >= 25) {
					seen.add(normalize(name));
					results.push({ name, source: 'Google', sourceUrl: '' });
				}
			}
		} catch {}
		await delay(100);
	}
	console.log(`  Found ${results.length} from Google (≥4.4★, ≥25 reviews)`);
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
		fetchNames('places', city),
		fetchNames('candidates', city)
	]);
	const existingNames = new Set([
		...placeNames.map(normalize),
		...candidateNames.map(normalize)
	]);
	console.log(`  ${placeNames.length} places + ${candidateNames.length} candidates already exist`);

	// 2. Discover from sources
	const discovered = [];

	// Crawl Eater index for list URLs
	const eaterUrls = await discoverUrls(config.eaterIndex, config.eaterLinkPattern, config.eaterBase, config.eaterCityFilter);
	for (const url of eaterUrls) {
		discovered.push(...await scrapeEater(url));
		await delay(500);
	}

	// Crawl Infatuation index for guide URLs
	if (config.infatuationIndex) {
		const infatuationUrls = await discoverUrls(config.infatuationIndex, config.infatuationLinkPattern, config.infatuationBase);
		for (const url of infatuationUrls) {
			discovered.push(...await scrapeInfatuation(url));
			await delay(500);
		}
	}

	// Michelin Guide
	if (config.michelinUrl) {
		discovered.push(...await scrapeMichelin(config.michelinUrl));
		await delay(500);
	}

	// Tabelog (Tokyo only)
	if (config.tabelogUrls) {
		discovered.push(...await scrapeTabelog(config.tabelogUrls));
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
	console.log(`Creating ${records.length} candidates in Supabase...`);
	await batchCreateCandidates(records);
}

console.log('\nDone!');
