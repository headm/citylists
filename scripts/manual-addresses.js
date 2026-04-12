import 'dotenv/config';

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const MAPBOX = process.env.MAPBOX_ACCESS_TOKEN;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const base = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

const cityGeo = {
	'San Francisco': { proximity: '-122.44,37.76', bbox: '-122.55,37.70,-122.35,37.85' },
	'Tokyo': { proximity: '139.69,35.68', bbox: '139.50,35.50,139.95,35.85' }
};

const manualAddresses = {
	'THE FRONT ROOM': '2-4-1 Marunouchi, Chiyoda City, Tokyo 100-6301',
	'Ramenya Shima': '3-41-11 Honmachi, Shibuya City, Tokyo 151-0071',
	"JB's TOKYO": '1-33-3 Yoyogi, Shibuya City, Tokyo 151-0053',
	'Argile': '5-4-6 Ginza, Chuo-ku, Tokyo 104-0061',
	'Ramen Yamaguchi': '3-13-4 Nishi-Waseda, Shinjuku-ku, Tokyo 169-0051',
	'Ginza Ichigo': '6-12-15 Ginza, Chuo City, Tokyo 104-0061',
	'Honda Tokyo Noodle Works': '1-19 Kanda-Hanaokacho, Chiyoda City, Tokyo',
	'2-Chome Tsukemen Gachi': '2-17-10 Shinjuku, Shinjuku, Tokyo 160-0022',
	'Cremia Ice Cream': '1-20-1 Asakusa, Taito-ku, Tokyo 111-0032',
	'Soushi Menya Musashi': '7-2-6 Nishishinjuku, Shinjuku City, Tokyo 160-0023',
	'Tori Chataro': '7-12 Uguisudanicho, Shibuya-ku, Tokyo 150-0032',
	'American Diner ANDRA': '5-13-7 Higashiueno, Taito City, Tokyo 110-0015',
	'Naruse': '5-16-52 Roppongi, Minato City, Tokyo 106-0032',
	'Ginza Hachigou': '3-14-2 Ginza, Chuo-ku, Tokyo 104-0061',
	'Namae-no-nai Sushiya': '1-12 Kabukicho, Shinjuku City, Tokyo 160-0021',
	'Yakiniku Kappo Note': '2-9-5 Azabujuban, Minato City, Tokyo 106-0045',
	'Sushi Yuu': '1-4-15 Nishiazabu, Minato City, Tokyo 106-0031',
	'Teuchi': '2-13-7 Kamimeguro, Meguro City, Tokyo 153-0051',
	'Bar Meijiu': '2-7-2 Fujimi, Chiyoda-ku, Tokyo 102-0071',
	'Sushidokoro Kiraku': '1-12-12 Kyodo, Setagaya-ku, Tokyo 156-0052',
	'Benitsuru Pancake': '2-1-11 Nishiasakusa, Taito City, Tokyo 111-0035',
	'Fukasaka': '2-7-23 Minamiazabu, Minato-ku, Tokyo',
	'Bar Centifolia': '1-6-5 Azabujuban, Minato City, Tokyo 106-0045',
	'Men Kurai': '1-3-4 Shiba, Minato-ku, Tokyo',
	'Cinderella Bakery': '436 Balboa St, San Francisco, CA 94118',
	"Mama's Boy Pizza": '15 Grand Ave, Oakland, CA 94612',
	'The Happy Crane': '451 Gough St, San Francisco, CA 94102',
	'Mijoté': '2400 Harrison St, San Francisco, CA 94110',
	'Showa Le Gourmet Tonkatsu': '1550 Howard St, San Francisco, CA 94103',
	'Side A': '2814 19th St, San Francisco, CA 94110'
};

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

// Fetch all records to match by name
async function fetchAllRecords() {
	const records = [];
	let offset;
	do {
		const url = `${base}?fields%5B%5D=Name&fields%5B%5D=City&pageSize=100${offset ? '&offset=' + offset : ''}`;
		const res = await fetch(url, { headers });
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);
	return records;
}

const allRecords = await fetchAllRecords();
console.log(`Loaded ${allRecords.length} records`);

const updates = [];
for (const [name, address] of Object.entries(manualAddresses)) {
	const record = allRecords.find(r => r.fields.Name === name);
	if (!record) {
		console.log(`  ⚠ Record not found: ${name}`);
		continue;
	}

	const city = record.fields.City || 'Tokyo';
	const coords = await geocodeAddress(address, city);
	if (!coords) {
		console.log(`  ⚠ Could not geocode: ${name} (${address})`);
		continue;
	}

	updates.push({
		id: record.id,
		fields: { Address: address, Lat: coords.lat, Lng: coords.lng }
	});
	console.log(`  ✓ ${name} → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
	await new Promise(r => setTimeout(r, 100));
}

// Upload in batches of 10
for (let i = 0; i < updates.length; i += 10) {
	const batch = updates.slice(i, i + 10);
	const res = await fetch(base, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ records: batch })
	});
	const data = await res.json();
	console.log(`Uploaded batch: ${data.records.length} records`);
	await new Promise(r => setTimeout(r, 250));
}

console.log(`Done! ${updates.length} updated`);
