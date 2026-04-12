import 'dotenv/config';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Places';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const raw = `
SHINJUKU
Things to explore
* Shinjuku Gyoen Garden — Blend of Japanese and Western garden styles; a must for cherry blossoms and autumn colors.
* Golden Gai — Compact network of narrow alleyways packed with tiny, atmospheric bars — one of Tokyo's most unique experiences.
* Omoide Yokocho — Postwar-era alley filled with smoky yakitori stalls and tiny bars.
* Tokyo Metropolitan Government Building — Free observation deck on the 45th floor with sweeping views (and free entry — best value view in Tokyo).
* Kabukicho — Lively red-light and entertainment district filled with bars, host clubs, restaurants, and neon nightlife.
* Hanazono Shrine — Peaceful Shinto shrine hidden right next to Golden Gai; quick, atmospheric stop.
Food
* Ishikawa — Michelin three-star kaiseki in Kagurazaka — meticulously crafted multi-course meals in a refined, traditional setting. The top reservation to chase.
* Park Hyatt New York Bar — Iconic Tokyo rooftop bar with skyline views, jazz ambiance, and classic cocktails.
* Benfiddich — Innovative, intimate cocktail bar specializing in herb-infused and experimental drinks — regularly ranked among the world's best.
* Tsukemen Gonokami Seisakusho — Shrimp-infused tsukemen with tomato-style option and umami sweetness near Shinjuku Gyoen.
* Fūunji — Famous rich tsukemen dipping noodles south of Shinjuku Station — perennial queue for good reason.
* Sushi Mitani — High-end sushi in Yotsuya; Silver award, rating 4.54.
* Gyukatsu Motomura — Cook-your-own beef cutlet on a mini skillet — fun, filling, reliable.
* Ramen Yamaguchi — Subtle, refreshing chicken-based ramen with tender sous-vide chashu.
* Teuchi — Highest-rated soba restaurant in Shinjuku (Tabelog). Excellent soba with tempura.
* Tsunahachi — Historic tempura institution since 1923, serving crisp, classic Edo-style tempura near Shinjuku Station.
* Namae-no-nai Sushiya — Tiny standing-room sushi bar famous for its 10-yen sushi promotion (limited to 15 pieces).
* Onigiri Manma — Inventive onigiri fillings like grilled salmon with roe, seasoned meat with cured yolk, bacon with cream cheese.
* 2-Chome Tsukemen Gachi — Loud, energetic tsukemen spot known for generous noodles and tempura-battered bamboo shoots.

SHIBUYA
Things to explore
* Shibuya Sky — Open-air rooftop observation deck atop Shibuya Scramble Square — arguably the best view in Tokyo. Book in advance.
* Meiji Shrine — Serene forested shrine in central Tokyo — a complete contrast to Shibuya's chaos.
* Shibuya Crossing — Iconic pedestrian scramble in front of Shibuya Station.
* Harajuku / Takeshita Street — Trendy neighborhood famous for youth fashion, colorful street style, and quirky boutiques.
* Yoyogi Park — Spacious, leafy park popular for picnics, street performances, and seasonal events.
* Cat Street (Ura-Harajuku) — Low-key boutique-lined pedestrian street linking Harajuku to Omotesando.
* HARRY HARAJUKU Terrace — Rooftop animal-encounter spot where you can interact with otters, hedgehogs, chinchillas, and rabbits.
Food
* Menchirashi — TikTok-famous spot serves house-made Sanuki udon with a carbonara twist — guanciale, egg yolk, parmesan
* Den — Michelin-starred restaurant blending modern creativity with traditional kaiseki — one of Tokyo's most joyful fine-dining experiences.
* Tsuta Japanese Soba Noodles — Michelin-starred truffle ramen with meticulously sourced ingredients (now in Yoyogi-Uehara).
* JB's TOKYO — Smash burgers made from 100% homemade from Hokkaido-flour buns and hand-formed patties
* Koffee Mameya — Minimalist café in Omotesando known for expertly crafted coffee flights.
* Sincere — Japanese-inflected French cuisine delivered with refined execution at larger scale.
* Tamawarai — Soba specialty where hand-made noodles are paired with refined sides like soba miso and creamy yuba.
* Oreryu Shio Ramen — About 10 minutes from Shibuya Crossing. Famous for shio butter corn ramen — light, creamy, buttery.
* Ichinoya — Traditional unagi courses for stamina, served in a quirky, eel-themed setting.
* Afuri — Harajuku branch of the famous yuzu shio ramen — bright, citrusy, refreshing.
* Ramenya Shima — Konbusui tsukemen elevates dipping noodles with umami-rich kelp water.
* Tori Chataro — Silver award yakitori, rating 4.11.
* Harajuku Gyozaro — Popular gyoza spot in trendy Harajuku — pan-fried or steamed, à la carte or sets.
* Soushi Menya Musashi — Tsukemen with pork and egg.

MINATO
Things to explore
* Ritz-Carlton Tokyo — The flagship luxury hotel occupying the top floors of Tokyo Midtown Tower, with sweeping views of Tokyo Tower and Mount Fuji on clear days
* TeamLab Borderless (Azabudai Hills) — Reopened 2024 at Azabudai Hills — immersive digital art that has to be seen in person. Book ahead.
* Mori Art Museum & Roppongi Hills Observatory — Top contemporary art museum and city view in the same building.
* Nezu Museum — Exquisite Japanese and East Asian art in a Kengo Kuma building with one of Tokyo's loveliest gardens (Minami-Aoyama).
* Tokyo Tower — Classic red-and-white symbol of postwar Tokyo; best at dusk.
* Zojoji Temple — Major Edo-era temple right next to Tokyo Tower — ideal photo pairing.
* Roppongi — Tokyo's nightlife and art district — bars, clubs, and cultural attractions.
Food
* Sushi Saito — Renowned for precise Edomae technique and exceptional shari rice; widely called Tokyo's top sushi experience.
* Nihonryori RyuGin — Three-Michelin-star modern kaiseki in Hibiya/Midtown — a landmark of contemporary Japanese fine dining.
* Sazenka — Refined contemporary Chinese cuisine with Japanese sensibilities — three-Michelin-star in Minami-Azabu.
* Higashi-Azabu Amamoto — Intimate, high-end dining with refined traditional Japanese flavors.
* Sushi Yuu — Traditional Edomae sushi in a quiet Roppongi-adjacent spot; chef Shimazaki creates a relaxed, multilingual experience.
* Butagumi — Tonkatsu in a romantic, traditional 60-year-old house; premium heirloom-breed pork with house-made Worcestershire sauce.
* Yakitori Imai — Contemporary yakitori in Minami-Aoyama with an open kitchen; high-quality chicken skewers, French pigeon, and assorted grilled vegetables.
* Takazawa — Michelin-level 10-seat fine-dining experience in Akasaka.
* Sumibiyakiniku Nakahara — Chic, smoke-free yakiniku in Azabu-Juban specializing in premium wagyu — seven-item tasting menu, beef "prosciutto," tartare, expertly grilled tongue.
* Miyasaka — Contemporary Japanese dining in a sleek Aoyama setting.
* Toraya Akasaka — Historic wagashi house since the 16th century; flagship Akasaka location features a café, retail, and museum with offerings like matcha or fruit kakigori.
* Sakurai Japanese Tea Experience — Specialist tearoom offering meticulously brewed matcha, sencha, and hojicha at the counter.
* Naruse — One of Tokyo's best value-for-money unagi — basement level, half-eel set meals under ¥2,000.
* Brocolage Bread — Casual, high-quality café by top chefs offering soups, salads, pastries, coffee, and tartines.
* Men Kurai — Garlicky abura soba with massive hand-cut noodles (no soup).

TAITO
Things to explore
* Sensō-ji Temple — Historic Tokyo temple with bustling approach street — best visited early morning or at night when crowds thin.
* Nakamise-dori — Historic shopping street leading to Sensō-ji, lined with stalls selling traditional snacks, souvenirs, and crafts.
* Kappabashi Kitchen Street — Tokyo's kitchenware district — ceramics, knives, and the famous plastic food samples. A chef's dream.
* Hoppy Street (Hoppy-dori) — Lively open-air drinking street behind Sensō-ji — cheap izakaya food, day-drinking locals, lots of atmosphere.
* Sumida River area — River cruises or skyline views of Tokyo Skytree.
Food
* American Diner ANDRA — Viral for its "Touchdown Burger" — a smash burger halved and bathed in sizzling hot cheese sauce
* Benitsuru Pancake — A tiny 14-seat counter shop famous for jiggly rice-flour soufflé pancakes
* Iyoshi Cola Asakusa Rokku — Japan's first craft cola maker, drawing on a family recipe rooted in traditional Japanese herbal medicine, serving handmade spiced cola in a preserved Shōwa-era entertainment district storefront.
* Tenko (Tempura Tenko Honten) — Famed Asakusa tempura in a former geisha teahouse; delicate, freshly fried vegetables and seafood, best with just salt.
* Asakusa Imahan — Historic sukiyaki house since 1895 — classic Tokyo beef-hot-pot experience.
* Daikokuya — Iconic tempura-don shop (since 1887) by Sensō-ji — dark sesame-oil tempura over rice.

CHUO
Things to explore
* Tsukiji Outer Market — The old Tsukiji market's outer stalls remain — the single best food-browsing experience in Tokyo. Go hungry, go early.
* Ginza Shopping District — Luxury brands, elegant department stores (don't miss the depachika food halls).
* Kabukiza Theater — Traditional kabuki performances — single-act tickets let you sample for ~30 min.
* Nihonbashi Bridge & Coredo — Historic "zero milestone" of Japan's roads, with restored merchant-district shops nearby.
Food
* Iroriya Higashiginzaten — A theatrical basement izakaya best known for its overflowing salmon roe bowls
* Ginza Hachigou — A Michelin-starred, six-seat noodle bar serving French-inflected ramen made with chicken, duck, and cured ham.
* Sushi Yoshitake — Three-Michelin-star Edomae sushi with a focus on seasonal ingredients and meticulous technique.
* Sushi Sawada — Gold award sushi in Ginza, promoted from Silver, rating 4.55 — one of the hardest seats in Tokyo.
* Sushi Kanesaka — Traditional Edomae experience using the best ingredients of the day.
* Sushidokoro Kiraku — Michelin-starred, refined sushi experience with seasonal focus and traditional technique.
* Tempura Kondo — Tempura omakase where precision, temperature control, and custom oil blends yield perfectly cooked pieces.
* Ginza Shinohara — Creative Japanese cuisine with wild local ingredients — reservations highly coveted.
* Kyubey — Ginza sushi institution since 1935 — classic, approachable top-tier Edomae and a great entry to high-end sushi.
* Birdland — Michelin-starred yakitori under Ginza station — celebrated for liver mousse and chicken-and-egg rice.
* Shima — High-end steak restaurant in Nihonbashi — reservations recommended.
* Argile — Stylish fine-dining in Royal Crystal Ginza.
* Esquisse Cinq — Seasonal desserts and inventive chocolates showcase patisserie expertise in central Ginza.
* Chukasoba Ginza Hachigo — Rich ramen with Parma ham, duck, and shellfish flavors in a hospitable setting.
* Bistro Marx — Thierry Marx's bistro dazzles with a modernist menu and terrace views over Ginza Crossing.
* Kagari Ramen — Creamy chicken tori paitan broth with thin noodles and seasonal vegetables; customize with ginger, fried garlic, vinegar.
* Ginza Ichigo — High-end sushi destination in the heart of Ginza.
* Ginza Kazami — Umami-rich sake kasu and shio ramen down a quiet alley.
* Torigin Honten — Yakitori and kamameshi specialist in a narrow Ginza alley — grilled skewers plus individual rice pots.
* Shabusen — Casual counter-style hot pot — sukiyaki or shabu-shabu with wagyu or pork, amid traditional folk craft décor.

CHIYODA
Things to explore
* Imperial Palace East Gardens — Expansive gardens and historic moats — the East Gardens are free and open most days.
* Tokyo Station (Marunouchi Building) — Beautifully restored 1914 red-brick façade — iconic architecture and great rooftop views from KITTE nearby.
* Akihabara — Tokyo's electronics and otaku district — gadgets, anime, manga, and gaming stores.
* Yasukuni Shrine & Chidorigafuchi — Major Meiji-era shrine; the adjacent Chidorigafuchi moat is Tokyo's top cherry blossom row-boat spot.
Food
* THE FRONT ROOM — Famous for its thick, pudding-soft brioche French toast that draws long queues even on weekday mornings.
* BUTTER — Pancakes with an absurd full stick of house-made butter on top
* Kanda Yabu Soba — Historic Meiji-era soba house (since 1880) — a living piece of Tokyo food history.
* Honda Tokyo Noodle Works — In-house Hokkaido flour noodles shine in tsukemen and soupless tantanmen.
* Jimbocho Kurosu — Shio and shoyu ramen showcasing choice ingredients with subtle seasonal variations.
* Bar Meijiu — Cocktail and music bar where bartender Keisuke Matsumoto creates bespoke drinks tailored to each guest's mood.

SUMIDA
Things to explore
* Tokyo Skytree — At 634m, the tallest structure in Japan — observation decks, shopping, and aquarium at the base.
* Sumo stables (Ryogoku) — Training centers where wrestlers live, train, and follow strict daily routines under their stablemaster. Morning practice viewing requires advance arrangement.
* Sumida Hokusai Museum — Sleek Kazuyo Sejima-designed museum dedicated to Hokusai, who was born in this neighborhood.
Food
* Tomoegata — Classic chanko-nabe (sumo stew) in Ryogoku — the dish that fuels sumo wrestlers.

KOTO
Things to explore
* teamLab Planets TOKYO — Barefoot, water-walking immersive art experience in Toyosu — arguably more fun than Borderless. Extended through 2027.
* Toyosu Market — Tokyo's modern wholesale fish market, famous for tuna auctions and fresh seafood stalls.
Food
* Sushi Dai / Daiwa Sushi (Toyosu) — The legendary Tsukiji sushi breakfast spots, relocated inside Toyosu Market — go very early.

MEGURO
Things to explore
* Meguro River cherry blossoms — One of Tokyo's most beautiful hanami spots — ~800 cherry trees lining the canal (late March/early April).
* Nakameguro / Daikanyama — Calm, stylish canal-side neighborhoods with cafes and boutiques — don't miss Daikanyama T-Site (Tsutaya Books).
Food
* Masakichi — Featured on "Ugly Delicious." Chef Masahiko Kodama serves what David Chang called the best yakitori he's ever had. Tebasaki (chicken wing) is particularly famous. Tiny — reservations essential.
* Yakumo Saryo — Serene, elegant omakase with tea pairing in residential Yakumo — one of Tokyo's most tranquil high-end experiences.
* Tonki — Historic tonkatsu institution since 1939 — counter seats, a culinary ballet, and possibly the most famous tonkatsu in Tokyo.
* Saido — Rated #1 vegan restaurant in the world by Happy Cow in 2020. Creative plant-based versions of katsu and unagi in four-course sets.
`;

// --- Parse ---
function parseAll(text) {
	const entries = [];
	let currentNeighborhood = null;
	let currentSection = null; // 'food' or 'explore'

	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Section headers (all caps, no bullet)
		if (/^[A-Z][A-Z\s()\/]+$/.test(trimmed) && !trimmed.startsWith('*')) {
			currentNeighborhood = trimmed.split('(')[0].trim();
			// Title case
			currentNeighborhood = currentNeighborhood.split(' ').map(w =>
				w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
			).join(' ');
			currentSection = null;
			continue;
		}

		if (/^things to explore$/i.test(trimmed)) { currentSection = 'explore'; continue; }
		if (/^food$/i.test(trimmed)) { currentSection = 'food'; continue; }
		if (!trimmed.startsWith('*')) continue;

		const clean = trimmed.replace(/^\*\s*/, '');
		const dashIdx = clean.indexOf('—');
		if (dashIdx === -1) continue;

		const name = clean.slice(0, dashIdx).trim();
		const description = clean.slice(dashIdx + 1).trim();

		entries.push({
			name,
			description,
			neighborhood: currentNeighborhood,
			mode: currentSection === 'explore' ? 'Things to Do' : 'Food & Drink'
		});
	}

	return entries;
}

const entries = parseAll(raw);
console.log(`Parsed ${entries.length} entries (${entries.filter(e => e.mode === 'Food & Drink').length} food, ${entries.filter(e => e.mode === 'Things to Do').length} things to do)`);

// --- Check for existing records ---
async function fetchExistingNames() {
	const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}` };
	const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
	let allNames = new Set();
	let offset;
	do {
		const url = `${base}?fields%5B%5D=Name&filterByFormula=${encodeURIComponent('{City}="Tokyo"')}&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		data.records.forEach(r => allNames.add(r.fields.Name));
		offset = data.offset;
	} while (offset);
	return allNames;
}

const existingNames = await fetchExistingNames();
const newEntries = entries.filter(e => !existingNames.has(e.name));
const skipped = entries.length - newEntries.length;
if (skipped > 0) console.log(`Skipping ${skipped} duplicates`);

// --- Batch enrich food entries via Claude ---
const foodEntries = newEntries.filter(e => e.mode === 'Food & Drink');
const activityEntries = newEntries.filter(e => e.mode === 'Things to Do');

async function batchEnrichFood(entries) {
	// Fetch existing field options
	const schemaRes = await fetch(
		`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
		{ headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
	);
	const schemaData = await schemaRes.json();
	const table = schemaData.tables.find(t => t.name === AIRTABLE_TABLE_NAME);
	const fieldOptions = {};
	if (table) {
		for (const field of table.fields) {
			if (field.options?.choices) {
				fieldOptions[field.name] = field.options.choices.map(c => c.name);
			}
		}
	}

	const categoryOpts = fieldOptions.Category || [];
	const typeOpts = fieldOptions.Type || [];

	const list = entries.map((e, i) => `${i + 1}. "${e.name}" — ${e.description}`).join('\n');

	const prompt = `For each Tokyo restaurant/food spot below, return a JSON array where each element has:
- index (integer, matching the number below)
- cuisine (array of strings — the actual cuisine(s))
- category (MUST be exactly one of: ${JSON.stringify(categoryOpts)})
- type (MUST be exactly one of: ${JSON.stringify(typeOpts)})
- stars (integer 0-3 — Michelin stars, 0 if none/unknown)

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

let enrichments = [];
if (foodEntries.length > 0) {
	console.log(`Enriching ${foodEntries.length} food entries via Claude...`);
	enrichments = await batchEnrichFood(foodEntries);
	console.log(`Got ${enrichments.length} enrichments`);
}

// --- Build records ---
const records = [];

// Food entries with enrichment
foodEntries.forEach((entry, i) => {
	const enrichment = enrichments.find(e => e.index === i + 1) || {};
	records.push({
		fields: {
			Name: entry.name,
			City: 'Tokyo',
			Mode: 'Food & Drink',
			Neighborhood: [entry.neighborhood],
			Cuisine: enrichment.cuisine || [],
			Category: enrichment.category || '',
			Type: enrichment.type || 'Restaurant',
			Description: entry.description,
			Stars: enrichment.stars || 0
		}
	});
});

// Activity entries — no enrichment needed
activityEntries.forEach(entry => {
	records.push({
		fields: {
			Name: entry.name,
			City: 'Tokyo',
			Mode: 'Things to Do',
			Neighborhood: [entry.neighborhood],
			Type: 'Activity',
			Description: entry.description
		}
	});
});

// --- Upload to Airtable ---
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
	if (i + 10 < records.length) await new Promise(r => setTimeout(r, 250));
}

console.log('Done!');
