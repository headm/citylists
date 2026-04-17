import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY);

// ── Field mapping helpers ──
// Airtable used PascalCase fields; Supabase uses snake_case columns.
// These helpers translate so the rest of the app stays unchanged.

const toDb = (fields) => ({
	name: fields.Name,
	city: fields.City,
	mode: fields.Mode,
	neighborhood: fields.Neighborhood ? [].concat(fields.Neighborhood) : [],
	cuisine: fields.Cuisine ? [].concat(fields.Cuisine) : [],
	category: fields.Category ?? '',
	type: fields.Type ?? '',
	stars: fields.Stars ?? 0,
	description: fields.Description ?? '',
	url: fields.URL ?? '',
	address: fields.Address ?? '',
	lat: fields.Lat ?? null,
	lng: fields.Lng ?? null,
	photo: fields.Photo ?? '',
	price_level: fields.PriceLevel ?? '',
	hours: fields.Hours ?? '',
	google_rating: fields.GoogleRating ?? null,
	tabelog_rating: fields.TabelogRating ?? null,
	pinned: fields.Pinned ?? false
});

const fromDb = (row) => ({
	id: row.id,
	Name: row.name,
	City: row.city,
	Mode: row.mode,
	Neighborhood: row.neighborhood || [],
	Cuisine: row.cuisine || [],
	Category: row.category || '',
	Type: row.type || '',
	Stars: row.stars || 0,
	Description: row.description || '',
	URL: row.url || '',
	Address: row.address || '',
	Lat: row.lat,
	Lng: row.lng,
	Photo: row.photo || '',
	PriceLevel: row.price_level || '',
	Hours: row.hours || '',
	GoogleRating: row.google_rating || null,
	TabelogRating: row.tabelog_rating || null,
	Pinned: row.pinned || false
});

const candidateToDb = (fields) => ({
	name: fields.Name,
	city: fields.City,
	source: fields.Source ?? '',
	source_url: fields.SourceURL ?? '',
	status: fields.Status ?? 'Pending',
	description: fields.Description ?? '',
	address: fields.Address ?? '',
	lat: fields.Lat ?? null,
	lng: fields.Lng ?? null,
	photo: fields.Photo ?? '',
	price_level: fields.PriceLevel ?? '',
	hours: fields.Hours ?? ''
});

const candidateFromDb = (row) => ({
	id: row.id,
	Name: row.name,
	City: row.city,
	Source: row.source || '',
	SourceURL: row.source_url || '',
	Status: row.status || 'Pending',
	Description: row.description || '',
	Address: row.address || '',
	Lat: row.lat,
	Lng: row.lng,
	Photo: row.photo || '',
	PriceLevel: row.price_level || '',
	Hours: row.hours || ''
});

// ── Places ──

export async function fetchPlaces(city) {
	let query = supabase.from('places').select('*');
	if (city) query = query.eq('city', city);

	const { data, error } = await query;
	if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
	return data.map(fromDb);
}

export async function createPlace(fields) {
	const row = toDb(fields);
	// Only include keys that have defined values
	const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));

	const { data, error } = await supabase.from('places').insert(clean).select().single();
	if (error) throw new Error(`Supabase create failed: ${error.message}`);
	return fromDb(data);
}

export async function updatePlace(id, fields) {
	// Only map fields that were actually provided
	const updates = {};
	if ('Name' in fields) updates.name = fields.Name;
	if ('City' in fields) updates.city = fields.City;
	if ('Mode' in fields) updates.mode = fields.Mode;
	if ('Neighborhood' in fields) updates.neighborhood = [].concat(fields.Neighborhood);
	if ('Cuisine' in fields) updates.cuisine = [].concat(fields.Cuisine);
	if ('Category' in fields) updates.category = fields.Category;
	if ('Type' in fields) updates.type = fields.Type;
	if ('Stars' in fields) updates.stars = fields.Stars;
	if ('Description' in fields) updates.description = fields.Description;
	if ('URL' in fields) updates.url = fields.URL;
	if ('Address' in fields) updates.address = fields.Address;
	if ('Lat' in fields) updates.lat = fields.Lat;
	if ('Lng' in fields) updates.lng = fields.Lng;
	if ('Photo' in fields) updates.photo = fields.Photo;
	if ('PriceLevel' in fields) updates.price_level = fields.PriceLevel;
	if ('Hours' in fields) updates.hours = fields.Hours;
	if ('GoogleRating' in fields) updates.google_rating = fields.GoogleRating;
	if ('TabelogRating' in fields) updates.tabelog_rating = fields.TabelogRating;
	if ('Pinned' in fields) updates.pinned = fields.Pinned;

	const { data, error } = await supabase.from('places').update(updates).eq('id', id).select().single();
	if (error) throw new Error(`Supabase update failed: ${error.message}`);
	return fromDb(data);
}

// ── Field options (hardcoded since we no longer have Airtable schema introspection) ──

export async function fetchFieldOptions() {
	// Query distinct values from the database
	const { data: places } = await supabase.from('places').select('neighborhood, cuisine, category, type');

	const options = {
		Neighborhood: new Set(),
		Cuisine: new Set(),
		Category: new Set(),
		Type: new Set()
	};

	for (const p of places || []) {
		if (p.neighborhood) p.neighborhood.forEach((v) => options.Neighborhood.add(v));
		if (p.cuisine) p.cuisine.forEach((v) => options.Cuisine.add(v));
		if (p.category) options.Category.add(p.category);
		if (p.type) options.Type.add(p.type);
	}

	return {
		Neighborhood: [...options.Neighborhood].sort(),
		Cuisine: [...options.Cuisine].sort(),
		Category: [...options.Category].sort(),
		Type: [...options.Type].sort()
	};
}

export async function fetchNeighborhoodsForCity(city) {
	const { data } = await supabase.from('places').select('neighborhood').eq('city', city);

	const neighborhoods = new Set();
	for (const row of data || []) {
		if (row.neighborhood) row.neighborhood.forEach((v) => neighborhoods.add(v));
	}
	return [...neighborhoods].sort();
}

// ── Candidates ──

export async function fetchCandidates(city, status = 'Pending') {
	let query = supabase.from('candidates').select('*');
	if (city) query = query.eq('city', city);
	if (status) query = query.eq('status', status);

	const { data, error } = await query;
	if (error) throw new Error(`Supabase candidates fetch failed: ${error.message}`);
	return data.map(candidateFromDb);
}

export async function fetchCandidateById(id) {
	const { data, error } = await supabase.from('candidates').select('*').eq('id', id).single();
	if (error) throw new Error(`Supabase candidate fetch failed: ${error.message}`);
	return candidateFromDb(data);
}

export async function createCandidate(fields) {
	const row = candidateToDb(fields);
	const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));

	const { data, error } = await supabase.from('candidates').insert(clean).select().single();
	if (error) throw new Error(`Supabase candidate create failed: ${error.message}`);
	return candidateFromDb(data);
}

export async function updateCandidate(id, fields) {
	const updates = {};
	if ('Name' in fields) updates.name = fields.Name;
	if ('City' in fields) updates.city = fields.City;
	if ('Source' in fields) updates.source = fields.Source;
	if ('SourceURL' in fields) updates.source_url = fields.SourceURL;
	if ('Status' in fields) updates.status = fields.Status;
	if ('Description' in fields) updates.description = fields.Description;
	if ('Address' in fields) updates.address = fields.Address;
	if ('Lat' in fields) updates.lat = fields.Lat;
	if ('Lng' in fields) updates.lng = fields.Lng;
	if ('Photo' in fields) updates.photo = fields.Photo;
	if ('PriceLevel' in fields) updates.price_level = fields.PriceLevel;
	if ('Hours' in fields) updates.hours = fields.Hours;

	const { data, error } = await supabase.from('candidates').update(updates).eq('id', id).select().single();
	if (error) throw new Error(`Supabase candidate update failed: ${error.message}`);
	return candidateFromDb(data);
}
