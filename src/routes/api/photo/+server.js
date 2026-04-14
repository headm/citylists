import { env } from '$env/dynamic/private';

export async function GET({ url }) {
	const ref = url.searchParams.get('ref');
	if (!ref) {
		return new Response('Missing ref parameter', { status: 400 });
	}

	const maxHeightPx = url.searchParams.get('maxHeightPx') || '400';
	const maxWidthPx = url.searchParams.get('maxWidthPx') || '400';

	try {
		const mediaUrl = `https://places.googleapis.com/v1/${ref}/media?key=${env.GOOGLE_PLACES_API_KEY}&maxHeightPx=${maxHeightPx}&maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
		const metaRes = await fetch(mediaUrl);
		if (!metaRes.ok) {
			return new Response('Failed to fetch photo metadata', { status: 502 });
		}

		const meta = await metaRes.json();
		if (!meta.photoUri) {
			return new Response('No photo URI returned', { status: 502 });
		}

		const imageRes = await fetch(meta.photoUri);
		if (!imageRes.ok) {
			return new Response('Failed to fetch photo', { status: 502 });
		}

		return new Response(imageRes.body, {
			headers: {
				'Content-Type': imageRes.headers.get('Content-Type') || 'image/jpeg',
				'Cache-Control': 'public, max-age=86400'
			}
		});
	} catch {
		return new Response('Photo proxy error', { status: 502 });
	}
}
