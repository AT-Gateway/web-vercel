import type { FastifyInstance } from 'fastify';
import type { createRepo } from '../db/repo.js';

export async function registerContactsRoutes(app: FastifyInstance, repo: ReturnType<typeof createRepo>) {
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
}
