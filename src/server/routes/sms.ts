import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';

export async function registerSmsRoutes(app: FastifyInstance, repo: ReturnType<typeof createRepo>, hub: SseHub) {
  app.get('/api/sms/conversations', async (req) => {
    const p = req.pairAuth!;
    const limit = Math.min(Number((req.query as any)?.limit ?? 150), 500);
    const conversations = await repo.listConversations(p.pairingId, limit);
    return { ok: true, conversations };
  });

  app.get('/api/sms/messages', async (req, reply) => {
    const p = req.pairAuth!;
    const q = (req.query ?? {}) as any;
    // Backwards compatible: `peer` used to be required. Now clients should send `threadId`.
    const threadId = String(q.threadId ?? q.thread ?? q.peer ?? '').trim();
    const limit = Math.min(Number(q.limit ?? 300), 1000);
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });

    const messages = await repo.listMessages(p.pairingId, threadId, limit);
    return { ok: true, threadId, messages };
  });

  app.post('/api/sms/threads/:threadId/read', async (req) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    if (!threadId) return { ok: false, error: 'Missing threadId' };
    return repo.markThreadRead(p.pairingId, threadId);
  });

  app.post('/api/sms/send', async (req, reply) => {
    const p = req.pairAuth!;
    const body = (req.body ?? {}) as any;

    const to = String(body.to ?? '').trim();
    const text = String(body.body ?? '').trim();
    const simSlotIndex = body.simSlotIndex === 0 || body.simSlotIndex === 1 ? Number(body.simSlotIndex) : null;
    const subscriptionId = typeof body.subscriptionId === 'number' ? Number(body.subscriptionId) : null;

    if (!to || !text) return reply.code(400).send({ ok: false, error: 'Missing to or body' });

    const id = randomUUID();
    const { norm, tail } = repo.normalizePhone(to);

    await repo.enqueueOutboundMessage({
      id,
      pairingId: p.pairingId,
      gatewayDeviceId: p.gatewayDeviceId,
      peer: to,
      peerNorm: norm || null,
      peerTail: tail || null,
      body: text,
      bodyIsEncrypted: false,
      ts: Date.now(),
      createdBy: 'pwa',
      simSlotIndex,
      subscriptionId,
    });

    hub.emit(p.pairingId, 'message', {
      id,
      peer: to,
      threadId: tail || norm || to,
      direction: 'out',
      ts: Date.now(),
      status: 'queued',
    });

    return { ok: true, id };
  });

  // SSE: stable stream per pairing (auth via pairToken)
  app.get('/api/sms/stream', async (req, reply) => {
    const q = (req.query ?? {}) as any;
    const pt = String(q.pt ?? q.pairToken ?? '').trim();

    if (!pt) {
      reply.code(401);
      return reply.send({ ok: false, error: 'Missing pt' });
    }

    const pair = await repo.getPairByToken(pt);
    if (!pair) {
      reply.code(401);
      return reply.send({ ok: false, error: 'Invalid pair token' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // CORS is handled by @fastify/cors (origin: true)
    });

    // Tell Fastify we'll manage the response stream.
    reply.hijack();

    // Initial hello
    reply.raw.write(`event: hello\n`);
    reply.raw.write(`data: ${JSON.stringify({ ok: true, pairingId: pair.pairingId, ts: Date.now() })}\n\n`);

    hub.add(pair.pairingId, reply.raw);

    // Keep open
    return;
  });
}
