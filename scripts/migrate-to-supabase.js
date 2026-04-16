import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const PLACES_TABLE = process.env.AIRTABLE_TABLE_NAME || 'Places';
const CANDIDATES_TABLE = 'Candidates';

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const airtableHeaders = {
	Authorization: `Bearer ${AIRTABLE_TOKEN}`,
	'Content-Type': 'application/json'
};

async function fetchAllAirtable(tableName) {
	const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`;
	const records = [];
	let offset;

	do {
		const url = new URL(baseUrl);
		url.searchParams.set('pageSize', '100');
		if (offset) url.searchParams.set('offset', offset);

		const res = await fetch(url, { headers: airtableHeaders });
		if (!res.ok) {
			console.error(`Failed to fetch ${tableName}: ${res.status}`);
			break;
		}
		const data = await res.json();
		records.push(...data.records);
		offset = data.offset;
	} while (offset);

	return records;
}

// ── Migrate Places ──
console.log('Fetching places from Airtable...');
const airtablePlaces = await fetchAllAirtable(PLACES_TABLE);
console.log(`  Found ${airtablePlaces.length} places`);

if (airtablePlaces.length > 0) {
	const rows = airtablePlaces.map((r) => {
		const f = r.fields;
		return {
			name: f.Name || '',
			city: f.City || '',
			mode: f.Mode || 'Food & Drink',
			neighborhood: f.Neighborhood ? [].concat(f.Neighborhood) : [],
			cuisine: f.Cuisine ? [].concat(f.Cuisine) : [],
			category: f.Category || '',
			type: f.Type || '',
			stars: f.Stars || 0,
			description: f.Description || '',
			url: f.URL || '',
			address: f.Address || '',
			lat: f.Lat || null,
			lng: f.Lng || null,
			photo: f.Photo || '',
			price_level: f.PriceLevel || '',
			hours: f.Hours || ''
		};
	});

	console.log('Inserting places into Supabase...');
	for (let i = 0; i < rows.length; i += 100) {
		const batch = rows.slice(i, i + 100);
		const { data, error } = await supabase.from('places').insert(batch).select();
		if (error) {
			console.error(`  Error: ${error.message}`);
		} else {
			console.log(`  Inserted ${data.length} places (batch ${Math.floor(i / 100) + 1})`);
		}
	}
}

// ── Migrate Candidates ──
console.log('\nFetching candidates from Airtable...');
const airtableCandidates = await fetchAllAirtable(CANDIDATES_TABLE);
console.log(`  Found ${airtableCandidates.length} candidates`);

if (airtableCandidates.length > 0) {
	const rows = airtableCandidates.map((r) => {
		const f = r.fields;
		return {
			name: f.Name || '',
			city: f.City || '',
			source: f.Source || '',
			source_url: f.SourceURL || '',
			status: f.Status || 'Pending',
			description: f.Description || '',
			address: f.Address || '',
			lat: f.Lat || null,
			lng: f.Lng || null,
			photo: f.Photo || '',
			price_level: f.PriceLevel || '',
			hours: f.Hours || ''
		};
	});

	console.log('Inserting candidates into Supabase...');
	for (let i = 0; i < rows.length; i += 100) {
		const batch = rows.slice(i, i + 100);
		const { data, error } = await supabase.from('candidates').insert(batch).select();
		if (error) {
			console.error(`  Error: ${error.message}`);
		} else {
			console.log(`  Inserted ${data.length} candidates (batch ${Math.floor(i / 100) + 1})`);
		}
	}
}

console.log('\nMigration complete!');
