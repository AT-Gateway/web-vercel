import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { createRepo } from '../db/repo';

export async function registerPushRoutes(app: FastifyInstance, cfg: AppConfig, repo: ReturnType<typeof createRepo>) {
  app.post('/api/push/subscribe', async (req, reply) => {
    const p = req.pairAuth!;
    if (!cfg.vapid.enabled) {
      return reply.code(400).send({ ok: false, error: 'Push is not configured on the server (missing VAPID keys).' });
    }

    const body = (req.body ?? {}) as any;
    const deviceId = String(body.deviceId ?? '').trim();
    const subscription = body.subscription;

    if (!deviceId || !subscription) {
      return reply.code(400).send({ ok: false, error: 'Missing deviceId or subscription' });
    }

    await repo.upsertPushSubscription(p.pairingId, deviceId, subscription);
    return { ok: true };
  });
}
