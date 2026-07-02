import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';
import { telegramSend } from '../services/telegram';
import { getTelegramRecipientsForPairing } from '../telegram/recipients';
import { sendPush } from '../services/push';

export async function registerAndroidRoutes(
  app: FastifyInstance,
  cfg: AppConfig,
  repo: ReturnType<typeof createRepo>,
  hub: SseHub
) {
  // Android -> server: inbound SMS
  app.post('/api/android/inbound-sms', async (req, reply) => {
    const body = (req.body ?? {}) as any;

    const id = body.id ? String(body.id).trim() : randomUUID();
    const gatewayDeviceId = String(body.gatewayDeviceId ?? '').trim();
    const pairingIdInput = body.pairingId ? String(body.pairingId).trim() : '';

    const from = String(body.from ?? '').trim();

    // plaintext is preferred; encrypted payload is kept for future.
    const plaintext = body.body !== undefined && body.body !== null ? String(body.body) : '';
    const enc = body.enc;

    const ts = typeof body.ts === 'number' ? Number(body.ts) : Date.now();
    const simSlotIndex = body.simSlotIndex === 0 || body.simSlotIndex === 1 ? Number(body.simSlotIndex) : null;
    const subscriptionId = typeof body.subscriptionId === 'number' ? Number(body.subscriptionId) : null;

    if (!gatewayDeviceId || !from) {
      return reply.code(400).send({ ok: false, error: 'Missing gatewayDeviceId or from' });
    }

    // Resolve pairing id.
    let pairingId: string | null = null;

    if (pairingIdInput) {
      const p = await repo.getPairingById(pairingIdInput);
      if (p && p.gatewayDeviceId === gatewayDeviceId) {
        pairingId = p.id;
      }
    }

    if (!pairingId) {
      const latest = await repo.getLatestPairingForGateway(gatewayDeviceId);
      if (latest) {
        pairingId = latest.id;
      } else {
        // Auto-create a pairing so inbound messages are not orphaned.
        const newPairingId = randomUUID();
        await repo.createPairing({ pairingId: newPairingId, gatewayDeviceId, gatewayPubSpkiB64: 'AA==' });
        pairingId = newPairingId;
      }
    }

    const { norm, tail } = repo.normalizePhone(from);

    const bodyText = plaintext || (enc ? JSON.stringify(enc) : '');
    const bodyIsEncrypted = !plaintext && !!enc;

    if (pairingId && (await repo.isThreadBlocked(pairingId, from))) {
      return { ok: true, inserted: false, blocked: true };
    }

    const insert = await repo.tryInsertMessage({
      id,
      pairingId,
      gatewayDeviceId,
      peer: from,
      peerNorm: norm || null,
      peerTail: tail || null,
      direction: 'in',
      body: bodyText,
      bodyIsEncrypted,
      ts,
      status: 'received',
      deliveredAt: null,
      createdBy: 'android',
      simSlotIndex,
      subscriptionId,
    });

    // Even if it was a duplicate, reply ok (idempotent)
    if (pairingId) {
      // Include `threadId` so clients can merge different phone formats.
      hub.emit(pairingId, 'message', { id, peer: from, threadId: tail || norm || from, direction: 'in', ts });
    }

    // Push + Telegram only when inserted
    if (insert.inserted) {
      // Web push
      if (cfg.vapid.enabled && pairingId) {
        try {
          const subs = await repo.listPushSubscriptions(pairingId);
          const peerName = await repo.lookupContactName(gatewayDeviceId, from);

          for (const s of subs) {
            try {
              await sendPush(s.subscription, {
                type: 'inbound_sms',
                id,
                peer: from,
                peerName,
                body: bodyIsEncrypted ? '' : bodyText,
                ts,
              });
            } catch (err: any) {
              req.log.warn({ err, deviceId: s.deviceId, statusCode: err?.statusCode }, 'Web push failed');
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                await repo.deletePushSubscription(pairingId, s.deviceId).catch(() => {});
              }
            }
          }
        } catch (err) {
          req.log.warn({ err }, 'Failed to send web push notifications');
        }
      }

      // Telegram
      if (pairingId) {
        try {
          const { recipients } = await getTelegramRecipientsForPairing(cfg, repo, pairingId);
          if (recipients.length > 0) {
            const peerName = await repo.lookupContactName(gatewayDeviceId, from);
            const title = peerName ? `${peerName} (${from})` : from;
            const text = bodyIsEncrypted ? '🔒 Encrypted message' : bodyText;
            const simLabel = simSlotIndex === 0 ? 'SIM1' : simSlotIndex === 1 ? 'SIM2' : 'AUTO';
            const msg = [
              '📩 New SMS',
              '',
              `From: ${title}`,
              `Gateway: ${gatewayDeviceId}`,
              `SIM: ${simLabel}`,
              '',
              text,
            ].join('\n');

            const replyMarkup = {
              inline_keyboard: [
                [
                  { text: '↩️ Reply', callback_data: `r:${id}:keep` },
                  { text: 'SIM1', callback_data: `r:${id}:0` },
                  { text: 'SIM2', callback_data: `r:${id}:1` },
                ],
                [
                  { text: '🕘 Recent chats', callback_data: 'tg:recent' },
                  { text: '⏸ Pause alerts', callback_data: `tg:pause:${pairingId}` },
                ],
              ],
            };

            await Promise.all(recipients.map((c) => telegramSend(c, msg, { replyMarkup })));
          }
        } catch (err) {
          req.log.warn({ err }, 'Failed to send Telegram notifications');
        }
      }
    }

    return { ok: true, inserted: insert.inserted };
  });

  // Android: claim outbox items
  app.get('/api/android/outbox', async (req, reply) => {
    const q = (req.query ?? {}) as any;
    const gatewayDeviceId = String(q.gatewayDeviceId ?? '').trim();
    const limit = Math.min(Number(q.limit ?? 10), 50);

    if (!gatewayDeviceId) return reply.code(400).send({ ok: false, error: 'Missing gatewayDeviceId' });

    const outbox = await repo.claimOutbox(gatewayDeviceId, limit, cfg.claimTtlMs);
    return { ok: true, outbox };
  });

  app.post('/api/android/outbox/status', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const id = String(body.id ?? '').trim();
    const status = String(body.status ?? '').trim();

    if (!id || (status !== 'sent' && status !== 'failed')) {
      return reply.code(400).send({ ok: false, error: 'Missing id or invalid status' });
    }

    const meta = await repo.getMessageMeta(id);
    if (!meta) return { ok: true };

    await repo.updateOutboxStatus(id, status as any);

    if (meta.pairingId) {
      const { norm, tail } = repo.normalizePhone(meta.peer);
      hub.emit(meta.pairingId, 'status', { id, status, peer: meta.peer, threadId: tail || norm || meta.peer });
    }

    return { ok: true };
  });

  app.post('/api/android/outbox/delivered', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const id = String(body.id ?? '').trim();
    const deliveredAt = typeof body.deliveredAt === 'number' ? Number(body.deliveredAt) : Date.now();

    if (!id) return reply.code(400).send({ ok: false, error: 'Missing id' });

    const meta = await repo.getMessageMeta(id);
    if (!meta) return { ok: true };

    await repo.markDelivered(id, deliveredAt);

    if (meta.pairingId) {
      const { norm, tail } = repo.normalizePhone(meta.peer);
      hub.emit(meta.pairingId, 'status', { id, status: 'sent', deliveredAt, peer: meta.peer, threadId: tail || norm || meta.peer });
    }

    return { ok: true };
  });

  // Android: contacts sync
  app.post('/api/android/contacts/sync', async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const gatewayDeviceId = String(body.gatewayDeviceId ?? '').trim();
    const contacts = Array.isArray(body.contacts) ? body.contacts : [];

    if (!gatewayDeviceId) return reply.code(400).send({ ok: false, error: 'Missing gatewayDeviceId' });

    const normalized = contacts
      .map((c: any) => ({
        number: String(c?.number ?? '').trim(),
        name: String(c?.name ?? '').trim(),
      }))
      .filter((c: any) => c.number && c.name);

    await repo.replaceContactsForGateway(gatewayDeviceId, normalized);

    // Notify clients to refresh names
    const latest = await repo.getLatestPairingForGateway(gatewayDeviceId);
    if (latest) {
      hub.emit(latest.id, 'contacts', { ok: true });
    }

    return { ok: true, count: normalized.length };
  });
}
