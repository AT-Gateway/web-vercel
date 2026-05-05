import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

export async function registerHealthRoutes(app: FastifyInstance, cfg: AppConfig) {
  app.get('/api/health', async () => {
    return {
      ok: true,
      ts: Date.now(),
      vapidEnabled: cfg.vapid.enabled,
      telegramEnabled: cfg.telegram.enabled,
      databaseConfigured: Boolean(cfg.databaseUrl),
      demoModeEnabled: cfg.demo.enabled,
      demoCode: cfg.demo.enabled ? cfg.demo.code : null,
    };
  });

  app.get('/api/vapidPublicKey', async () => {
    return { key: cfg.vapid.publicKey ?? '' };
  });
}
