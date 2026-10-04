import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';

// Client-generated message ids (idempotency keys) must be RFC 4122 UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Any UUID-shaped id; looked-up ids must parse as uuid or Postgres rejects the query.
const UUID_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerSmsRoutes(app: FastifyInstance, repo: ReturnType<typeof createRepo>, hub: SseHub) {
  app.get('/api/sms/conversations', async (req) => {
    const p = req.pairAuth!;
    const limit = Math.min(Number((req.query as any)?.limit ?? 150), 500);
    const conversations = await repo.listConversations(p.pairingId, limit);
    // Server-clock time since the Android gateway last polled its outbox (null = never).
    const gatewayIdleMs = await repo.getGatewayIdleMs(p.gatewayDeviceId).catch(() => null);
    return { ok: true, conversations, gatewayIdleMs };
  });

  app.get('/api/sms/messages', async (req, reply) => {
    const p = req.pairAuth!;
    const q = (req.query ?? {}) as any;
    // Backwards compatible: `peer` used to be required. Now clients should send `threadId`.
    const threadId = String(q.threadId ?? q.thread ?? q.peer ?? '').trim();
    const limit = Math.floor(Math.min(Math.max(Number(q.limit ?? 300) || 300, 1), 1000));
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });

    // Returns the newest `limit` messages (older than the `before` ts_ms + `beforeId`
    // keyset cursor, when given), ascending.
    const before = Number(q.before);
    const beforeId = typeof q.beforeId === 'string' && UUID_SHAPE_RE.test(q.beforeId) ? q.beforeId.toLowerCase() : null;
    const messages = await repo.listMessages(
      p.pairingId,
      threadId,
      limit,
      Number.isFinite(before) && before > 0 ? Math.floor(before) : null,
      beforeId
    );
    return { ok: true, threadId, messages };
  });

  app.get('/api/sms/search', async (req) => {
    const p = req.pairAuth!;
    const q = (req.query ?? {}) as any;
    const query = String(q.q ?? q.query ?? '').trim().slice(0, 200);
    const limit = Math.min(Math.max(Number(q.limit ?? 40) || 40, 1), 200);
    if (!query) return { ok: true, messages: [] };

    const messages = await repo.searchMessages(p.pairingId, query, limit);
    return { ok: true, messages };
  });

  app.post('/api/sms/threads/:threadId/read', async (req, reply) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });
    const res = await repo.markThreadRead(p.pairingId, threadId);
    // Read state is shared, so other paired devices update their badges.
    if (res.marked > 0) hub.emit(p.pairingId, 'chats', { threadId, read: true });
    return res;
  });

  app.post('/api/sms/threads/:threadId/unread', async (req, reply) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });
    const res = await repo.markThreadUnread(p.pairingId, threadId);
    if (res.marked > 0) hub.emit(p.pairingId, 'chats', { threadId, read: false });
    return res;
  });

  app.get('/api/sms/blocked-chats', async (req) => {
    const p = req.pairAuth!;
    const blockedChats = await repo.listBlockedChats(p.pairingId);
    return { ok: true, blockedChats };
  });

  app.post('/api/sms/threads/:threadId/block', async (req, reply) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    const body = (req.body ?? {}) as any;
    const peer = body.peer ? String(body.peer).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    if (!threadId && !peer) return reply.code(400).send({ ok: false, error: 'Missing threadId or peer' });

    const blockedChat = await repo.blockThread({ pairingId: p.pairingId, threadId: threadId || peer || '', peer, note });
    hub.emit(p.pairingId, 'chats', { action: 'blocked', threadId: blockedChat.threadId });
    return { ok: true, blockedChat };
  });

  app.post('/api/sms/threads/:threadId/unblock', async (req, reply) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });

    const result = await repo.unblockThread(p.pairingId, threadId);
    hub.emit(p.pairingId, 'chats', { action: 'unblocked', threadId });
    return { ok: true, ...result };
  });

  app.post('/api/sms/threads/:threadId/delete', async (req, reply) => {
    const p = req.pairAuth!;
    const threadId = String((req.params as any)?.threadId ?? '').trim();
    const body = (req.body ?? {}) as any;
    if (!threadId) return reply.code(400).send({ ok: false, error: 'Missing threadId' });
    if (body.confirm !== true) {
      return reply.code(400).send({ ok: false, error: 'Confirmation is required' });
    }

    const result = await repo.deleteThread(p.pairingId, threadId);
    hub.emit(p.pairingId, 'chats', { action: 'deleted', threadId });
    return { ok: true, ...result };
  });

  app.post('/api/sms/send', async (req, reply) => {
    const p = req.pairAuth!;
    const body = (req.body ?? {}) as any;

    const to = String(body.to ?? '').trim();
    const text = String(body.body ?? '').trim();
    // No automatic SIM selection: the client picks SIM 1 or SIM 2, defaulting to SIM 1.
    const simSlotIndex = body.simSlotIndex === 1 ? 1 : 0;
    const subscriptionId = typeof body.subscriptionId === 'number' ? Number(body.subscriptionId) : null;

    if (!to || !text) return reply.code(400).send({ ok: false, error: 'Missing to or body' });
    if (await repo.isThreadBlocked(p.pairingId, to)) {
      return reply.code(409).send({ ok: false, error: 'This chat is blocked. Unblock it before sending.' });
    }

    // The client's id doubles as an idempotency key, so a retried request never sends twice.
    const id =
      typeof body.clientId === 'string' && UUID_RE.test(body.clientId) ? body.clientId.toLowerCase() : randomUUID();
    const { norm, tail } = repo.normalizePhone(to);

    // "Try Again" replaces the failed copy instead of leaving it beside the new one.
    if (typeof body.replacesMessageId === 'string' && UUID_SHAPE_RE.test(body.replacesMessageId.trim())) {
      await repo.deleteFailedOutbound(p.pairingId, body.replacesMessageId.trim().toLowerCase());
    }

    const { inserted } = await repo.enqueueOutboundMessage({
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

    if (!inserted) {
      // Already enqueued by an earlier attempt with the same id.
      const owner = await repo.messageOwner(id);
      if (owner !== p.pairingId) return reply.code(409).send({ ok: false, error: 'Duplicate message id' });
      return { ok: true, id, duplicate: true };
    }

    // Replying implies the conversation has been read.
    await repo.markThreadRead(p.pairingId, tail || norm || to);

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

  // Deletes a failed outbound message. Only failed outbound rows can be deleted.
  app.post('/api/sms/messages/:id/delete', async (req, reply) => {
    const p = req.pairAuth!;
    const id = String((req.params as any)?.id ?? '').trim();
    if (!UUID_SHAPE_RE.test(id)) return reply.code(404).send({ ok: false, error: 'Message not found or not failed' });

    const ok = await repo.deleteFailedOutbound(p.pairingId, id.toLowerCase());
    if (!ok) return reply.code(404).send({ ok: false, error: 'Message not found or not failed' });
    hub.emit(p.pairingId, 'chats', {});
    return { ok: true };
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
