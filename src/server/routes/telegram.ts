import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';
import { handleTelegramUpdate } from '../telegram/handleUpdate';

export async function registerTelegramRoutes(
    app: FastifyInstance,
    cfg: AppConfig,
    repo: ReturnType<typeof createRepo>,
    hub: SseHub
) {
  // Webhook mode only.
  app.post('/api/telegram/webhook/:secret', async (req, reply) => {
    if (!cfg.telegram.enabled || !cfg.telegram.botToken || cfg.telegram.mode !== 'webhook') {
      return reply.code(404).send({ ok: false });
    }

    const secret = String((req.params as any)?.secret ?? '').trim();
    if (!cfg.telegram.webhookSecret || secret !== cfg.telegram.webhookSecret) {
      return reply.code(403).send({ ok: false });
    }

    const update = (req.body ?? {}) as any;
    await handleTelegramUpdate(update, cfg, repo, hub);
    return { ok: true };
  });
}
