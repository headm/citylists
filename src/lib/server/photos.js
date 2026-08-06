/**
 * Durable place photos.
 *
 * Google's photo resource names (`places/<place_id>/photos/<photo_id>`) are
 * ephemeral — Google rotates the `<photo_id>` generation and old ones start
 * returning 400 INVALID_ARGUMENT. Storing them means every image eventually
 * breaks, which is exactly what happened to the original `AU_ZVE*` generation.
 *
 * Place IDs, by contrast, are durable. So we store only the place ID and cache
 * the actual image bytes in Supabase Storage. Once cached, an image can never
 * go stale; if it is ever missing we re-resolve a fresh photo name from the
 * place ID and re-cache it, so the system self-heals.
 *
 * This module deliberately imports no SvelteKit `$env`/`$lib` bindings — the
 * API key and Supabase client are passed in — so `scripts/` can import it
 * directly under plain Node.
 */

export const BUCKET = 'place-photos';

/** Cached variants, in px. Requests are rounded up to one of these. */
export const SIZES = [400, 800];

/** Marker object written when Google has no photo for a place, so we don't re-ask on every view. */
const NO_PHOTO_MARKER = 'none';

/**
 * Round a requested width to the nearest cached variant.
 * Card thumbnails (~120px) map to 400 so they stay crisp on retina screens.
 */
export function normalizeSize(requested) {
	const n = Number(requested);
	if (!Number.isFinite(n) || n <= 0) return SIZES[0];
	return SIZES.find((s) => n <= s) ?? SIZES[SIZES.length - 1];
}

/**
 * Pull the durable place ID out of whatever is stored in `places.photo`.
 *
 * Accepts all three historical shapes:
 *   - bare place ID:  `ChIJ41HSUABZwokRhbUqk4qDotA`           (current)
 *   - photo resource: `places/<id>/photos/<photo_id>`          (legacy)
 *   - full media URL: `https://places.googleapis.com/v1/...`   (legacy, NY rows)
 *
 * Returns null when there is nothing usable.
 */
export function extractPlaceId(stored) {
	if (!stored || typeof stored !== 'string') return null;
	const value = stored.trim();
	if (!value) return null;

	if (value.startsWith('https://') || value.startsWith('http://')) {
		try {
			const segments = new URL(value).pathname.split('/').filter(Boolean);
			const i = segments.indexOf('places');
			return i !== -1 && segments[i + 1] ? segments[i + 1] : null;
		} catch {
			return null;
		}
	}

	if (value.startsWith('places/')) {
		const segments = value.split('/');
		return segments[1] || null;
	}

	// Bare place ID — no path separators or query string.
	if (!value.includes('/') && !value.includes('?')) return value;

	return null;
}

/**
 * Storage path for a cached variant.
 *
 * Extension-less on purpose: Google returns whatever format the original photo
 * is (JPEG for most, PNG for logo-style images), and Supabase serves the
 * Content-Type recorded at upload time. Naming these `.jpg` would be a lie for
 * the PNG ones.
 */
export function objectPath(placeId, size) {
	return `${placeId}/${size}.img`;
}

/** Storage path for the "Google has no photo here" marker. */
export function markerPath(placeId) {
	return `${placeId}/${NO_PHOTO_MARKER}`;
}

/** Public CDN URL for a cached object. Requires the bucket to be public. */
export function publicUrl(supabaseUrl, path) {
	return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Create the storage bucket if it does not exist. Safe to call repeatedly.
 */
export async function ensureBucket(supabase) {
	const { data: buckets, error } = await supabase.storage.listBuckets();
	if (error) throw new Error(`listBuckets failed: ${error.message}`);
	if (buckets.some((b) => b.name === BUCKET)) return false;

	const { error: createError } = await supabase.storage.createBucket(BUCKET, {
		public: true,
		fileSizeLimit: 5 * 1024 * 1024,
		allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']
	});
	// Tolerate a concurrent creator.
	if (createError && !/already exists/i.test(createError.message)) {
		throw new Error(`createBucket failed: ${createError.message}`);
	}
	return true;
}

/**
 * Ask Google for a current photo resource name for this place.
 * Returns null when the place genuinely has no photos.
 * Throws on transport/auth failures so callers can distinguish "no photo"
 * from "could not reach Google".
 */
export async function resolvePhotoName(placeId, apiKey) {
	const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
		headers: {
			'X-Goog-Api-Key': apiKey,
			'X-Goog-FieldMask': 'photos'
		}
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Place Details ${res.status}: ${body.slice(0, 200)}`);
	}

	const data = await res.json();
	return data.photos?.[0]?.name ?? null;
}

/**
 * Download the actual image bytes for a (fresh) photo resource name.
 * Returns { bytes, contentType }.
 */
export async function fetchPhotoBytes(photoName, size, apiKey) {
	const mediaUrl =
		`https://places.googleapis.com/v1/${photoName}/media` +
		`?key=${encodeURIComponent(apiKey)}` +
		`&maxWidthPx=${size}&maxHeightPx=${size}&skipHttpRedirect=true`;

	const metaRes = await fetch(mediaUrl);
	if (!metaRes.ok) {
		const body = await metaRes.text();
		throw new Error(`photo media ${metaRes.status}: ${body.slice(0, 200)}`);
	}

	const meta = await metaRes.json();
	if (!meta.photoUri) throw new Error('photo media returned no photoUri');

	const imageRes = await fetch(meta.photoUri);
	if (!imageRes.ok) throw new Error(`photoUri fetch ${imageRes.status}`);

	return {
		bytes: new Uint8Array(await imageRes.arrayBuffer()),
		contentType: imageRes.headers.get('Content-Type') || 'image/jpeg'
	};
}

/** Upload bytes to the cache, overwriting any existing object. */
export async function putCached(supabase, path, bytes, contentType = 'image/jpeg') {
	const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
		contentType,
		upsert: true,
		cacheControl: '31536000'
	});
	if (error) throw new Error(`upload ${path} failed: ${error.message}`);
}

/** Write the no-photo marker so we stop asking Google about this place. */
export async function putMarker(supabase, placeId) {
	await putCached(supabase, markerPath(placeId), new Uint8Array(0), 'application/octet-stream');
}

/**
 * Resolve one place to cached bytes for `size`, doing the minimum work needed.
 *
 * Returns:
 *   { status: 'cached', bytes, contentType }  — freshly fetched and stored
 *   { status: 'none' }                        — Google has no photo; marker written
 */
export async function cachePhoto(supabase, placeId, size, apiKey) {
	const photoName = await resolvePhotoName(placeId, apiKey);
	if (!photoName) {
		await putMarker(supabase, placeId);
		return { status: 'none' };
	}

	const { bytes, contentType } = await fetchPhotoBytes(photoName, size, apiKey);
	await putCached(supabase, objectPath(placeId, size), bytes, contentType);
	return { status: 'cached', bytes, contentType };
}

/**
 * True when the no-photo marker exists for this place.
 */
export async function hasMarker(supabase, placeId) {
	const { data } = await supabase.storage.from(BUCKET).list(placeId, {
		search: NO_PHOTO_MARKER,
		limit: 1
	});
	return Boolean(data?.some((f) => f.name === NO_PHOTO_MARKER));
}
