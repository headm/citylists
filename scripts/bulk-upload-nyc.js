import 'dotenv/config';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Places';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const names = [
	"L'Artusi",
	"Via Carota",
	"Don Angie",
	"Carbone",
	"Torrisi",
	"Lilia",
	"Misi",
	"Katz's Delicatessen",
	"Gramercy Tavern",
	"4 Charles Prime Rib",
	"Minetta Tavern",
	"St. Anselm",
	"Thai Diner",
	"Tompkins Square Bagels",
	"Apollo Bagels",
	"Prince Street Pizza",
	"Bleecker Street Pizza",
	"L'Industrie Pizzeria",
	"Breakfast by Salt's Cure",
];

// --- Fetch Airtable field options ---
async function fetchFieldOptions() {
	const res = await fetch(
		`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
		{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
	);
	const data = await res.json();
	const table = data.tables.find((t) => t.name === AIRTABLE_TABLE_NAME);
	const fieldOptions = {};
	if (table) {
		for (const field of table.fields) {
			if (field.options?.choices) {
				fieldOptions[field.name] = field.options.choices.map((c) => c.name);
			}
		}
	}
	return fieldOptions;
}

// --- Check for existing records ---
async function fetchExistingNames() {
	let allNames = [];
	let offset = null;
	do {
		const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`);
		url.searchParams.set('fields[]', 'Name');
		url.searchParams.set('pageSize', '100');
		url.searchParams.set('filterByFormula', `{City} = "New York"`);
		if (offset) url.searchParams.set('offset', offset);
		const res = await fetch(url.toString(), {
			headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
		});
		const data = await res.json();
		allNames.push(...data.records.map((r) => r.fields.Name));
		offset = data.offset;
	} while (offset);
	return new Set(allNames);
}

// --- Enrich via Claude ---
async function enrichAll(names, fieldOptions) {
	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];
	const cuisineOpts = fieldOptions.Cuisine || [];
	const neighborhoodOpts = fieldOptions.Neighborhood || [];

	const list = names.map((n, i) => `${i + 1}. ${n}`).join('\n');

	const prompt = `You are classifying New York City restaurants for a curated city guide.

For each restaurant below, return a JSON array where each element has:
- index (integer, matching the number below)
- name (string — the restaurant's correct full name with proper capitalization and punctuation)
- neighborhood (string — the NYC neighborhood where this restaurant is located. MUST be one of: ${JSON.stringify(neighborhoodOpts)}. If the neighborhood isn't in the list, use the closest match or suggest the most accurate name.)
- cuisine (array of strings — the actual cuisine(s). Prefer values from: ${JSON.stringify(cuisineOpts)}, but you can add new ones if needed.)
- category (MUST be exactly one of: ${JSON.stringify(categoryOpts)})
- type (MUST be exactly one of: ${JSON.stringify(typeOpts)})
- description (string — a compelling 1-sentence description for a curated guide, highlighting what makes it special)

Restaurants:
${list}

Return ONLY a valid JSON array, no markdown or preamble.`;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': CLAUDE_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-6',
			max_tokens: 4096,
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

// --- Upload to Airtable (batches of 10) ---
async function uploadBatch(batch) {
	const response = await fetch(
		`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ records: batch, typecast: true })
		}
	);

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Airtable upload failed (${response.status}): ${body}`);
	}

	return response.json();
}

// --- Main ---
console.log(`Processing ${names.length} restaurants for New York...`);

const existingNames = await fetchExistingNames();
const newNames = names.filter((n) => !existingNames.has(n));

// Also check with looser matching (case-insensitive, trimmed)
const existingLower = new Set([...existingNames].map((n) => n?.toLowerCase().trim()));
const filteredNames = newNames.filter((n) => {
	if (existingLower.has(n.toLowerCase().trim())) {
		console.log(`  Skipping (case-insensitive match): ${n}`);
		return false;
	}
	return true;
});

if (filteredNames.length === 0) {
	console.log('All restaurants already exist. Done!');
	process.exit(0);
}

console.log(`${names.length - filteredNames.length} duplicates skipped, ${filteredNames.length} new restaurants to add.`);

console.log('Enriching via Claude...');
const fieldOptions = await fetchFieldOptions();
const enrichments = await enrichAll(filteredNames, fieldOptions);
console.log(`Got ${enrichments.length} enrichments`);

const records = enrichments.map((e) => ({
	fields: {
		Name: e.name,
		City: 'New York',
		Mode: 'Food & Drink',
		Neighborhood: [e.neighborhood],
		Cuisine: e.cuisine || [],
		Category: e.category || '',
		Type: e.type || 'Restaurant',
		Description: e.description || '',
		Stars: 0
	}
}));

console.log(`Uploading ${records.length} records to Airtable...`);
for (let i = 0; i < records.length; i += 10) {
	const batch = records.slice(i, i + 10);
	const result = await uploadBatch(batch);
	console.log(`  Uploaded batch ${Math.floor(i / 10) + 1}: ${result.records.length} records`);
	if (i + 10 < records.length) await new Promise((r) => setTimeout(r, 250));
}

console.log('Done!');
