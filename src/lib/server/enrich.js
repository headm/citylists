import { env } from '$env/dynamic/private';

const PRICE_LEVEL_MAP = {
	PRICE_LEVEL_FREE: 'Free',
	PRICE_LEVEL_INEXPENSIVE: '$',
	PRICE_LEVEL_MODERATE: '$$',
	PRICE_LEVEL_EXPENSIVE: '$$$',
	PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

const ENRICH_TOOL = {
	name: 'enrich_place',
	description: 'Return structured enrichment data for a place',
	input_schema: {
		type: 'object',
		properties: {
			correctedName: { type: 'string', description: 'Correct, properly spelled, title-cased name' },
			neighborhood: { type: 'string', description: 'Neighborhood where the place is located' },
			cuisine: { type: 'array', items: { type: 'string' }, description: 'Cuisine types' },
			category: { type: 'string', description: 'Category classification' },
			type: { type: 'string', description: 'Type classification' },
			stars: { type: 'integer', description: 'Michelin stars (0-3)' },
			mode: { type: 'string', enum: ['Food & Drink', 'Things to Do'] },
			address: { type: 'string', description: 'Full street address' },
			description: { type: 'string', description: 'One sentence, max 160 chars, about what makes this place distinctive' }
		},
		required: ['correctedName', 'neighborhood', 'cuisine', 'category', 'type', 'stars', 'mode', 'address', 'description']
	}
};

/**
 * Search for a place using Google Places API (New) searchText endpoint.
 * Returns rich place data or null on failure.
 */
async function searchPlacesAPI(name, city) {
	if (!env.GOOGLE_PLACES_API_KEY) return null;

	const fieldMask = [
		'places.id',
		'places.displayName',
		'places.formattedAddress',
		'places.location',
		'places.types',
		'places.priceLevel',
		'places.currentOpeningHours',
		'places.photos',
		'places.editorialSummary',
		'places.googleMapsUri',
		'places.websiteUri',
		'places.rating'
	].join(',');

	try {
		const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
				'X-Goog-FieldMask': fieldMask
			},
			body: JSON.stringify({ textQuery: `${name}, ${city}` })
		});

		if (!response.ok) return null;
		const data = await response.json();
		if (!data.places?.length) return null;

		const place = data.places[0];
		return {
			name: place.displayName?.text || null,
			address: place.formattedAddress || null,
			lat: place.location?.latitude || null,
			lng: place.location?.longitude || null,
			types: place.types || [],
			priceLevel: PRICE_LEVEL_MAP[place.priceLevel] || null,
			hours: place.currentOpeningHours?.weekdayDescriptions?.join('\n') || null,
			// Durable place ID, not the ephemeral photo resource name — photo names
			// expire and break every stored image (see src/lib/server/photos.js).
			placeId: place.id || null,
			editorialSummary: place.editorialSummary?.text || null,
			websiteUrl: place.websiteUri || null,
			googleMapsUrl: place.googleMapsUri || null,
			googleRating: place.rating || null
		};
	} catch {
		return null;
	}
}

/**
 * Search the web for information about a place via Google Custom Search.
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
 * Fallback: scrape DuckDuckGo HTML search results.
 */
async function scrapeSearchResults(name, city) {
	const query = encodeURIComponent(`${name} ${city}`);
	try {
		const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CityLists/1.0)' }
		});
		if (!response.ok) return '';
		const html = await response.text();

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
 * Uses Google Places API (New) as primary data source, with web search fallback.
 */
export async function enrichPlace(name, city, fieldOptions = {}) {
	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];
	const neighborhoodOpts = fieldOptions.Neighborhood || [];
	const cuisineOpts = fieldOptions.Cuisine || [];

	// Step 1: Try Google Places API first
	const placesData = await searchPlacesAPI(name, city);

	// Step 2: Build context for Claude
	let contextBlock = '';
	if (placesData) {
		const parts = [];
		if (placesData.name) parts.push(`Name: ${placesData.name}`);
		if (placesData.address) parts.push(`Address: ${placesData.address}`);
		if (placesData.types?.length) parts.push(`Google types: ${placesData.types.join(', ')}`);
		if (placesData.editorialSummary) parts.push(`Summary: ${placesData.editorialSummary}`);
		if (placesData.priceLevel) parts.push(`Price level: ${placesData.priceLevel}`);
		contextBlock = `\nHere is verified information from Google Places about this place:\n${parts.join('\n')}\n\nUse this information to accurately classify the place.\n`;
	} else {
		// Fallback to web search
		let searchContext = '';
		if (env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_CX) {
			searchContext = await searchPlace(name, city);
		}
		if (!searchContext) {
			searchContext = await scrapeSearchResults(name, city);
		}
		if (searchContext) {
			contextBlock = `\nHere is real information from the web about this place:\n${searchContext}\n\nUse this information to accurately classify the place.\n`;
		}
	}

	// Step 3: Call Claude with tool_use for structured output
	const prompt = `Given the restaurant/place "${name}" in ${city}, use the enrich_place tool to return structured data with these constraints:
- correctedName: the correct, properly spelled, title-cased name. Fix any typos or casing issues from the input.
- neighborhood: the neighborhood in ${city}. You MUST choose from this list if any match: ${JSON.stringify(neighborhoodOpts)}. Only use a new value if the place is genuinely in a neighborhood not on this list. Use "" if unsure.
- cuisine: the actual cuisine(s) this place serves, e.g. ["Japanese", "Sushi"] or ["Italian"]. Only reuse from these existing values if genuinely correct: ${JSON.stringify(cuisineOpts)}. Otherwise, use accurate cuisine names.
- category: MUST be exactly one of: ${JSON.stringify(categoryOpts)}
- type: MUST be exactly one of: ${JSON.stringify(typeOpts)}
- stars: integer 0-3 for Michelin stars. Use 0 if no Michelin stars or unsure.
- mode: MUST be exactly one of: "Food & Drink", "Things to Do"
- address: the full street address, e.g. "600 Guerrero St, San Francisco, CA". Use "" if unknown.
- description: one sentence, max 160 characters, that captures what makes this place distinctive. Do NOT just restate the cuisine or category.
${contextBlock}`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': env.CLAUDE_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-6',
			max_tokens: 512,
			tools: [ENRICH_TOOL],
			tool_choice: { type: 'tool', name: 'enrich_place' },
			messages: [{ role: 'user', content: prompt }]
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Claude API failed (${response.status}): ${body}`);
	}

	const data = await response.json();
	const toolUseBlock = data.content.find((block) => block.type === 'tool_use');
	if (!toolUseBlock) {
		throw new Error('Claude did not return structured tool_use response');
	}
	const result = toolUseBlock.input;

	// Step 4: Merge Places API data into result
	if (placesData) {
		if (placesData.lat && placesData.lng) {
			result.lat = placesData.lat;
			result.lng = placesData.lng;
		}
		// Prefer Places API address if Claude didn't provide one
		if (!result.address && placesData.address) {
			result.address = placesData.address;
		}
		result.placeId = placesData.placeId || null;
		result.hours = placesData.hours || null;
		result.priceLevel = placesData.priceLevel || null;
		result.googleRating = placesData.googleRating || null;
		result.url = placesData.websiteUrl || placesData.googleMapsUrl || '';
	}

	// Step 5: Geocode via Mapbox only if we don't have coordinates yet
	if (!result.lat && env.MAPBOX_ACCESS_TOKEN) {
		const placeName = result.correctedName || name;
		const address = result.address || '';

		try {
			let lat, lng;

			if (address) {
				const addrRes = await fetch(
					`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${env.MAPBOX_ACCESS_TOKEN}&limit=1`
				);
				if (addrRes.ok) {
					const addrData = await addrRes.json();
					if (addrData.features?.length > 0) {
						[lng, lat] = addrData.features[0].center;
					}
				}
			}

			if (!lat) {
				const geoRes = await fetch(
					`https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(placeName)}&access_token=${env.MAPBOX_ACCESS_TOKEN}&limit=1&types=poi&language=en`
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
