import 'dotenv/config';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Places';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const raw = `
* Benu *** — Three-star SF institution; Corey Lee's Korean/Japanese/Chinese tasting menu is the most technically ambitious meal in the city. $$$$ | SoMa
* Atelier Crenn *** — Dominique Crenn's poetic, pescatarian three-star tasting menu; the only woman in the U.S. with three stars. $$$$ | Cow Hollow
* Quince *** — Michael Tusk's three-star Italian-Californian tasting menu sourcing from his own 25-acre farm in Bolinas. $$$$ | Jackson Square
* Kiln ** — The hottest rise in SF fine dining; promoted to two stars in one year, Nordic-leaning fire and fermentation tasting menu. $$$$ | Hayes Valley
* Saison ** — Pioneering open-hearth fine dining in a historic brick warehouse; everything cooked over a roaring wood fire. $$$$ | SoMa
* Sons & Daughters ** — Two-star Nordic minimalism with a Green Star for sustainability; Harrison Cheney is a 2026 James Beard finalist. $$$$ | Mission
* Birdsong ** — Whole-animal, wood-fired cooking; two tasting menu lengths, exceptional wine program. $$$$ | SoMa
* Lazy Bear ** — Born from apartment dinner parties; David Barzelay's dinner-party tasting menu in a hunting lodge-style warehouse. $$$$ | Mission
* Acquerello ** — Longest-tenured two-star in SF; impeccable Italian fine dining in a former chapel since 1989. $$$$ | Nob Hill
* Wolfsbane — Best new restaurant of 2025; theatrical tasting menu under a tree growing from the ceiling, from the team behind Lord Stanley. $$$$ | Dogpatch
* Nisei * — Japanese-American tasting menu blending ike jime-style unagi, uni custard, and a wagashi dessert cart. $$$$ | Russian Hill
* San Ho Won * — Corey Lee brings Michelin precision to Korean BBQ; real charcoal, legendary galbi, month-long waitlists. $$$ | Mission
* Noodle in a Haystack — Ten seats, eight courses, Infatuation's highest-rated restaurant in SF (9.7); culminates in a custom ramen bowl. $$$$ | Richmond
* Mister Jiu's * — Brandon Jew's pioneering modern Chinese-Californian in a historic Chinatown banquet hall; Peking duck with whipped duck liver mousse. $$$ | Chinatown
* The Happy Crane — Breakout modern Cantonese of 2025; James Yeun Leong Parry's Golden Coin bao, tableside crab rice roll, coal-oven Peking duck. $$$ | Hayes Valley
* State Bird Provisions * — Dim sum-style Californian small plates on rolling carts; one of America's most original dining formats. $$$ | Western Addition
* The Progress * — State Bird's structured sister next door; family-style seasonal American in a converted historic theater. $$$ | Western Addition
* Arquet — Alex Hong's triumphant revival of the legendary Slanted Door space in the Ferry Building; scallion fry bread, Bay Bridge views. $$$ | Embarcadero
* Nari * — Thai-born chef Pim Techamuanvivit's heritage Thai recipes with California ingredients inside the Hotel Kabuki. $$$ | Japantown
* 7 Adams * — Intimate 28-seat tasting menu in the Fillmore from husband-and-wife team David and Serena Chow Fisher; seasonal Californian cooking with East Coast hip-hop in the background. $$$ | Lower Pacific Heights
* Ernest * — Brandon Rice's irreverent Mission hotspot; Japanese-inflected small plates where kaluga caviar meets tater tots. Hip, unstuffy, and genuinely delicious. $$$ | Mission
* Dalida — Eastern Mediterranean family-style cooking in a beautiful Presidio space by two Saison and Le Bernardin veterans; saffron rice, roasted lamb, Eater SF's Restaurant of the Year 2023. $$$ | Presidio
* Verjus — Infatuation's #1 best new restaurant of 2025; candlelit French wine bar from the Quince team with impeccable pate en croute and omelettes. $$$ | Financial District
* Four Kings — SF Chronicle's #2 in the Bay Area; modern Cantonese with French and Japanese technique, XO escargot, mapo spaghetti. $$-$$$ | Chinatown
* Rich Table — SF Chronicle's #3 in the Bay Area; inventive seasonal New American from Sarah and Evan Rich. $$$ | Hayes Valley
* Copra * — Srijith Gopinathan's elegant South Indian cooking with California produce; Chronicle's #4 in the Bay Area, Michelin-starred. $$$ | Fillmore
* Rintaro — Sylvan Mishima Brackett's Japanese izakaya; hand-built with traditional materials, binchotan yakitori, Kyoto-inflected soul. $$$ | Mission
* Flour + Water — SF's best handmade pasta bar none; over 90 original shapes, constantly rotating, deeply Californian Italian. $$$ | Mission
* Zuni Café — California cuisine's spiritual home since 1979; wood-fired roast chicken with bread salad is one of America's iconic dishes. $$$ | Hayes Valley
* Kin Khao * — Pim Techamuanvivit's more casual Thai companion to Nari; vibrant, complex, Michelin-starred, and accessible. $$-$$$ | Union Square
* Niku Steakhouse * — In-house dry-aged A5 wagyu and American wagyu in a Japanese-influenced steakhouse; wagyu fat brownie is a must. $$$$ | SoMa
* Mijoté — Osaka-born, French-trained Kosuke Tada channels Paris neobistro energy into a four-course Mission dinner for $84; 2026 James Beard nominee. $$-$$$ | Mission
* Cotogna — Michael Tusk's rustic Italian companion to Quince; spit-roasted meats, wood-oven fish, daily-changing seasonal pastas. $$$ | Jackson Square
* Showa Le Gourmet Tonkatsu — 12-course, $150 tasting menu built entirely around katsu; obsessive craft, four panko types, house fruit-based katsu sauce. $$$$ | SoMa
* Sushi Ran — Sausalito institution since 1986; fish sourced from Tokyo's Tsukiji Market, legendary miso-glazed black cod, and one of the best sake lists in California. $$$ | Sausalito
* House of Prime Rib — Open since 1949; tuxedoed servers carve prime rib tableside from silver carts, salad tossed at the table, Yorkshire pudding mandatory. Reservations book months out. $$$ | Polk Gulch
* Liholiho Yacht Club — Ravi Kapur's Hawaiian-heritage sharing-plates restaurant in Lower Nob Hill; the swordfish katsu, beef tongue steamed buns, and Baked Hawaii dessert are bucket-list dishes. $$$ | Lower Nob Hill
* Loló — Family-owned Mission Mexican with non-traditional Jalisco-inspired dishes; the taco tropical with panko-breaded shrimp and jicama tortilla is a local cult favorite. $$  | Mission
* Jû-ni * — 12-seat NoPa omakase where every four guests get their own personal sushi chef; intimate, approachable, and one of the best sushi experiences in the city. $$$$ | NoPa
* Side A — Parker Brown's soulful comfort food in the old Universal Cafe space; legendary bone marrow burger, carrot cake, DJ wife, Miller High Lifes on the sidewalk. $$ | Mission
* Jules — Max Blachman-Gentile's sourdough pizza with serious small plates; the Spicy Ronny is the move, nori guanciale buns are a revelation. $$ | Lower Haight
* La Taqueria — Over 50 years old; Miguel Jara's burrito dorado grilled crispy is a Michelin-listed SF institution. $ | Mission
* Outta Sight Pizza — SF's best slice at $4.15; Eric Ehler (ex-Mister Jiu's) makes chewy-crisp foldable NY-style with smoky pepperoni cups. $ | Tenderloin / Chinatown
* Mandalay — SF's original Burmese restaurant since 1984; best tea leaf salad in the city, Infatuation rating 9.4, $25-35 per person. $$ | Richmond
* El Farolito — The quintessential late-night Mission taqueria, open until 2:45 AM; charred carne asada, al pastor, cash only, Infatuation rating 9.3. $ | Mission
* Swan Oyster Depot — 18 marble counter stools, no reservations, open since 1912; arguably the greatest raw bar in America. $$ | Nob Hill
* Fish — Counter-service waterfront spot that helped launch the sustainable seafood movement; Dungeness crab, legendary clam chowder, and a salmon smash burger worth the trip over the bridge. $$ | Sausalito
* Golden Boy Pizza — North Beach legend since 1978; thick focaccia-style slices, crackling bottom, mountains of cheese, and a legendary clam-and-garlic pie. $4.50 a slice. $ | North Beach
* Indigo — Marina cocktail bar with a wagyu smash burger on a fresh French bakery bun; great craft cocktails, open until midnight on weekends. $$ | Marina
* Nopa — NoPa anchor since 2006; wood-fired burger, organic rotisserie chicken, open until 1am. A true SF institution. $$ | NoPa
* Outerlands — Outer Sunset neighborhood gem; legendary Dutch pancakes and cast-iron grilled cheese at brunch, perfect post-Ocean Beach stop. $$ | Outer Sunset
* Tony's Pizza Napoletana — Multiple world pizza champion Tony Gemignani making nearly every regional style under one roof. Coal-fired and wood-fired pies are the move. $$ | North Beach
* Mama's Boy Pizza — NY-style 20-inch pies with a foldable floppy crust, perfectly cupped pepperoni, and a burrata-with-hot-honey slice that's the fan favorite. $ | Uptown Oakland
* Hot Sauce and Panko — Tiny Nob Hill takeout counter selling 300+ hot sauces and 20+ chicken wing varieties, from Korean gochujang to ghost pepper — some of the best wings in SF. $ | Nob Hill
* Dumpling Story — Sister to Dumpling Home, with the same XLB mastery served from plush green booths under a monkey chandelier — the vibiest dumpling spot in the city. $$ | Mission / Pacific Heights
* Arsicault Bakery — Third-generation French baker making the best croissant in SF — golden, deeply layered, no gimmicks. The almond croissant and kouign amann are essential. $ | Inner Richmond
* Cinderella Bakery — Russian bakery and café in the Richmond since 1953; vatrushka cheese tart, bird's milk cake, and borscht — a rare window into a tradition almost absent from American cities. $ | Richmond District
* Tartine Bakery — The most influential sourdough bakery in the world; country loaf, morning buns, chocolate croissants. Always a line. $-$$ | Mission
* B Patisserie — 2018 James Beard Outstanding Baker; the kouign amann — caramelized, flaky, impossibly buttery — is one of the great pastries in America. Always a line. $ | Pacific Heights
`;

// --- Parse ---
function parseLine(line) {
	line = line.replace(/^\*\s*/, '').trim();
	if (!line) return null;

	// Extract neighborhood after last |
	const pipeIdx = line.lastIndexOf('|');
	if (pipeIdx === -1) return null;
	const neighborhood = line.slice(pipeIdx + 1).trim();
	line = line.slice(0, pipeIdx).trim();

	// Remove price indicator ($...) at the end
	line = line.replace(/\s*\$[\$\-\/]*\s*$/, '').trim();

	// Split name from description at em dash
	const dashIdx = line.indexOf('—');
	if (dashIdx === -1) return null;

	let namePart = line.slice(0, dashIdx).trim();
	const description = line.slice(dashIdx + 1).trim();

	// Count stars
	const starMatch = namePart.match(/\s*(\*+)\s*$/);
	const stars = starMatch ? starMatch[1].length : 0;
	const name = namePart.replace(/\s*\*+\s*$/, '').trim();

	return { name, stars, description, neighborhood };
}

const entries = raw
	.split('\n')
	.map((l) => l.trim())
	.filter((l) => l.startsWith('*'))
	.map(parseLine)
	.filter(Boolean);

console.log(`Parsed ${entries.length} entries`);

// --- Enrich via Claude (batch) ---
async function batchEnrich(entries) {
	// Fetch existing field options from Airtable schema
	const schemaRes = await fetch(
		`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
		{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
	);
	const schemaData = await schemaRes.json();
	const table = schemaData.tables.find((t) => t.name === AIRTABLE_TABLE_NAME);
	const fieldOptions = {};
	if (table) {
		for (const field of table.fields) {
			if (field.options?.choices) {
				fieldOptions[field.name] = field.options.choices.map((c) => c.name);
			}
		}
	}

	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];

	const list = entries.map((e, i) => `${i + 1}. "${e.name}" — ${e.description}`).join('\n');

	const prompt = `For each restaurant below, return a JSON array where each element has:
- index (integer, matching the number below)
- cuisine (array of strings — the actual cuisine(s), e.g. ["Japanese", "Sushi"])
- category (MUST be exactly one of: ${JSON.stringify(categoryOpts)})
- type (MUST be exactly one of: ${JSON.stringify(typeOpts)})

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

// --- Check for existing records ---
async function fetchExistingNames() {
	const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?fields%5B%5D=Name&pageSize=100`;
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
	});
	const data = await response.json();
	return new Set(data.records.map((r) => r.fields.Name));
}

const existingNames = await fetchExistingNames();
const newEntries = entries.filter((e) => !existingNames.has(e.name));
console.log(`Skipping ${entries.length - newEntries.length} duplicates: ${entries.filter((e) => existingNames.has(e.name)).map((e) => e.name).join(', ')}`);

console.log('Enriching via Claude...');
const enrichments = await batchEnrich(newEntries);
console.log(`Got ${enrichments.length} enrichments`);

// Merge parsed + enriched
const records = newEntries.map((entry, i) => {
	const enrichment = enrichments.find((e) => e.index === i + 1) || {};
	return {
		fields: {
			Name: entry.name,
			City: 'San Francisco',
			Neighborhood: [entry.neighborhood],
			Cuisine: enrichment.cuisine || [],
			Category: enrichment.category || '',
			Type: enrichment.type || 'Restaurant',
			Description: entry.description,
			Stars: entry.stars
		}
	};
});

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

console.log(`Uploading ${records.length} records to Airtable...`);
for (let i = 0; i < records.length; i += 10) {
	const batch = records.slice(i, i + 10);
	const result = await uploadBatch(batch);
	console.log(`  Uploaded batch ${Math.floor(i / 10) + 1}: ${result.records.length} records`);
	// Airtable rate limit: 5 req/sec
	if (i + 10 < records.length) await new Promise((r) => setTimeout(r, 250));
}

console.log('Done!');
