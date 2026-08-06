import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import {
	cachePhoto,
	extractPlaceId,
	hasMarker,
	normalizeSize,
	objectPath,
	publicUrl
} from '$lib/server/photos.js';

const supabase = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

/** 1x1 transparent GIF — returned for places Google has no photo for. */
const EMPTY_PIXEL = Uint8Array.from([
	0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
	0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
	0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
]);

function emptyPixel(maxAge = 86400) {
	return new Response(EMPTY_PIXEL, {
		headers: {
			'Content-Type': 'image/gif',
			'Cache-Control': `public, max-age=${maxAge}`
		}
	});
}

/**
 * Self-heal throttling.
 *
 * A page can request ~85 photos at once. If none are cached yet (before the
 * backfill has run, or right after a bucket wipe) every one of those would fire
 * its own Google Place Details + photo download. That stampede is slow and
 * costs real API spend, so:
 *   - identical concurrent requests share a single heal (`inFlight`)
 *   - the number of simultaneous heals is capped; beyond it we serve a
 *     transparent pixel with a short TTL so the next load retries cheaply.
 *
 * Run scripts/backfill-photos.js to populate the cache in bulk — after that,
 * healing only ever applies to newly added places.
 */
const MAX_CONCURRENT_HEALS = 4;
let activeHeals = 0;
const inFlight = new Map();

function heal(key, placeId, size, apiKey) {
	const existing = inFlight.get(key);
	if (existing) return existing;

	const promise = (async () => {
		activeHeals++;
		try {
			return await cachePhoto(supabase, placeId, size, apiKey);
		} finally {
			activeHeals--;
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, promise);
	return promise;
}

/**
 * Serve a place photo.
 *
 * `ref` is a durable Google place ID (legacy photo-resource names and full
 * media URLs are still accepted and reduced to their place ID). Image bytes are
 * cached in Supabase Storage, so a cache hit is a redirect to the CDN and never
 * touches the Google API. On a miss we re-resolve a fresh photo name from the
 * place ID, cache it, and serve it — so photos cannot go permanently stale.
 */
export async function GET({ url, setHeaders }) {
	const ref = url.searchParams.get('ref');
	if (!ref) return new Response('Missing ref parameter', { status: 400 });

	const placeId = extractPlaceId(ref);
	if (!placeId) return new Response('Could not derive a place ID from ref', { status: 400 });

	const size = normalizeSize(url.searchParams.get('maxWidthPx') || url.searchParams.get('maxHeightPx'));
	const path = objectPath(placeId, size);
	const cdnUrl = publicUrl(PUBLIC_SUPABASE_URL, path);

	// Fast path: already cached. HEAD is a cheap metadata check and costs no egress.
	try {
		const head = await fetch(cdnUrl, { method: 'HEAD' });
		if (head.ok) {
			setHeaders({ 'Cache-Control': 'public, max-age=604800' });
			return new Response(null, { status: 302, headers: { Location: cdnUrl } });
		}
	} catch {
		// Storage unreachable — fall through and try to serve directly.
	}

	if (!env.GOOGLE_PLACES_API_KEY) {
		return new Response('GOOGLE_PLACES_API_KEY is not configured', { status: 500 });
	}

	// Known to have no photo — don't ask Google again.
	try {
		if (await hasMarker(supabase, placeId)) return emptyPixel();
	} catch {
		// Marker check is best-effort.
	}

	// Miss: re-resolve from the durable place ID and cache for next time.
	const key = `${placeId}/${size}`;
	if (activeHeals >= MAX_CONCURRENT_HEALS && !inFlight.has(key)) {
		// Shed load rather than pile onto Google. Short TTL so the retry is cheap.
		return emptyPixel(60);
	}

	try {
		const result = await heal(key, placeId, size, env.GOOGLE_PLACES_API_KEY);
		if (result.status === 'none') return emptyPixel();

		return new Response(result.bytes, {
			headers: {
				'Content-Type': result.contentType,
				'Cache-Control': 'public, max-age=604800'
			}
		});
	} catch (err) {
		// Surface the upstream reason — the previous version swallowed it, which made
		// the mass photo-reference expiry look like a generic proxy failure.
		console.error(`[api/photo] ${placeId} @${size}: ${err.message}`);
		return new Response(`Photo unavailable: ${err.message}`, { status: 502 });
	}
}
