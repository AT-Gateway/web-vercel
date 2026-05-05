import { type NextRequest } from 'next/server';
import { getApiRuntime } from '@/server/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleSmsStream(req: NextRequest) {
  const url = new URL(req.url);
  const pairToken = (url.searchParams.get('pt') ?? url.searchParams.get('pairToken') ?? '').trim();

  if (!pairToken) return json(401, { ok: false, error: 'Missing pt' });

  const { repo } = await getApiRuntime();
  const pair = await repo.getPairByToken(pairToken);
  if (!pair) return json(401, { ok: false, error: 'Invalid pair token' });

  // Vercel serverless functions are not a good place for long-lived SSE sockets.
  // The frontend already refreshes every 12 seconds, so we send a hello event and
  // ask EventSource to retry slowly instead of holding the function open forever.
  const body = [
    'retry: 30000',
    'event: hello',
    `data: ${JSON.stringify({ ok: true, pairingId: pair.pairingId, ts: Date.now() })}`,
    '',
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === '/api/sms/stream') return handleSmsStream(req);

  const runtime = await getApiRuntime();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const payload =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : Buffer.from(await req.arrayBuffer());

  const injected = await runtime.app.inject({
    method: req.method as any,
    url: `${pathname}${url.search}`,
    headers,
    payload,
  });

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(injected.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) responseHeaders.append(key, String(item));
    } else {
      responseHeaders.set(key, String(value));
    }
  }

  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response((injected as any).rawPayload ?? injected.payload ?? null, {
    status: injected.statusCode,
    headers: responseHeaders,
  });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS, handle as HEAD };
