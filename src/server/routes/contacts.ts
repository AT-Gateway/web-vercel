import type { FastifyInstance } from 'fastify';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';

export async function registerContactsRoutes(app: FastifyInstance, repo: ReturnType<typeof createRepo>, hub: SseHub) {
  app.get('/api/contacts', async (req) => {
    const p = req.pairAuth!;
    const q = (req.query ?? {}) as any;
    const query = String(q.query ?? '').trim();
    const limit = Math.min(Number(q.limit ?? 40), 200);

    const res = query
      ? await repo.searchContacts(p.gatewayDeviceId, query, limit)
      : await repo.listContacts(p.gatewayDeviceId, limit);

    return { ok: true, contacts: res };
  });

  app.post('/api/contacts/upsert', async (req, reply) => {
    const p = req.pairAuth!;
    const body = (req.body ?? {}) as any;
    const displayName = String(body.displayName ?? body.name ?? '').trim();
    const number = String(body.number ?? body.rawNumber ?? '').trim();

    if (!displayName || !number) {
      return reply.code(400).send({ ok: false, error: 'Missing contact name or number' });
    }

    try {
      const contact = await repo.upsertContactForGateway(p.gatewayDeviceId, { number, displayName });
      hub.emit(p.pairingId, 'contacts', { ok: true });
      return { ok: true, contact };
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err?.message || 'Failed to save contact' });
    }
  });
}
