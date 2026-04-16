import { spawn } from 'child_process';

const VALID_CITIES = ['San Francisco', 'New York', 'Tokyo', 'Paris'];

let running = false;

export async function POST({ request }) {
	const { city } = await request.json();

	if (!city || !VALID_CITIES.includes(city)) {
		return new Response(JSON.stringify({ error: 'Invalid city' }), { status: 400 });
	}

	if (running) {
		return new Response(JSON.stringify({ error: 'Pipeline already running' }), { status: 409 });
	}

	running = true;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const child = spawn('node', ['scripts/discover-candidates.js', city], {
				cwd: process.cwd(),
				env: process.env
			});

			function send(line) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log: line })}\n\n`));
			}

			let buffer = '';
			child.stdout.on('data', (chunk) => {
				buffer += chunk.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop();
				for (const line of lines) {
					if (line) send(line);
				}
			});

			child.stderr.on('data', (chunk) => {
				const lines = chunk.toString().split('\n');
				for (const line of lines) {
					if (line) send(line);
				}
			});

			child.on('close', (code) => {
				if (buffer) send(buffer);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, exitCode: code })}\n\n`));
				controller.close();
				running = false;
			});

			child.on('error', (err) => {
				send(`Error: ${err.message}`);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, exitCode: 1 })}\n\n`));
				controller.close();
				running = false;
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
