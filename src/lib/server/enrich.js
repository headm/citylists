import { env } from '$env/dynamic/private';

/**
 * Call Claude API to enrich a place name + city into structured fields.
 * `fieldOptions` is an object of existing Airtable select options, e.g.
 * { Category: ["Casual", "Elevated"], Type: ["Restaurant", "Bar"], Neighborhood: [...], Cuisine: [...] }
 */
export async function enrichPlace(name, city, fieldOptions = {}) {
	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];
	const neighborhoodOpts = fieldOptions.Neighborhood || [];
	const cuisineOpts = fieldOptions.Cuisine || [];

	const prompt = `Given the restaurant/place "${name}" in ${city}, return a JSON object with these fields:
- neighborhood (string — the actual neighborhood where this place is located. Only reuse one of these existing values if it is genuinely correct: ${JSON.stringify(neighborhoodOpts)}. Otherwise, use the real neighborhood name.)
- cuisine (array of strings — the actual cuisine(s) this place serves, e.g. ["Japanese", "Sushi"] or ["Italian"]. Only reuse from these existing values if genuinely correct: ${JSON.stringify(cuisineOpts)}. Otherwise, use accurate cuisine names.)
- category (MUST be exactly one of: ${JSON.stringify(categoryOpts)})
- type (MUST be exactly one of: ${JSON.stringify(typeOpts)})
- stars (integer 0-3 — number of Michelin stars. Use 0 if the place has no Michelin stars or you are unsure.)
- description (one sentence that captures what makes this place distinctive — a signature dish, the vibe, what it's known for. Do NOT just restate the cuisine or category.)

Return ONLY valid JSON, no markdown or preamble.`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': env.CLAUDE_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-haiku-4-5-20251001',
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

	return JSON.parse(text);
}
