/**
 * Backfill durable place photos.
 *
 * Why this exists: `places.photo` used to hold Google photo resource names
 * (`places/<id>/photos/<photo_id>`) or full media URLs. Google rotates the
 * photo-id generation, so every stored reference eventually returns
 * 400 INVALID_ARGUMENT and every image on the site breaks at once.
 *
 * This script migrates to a scheme that cannot go stale:
 *   1. Derive the durable place ID — usually already embedded in the stored
 *      value, so no API call is needed for it.
 *   2. Resolve a *fresh* photo name from that place ID.
 *   3. Download the image bytes and cache them in Supabase Storage.
 *   4. Rewrite `places.photo` to the bare place ID.
 *
 * After this, images are served from storage and never expire. If an object is
 * ever missing, /api/photo re-resolves it from the place ID automatically.
 *
 * Usage:
 *   node scripts/backfill-photos.js                  # all places
 *   node scripts/backfill-photos.js --city Tokyo
 *   node scripts/backfill-photos.js --dry-run
 *   node scripts/backfill-photos.js --force          # re-download even if cached
 *   node scripts/backfill-photos.js --table candidates
 *   node scripts/backfill-photos.js --sizes 400      # cache fewer variants
 *   node scripts/backfill-photos.js --limit 10       # try a small batch first
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
	BUCKET,
	SIZES,
	ensureBucket,
	extractPlaceId,
	fetchPhotoBytes,
	objectPath,
	putCached,
	putMarker,
	resolvePhotoName
} from '../src/lib/server/photos.js';

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

for (const [name, value] of [
	['GOOGLE_PLACES_API_KEY', PLACES_KEY],
	['PUBLIC_SUPABASE_URL', SUPABASE_URL],
	['SUPABASE_SECRET_KEY', SUPABASE_KEY]
]) {
	if (!value) {
		console.error(`${name} must be set in .env`);
		process.exit(1);
	}
}

// ── Args ──
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
	const i = argv.indexOf(`--${name}`);
	return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const city = value('city');
const table = value('table', 'places');
const limit = value('limit') ? Number(value('limit')) : null;
const dryRun = flag('dry-run');
const force = flag('force');
const sizes = value('sizes')
	? value('sizes')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((s) => SIZES.includes(s))
	: SIZES;

if (!['places', 'candidates'].includes(table)) {
	console.error(`--table must be "places" or "candidates" (got "${table}")`);
	process.exit(1);
}
if (!sizes.length) {
	console.error(`--sizes must be a subset of ${SIZES.join(',')}`);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Search by name + city for rows whose stored value has no usable place ID. */
async function findPlaceIdByName(name, cityName) {
	const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': PLACES_KEY,
			'X-Goog-FieldMask': 'places.id'
		},
		body: JSON.stringify({ textQuery: `${name}, ${cityName}` })
	});
	if (!res.ok) throw new Error(`searchText ${res.status}`);
	const data = await res.json();
	return data.places?.[0]?.id ?? null;
}

/** True when every requested size is already cached for this place. */
async function isFullyCached(placeId) {
	const { data, error } = await supabase.storage.from(BUCKET).list(placeId, { limit: 100 });
	if (error) return false;
	const names = new Set((data ?? []).map((f) => f.name));
	if (names.has('none')) return true; // known to have no photo
	return sizes.every((s) => names.has(`${s}.img`));
}

// ── Run ──
console.log(`Backfilling ${table}${city ? ` in ${city}` : ''} → sizes ${sizes.join(', ')}`);
if (dryRun) console.log('DRY RUN — no writes\n');

if (!dryRun) {
	const created = await ensureBucket(supabase);
	console.log(created ? `Created public bucket "${BUCKET}"` : `Bucket "${BUCKET}" already exists`);
}

// Ordered so --limit picks a stable subset and interrupted runs resume predictably.
let query = supabase.from(table).select('id, name, city, photo').order('id');
if (city) query = query.eq('city', city);
const { data: rows, error } = await query;
if (error) {
	console.error('Fetch error:', error.message);
	process.exit(1);
}

const targets = limit ? rows.slice(0, limit) : rows;
console.log(`Found ${rows.length} rows${limit ? `, processing ${targets.length}` : ''}\n`);

const stats = { cached: 0, skipped: 0, noPhoto: 0, searched: 0, failed: 0, cleared: 0 };
const failures = [];

for (const [index, row] of targets.entries()) {
	const label = `[${index + 1}/${targets.length}] ${row.name}`;

	try {
		// 1. Durable place ID — from the stored value when possible (free), else search.
		let placeId = extractPlaceId(row.photo);
		let viaSearch = false;

		if (!placeId) {
			if (dryRun) {
				console.log(`${label}: would search by name (no place ID in stored value)`);
				stats.searched++;
				continue;
			}
			placeId = await findPlaceIdByName(row.name, row.city);
			viaSearch = true;
			stats.searched++;
			await sleep(120);
		}

		if (!placeId) {
			// Nothing resolvable — clear the dead reference so the UI stops trying.
			if (!dryRun) await supabase.from(table).update({ photo: '' }).eq('id', row.id);
			console.log(`${label}: no place found, cleared photo`);
			stats.cleared++;
			continue;
		}

		// 2. Skip work that is already done.
		if (!force && !dryRun && row.photo === placeId && (await isFullyCached(placeId))) {
			stats.skipped++;
			continue;
		}

		if (dryRun) {
			console.log(`${label}: would cache ${sizes.join('/')} for ${placeId}`);
			stats.cached++;
			continue;
		}

		// 3. Fresh photo name, then bytes for each size.
		const photoName = await resolvePhotoName(placeId, PLACES_KEY);
		if (!photoName) {
			await putMarker(supabase, placeId);
			await supabase.from(table).update({ photo: placeId }).eq('id', row.id);
			console.log(`${label}: Google has no photo, marked`);
			stats.noPhoto++;
			await sleep(120);
			continue;
		}

		let bytesTotal = 0;
		for (const size of sizes) {
			const { bytes, contentType } = await fetchPhotoBytes(photoName, size, PLACES_KEY);
			await putCached(supabase, objectPath(placeId, size), bytes, contentType);
			bytesTotal += bytes.length;
			await sleep(120);
		}

		// 4. Store the durable ID.
		await supabase.from(table).update({ photo: placeId }).eq('id', row.id);

		const kb = Math.round(bytesTotal / 1024);
		console.log(`${label}: cached ${kb}KB${viaSearch ? ' (found by search)' : ''}`);
		stats.cached++;
	} catch (err) {
		console.log(`${label}: FAILED — ${err.message}`);
		failures.push({ name: row.name, city: row.city, error: err.message });
		stats.failed++;
		await sleep(250);
	}
}

// ── Summary ──
console.log('\n── Summary ──');
console.log(`cached:      ${stats.cached}`);
console.log(`skipped:     ${stats.skipped} (already current)`);
console.log(`no photo:    ${stats.noPhoto}`);
console.log(`cleared:     ${stats.cleared}`);
console.log(`by search:   ${stats.searched}`);
console.log(`failed:      ${stats.failed}`);

if (failures.length) {
	console.log('\nFailures (safe to re-run — the script is idempotent):');
	for (const f of failures) console.log(`  ${f.name} (${f.city}): ${f.error}`);
	process.exitCode = 1;
}
