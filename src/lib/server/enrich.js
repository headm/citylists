import { env } from '$env/dynamic/private';

/**
 * Search the web for information about a place.
 * Returns a summary of the top results.
 */
async function searchPlace(name, city) {
	const query = `${name} ${city} restaurant review`;
	const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_SEARCH_API_KEY}&cx=${env.GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=3`;

	try {
		const response = await fetch(url);
		if (!response.ok) return '';
		const data = await response.json();
		if (!data.items?.length) return '';

		return data.items
			.map((item) => `${item.title}: ${item.snippet}`)
			.join('\n');
	} catch {
		return '';
	}
}

/**
 * Fallback: use Claude itself to do a web search via tool use,
 * or just do a simple fetch of a search results page.
 */
async function scrapeSearchResults(name, city) {
	const query = encodeURIComponent(`${name} ${city}`);
	try {
		const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityLists/1.0)' }
		});
		if (!response.ok) return '';
		const html = await response.text();

		// Extract result snippets from DuckDuckGo HTML
		const snippets = [];
		const resultRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/gs;
		let match;
		while ((match = resultRegex.exec(html)) !== null && snippets.length < 5) {
			snippets.push(match[1].replace(/<\/?b>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"'));
		}
		return snippets.join('\n');
	} catch {
		return '';
	}
}

/**
 * Call Claude API to enrich a place name + city into structured fields.
 * First searches the web for real information about the place.
 */
export async function enrichPlace(name, city, fieldOptions = {}) {
	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];
	const neighborhoodOpts = fieldOptions.Neighborhood || [];
	const cuisineOpts = fieldOptions.Cuisine || [];

	// Try Google Custom Search first, fall back to DuckDuckGo scrape
	let searchContext = '';
	if (env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_CX) {
		searchContext = await searchPlace(name, city);
	}
	if (!searchContext) {
		searchContext = await scrapeSearchResults(name, city);
	}

	const contextBlock = searchContext
		? `\nHere is real information from the web about this place:\n${searchContext}\n\nUse this information to accurately classify the place.\n`
		: '';

	const prompt = `Given the restaurant/place "${name}" in ${city}, return a JSON object with these fields:
- correctedName (string — the correct, properly spelled, title-cased name of this place. Fix any typos or casing issues from the input.)
- neighborhood (string — the neighborhood in ${city} where this place is located. You MUST choose from this list if any match: ${JSON.stringify(neighborhoodOpts)}. Only use a new value if the place is genuinely in a neighborhood not on this list. Use "" if unsure.)
- cuisine (array of strings — the actual cuisine(s) this place serves, e.g. ["Japanese", "Sushi"] or ["Italian"]. Only reuse from these existing values if genuinely correct: ${JSON.stringify(cuisineOpts)}. Otherwise, use accurate cuisine names.)
- category (MUST be exactly one of: ${JSON.stringify(categoryOpts)})
- type (MUST be exactly one of: ${JSON.stringify(typeOpts)})
- stars (integer 0-3 — number of Michelin stars. Use 0 if the place has no Michelin stars or you are unsure.)
- mode (MUST be exactly one of: "Food & Drink", "Things to Do")
- address (string — the full street address of this place, e.g. "600 Guerrero St, San Francisco, CA" or "2-14-15 Jingumae, Shibuya-ku, Tokyo". Extract from the web information if available. Use "" if unknown.)
- description (one sentence, max 160 characters, that captures what makes this place distinctive — a signature dish, the vibe, what it's known for. Do NOT just restate the cuisine or category.)
${contextBlock}
Return ONLY valid JSON, no markdown or preamble.`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': env.CLAUDE_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-6',
			max_tokens: 256,
			messages: [{ role: 'user', content: prompt }]
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Claude API failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	let text = data.content[0].text.trim();

	// Strip markdown code fences if present
	if (text.startsWith('```')) {
		text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}

	const result = JSON.parse(text);

	// Geocode via Mapbox — use address if available, fall back to name
	if (env.MAPBOX_ACCESS_TOKEN) {
		const placeName = result.correctedName || name;
		const address = result.address || '';
		const cityGeo = {
			'San Francisco': { proximity: '-122.44,37.76', bbox: '-122.55,37.70,-122.35,37.85' },
			'New York': { proximity: '-74.00,40.71', bbox: '-74.10,40.60,-73.85,40.85' },
			'Paris': { proximity: '2.35,48.86', bbox: '2.20,48.80,2.50,48.95' },
			'Tokyo': { proximity: '139.69,35.68', bbox: '139.50,35.50,139.95,35.85' }
		}[city] || {};
		const proximity = cityGeo.proximity ? `&proximity=${cityGeo.proximity}` : '';
		const bbox = cityGeo.bbox ? `&bbox=${cityGeo.bbox}` : '';

		try {
			let lat, lng;

			// Try address geocoding first (most accurate)
			if (address) {
				const addrRes = await fetch(
					`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${env.MAPBOX_ACCESS_TOKEN}&limit=1${proximity}${bbox ? '&bbox=' + cityGeo.bbox : ''}`
				);
				if (addrRes.ok) {
					const addrData = await addrRes.json();
					if (addrData.features?.length > 0) {
						[lng, lat] = addrData.features[0].center;
					}
				}
			}

			// Fall back to POI name search
			if (!lat) {
				const geoRes = await fetch(
					`https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(placeName)}&access_token=${env.MAPBOX_ACCESS_TOKEN}&limit=1&types=poi&language=en${proximity}${bbox}`
				);
				if (geoRes.ok) {
					const geoData = await geoRes.json();
					if (geoData.features?.length > 0) {
						[lng, lat] = geoData.features[0].geometry.coordinates;
					}
				}
			}

			if (lat && lng) {
				result.lat = lat;
				result.lng = lng;
			}
		} catch {
			// Geocoding failure is non-fatal
		}
	}

	return result;
}
