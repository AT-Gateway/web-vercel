import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';

import { loadConfig, type AppConfig } from './config.js';
import { createPool } from './db/pool.js';
import { applyMigrationsFromSql } from './db/migrate.js';
import { MIGRATIONS } from './db/migrations.js';
import { createRepo } from './db/repo.js';
import { createDemoAwareRepo } from './db/demoRepo.js';
import { SseHub } from './realtime/sseHub.js';
import { initWebPush } from './services/push.js';

import './types.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPairingRoutes } from './routes/pairing.js';
import { registerSmsRoutes } from './routes/sms.js';
import { registerContactsRoutes } from './routes/contacts.js';
import { registerPushRoutes } from './routes/push.js';
import { registerAndroidRoutes } from './routes/android.js';
import { registerTelegramRoutes } from './routes/telegram.js';

export type ApiRuntime = {
  app: FastifyInstance;
  cfg: AppConfig;
  repo: ReturnType<typeof createRepo>;
  pool: Pool | null;
  hub: SseHub;
};

let cachedRuntime: Promise<ApiRuntime> | null = null;

export function getApiRuntime() {
  if (!cachedRuntime) cachedRuntime = buildApiRuntime();
  return cachedRuntime;
}

export async function buildApiRuntime(): Promise<ApiRuntime> {
  const cfg = loadConfig();

  let pool: Pool | null = null;
  let realRepo: ReturnType<typeof createRepo> | null = null;

  if (cfg.databaseUrl) {
    pool = createPool(cfg.databaseUrl) as unknown as Pool;
    await applyMigrationsFromSql(pool, MIGRATIONS);
    realRepo = createRepo(pool as any);
  }

  const repo = createDemoAwareRepo(realRepo, cfg.demo);

  if (cfg.vapid.enabled) {
    initWebPush({
      subject: cfg.vapid.subject!,
      publicKey: cfg.vapid.publicKey!,
      privateKey: cfg.vapid.privateKey!,
    });
  }

  const hub = new SseHub();
  hub.startPings(20_000);

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production',
    bodyLimit: 4 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-Pair-Token', 'Authorization', 'Ngrok-Skip-Browser-Warning'],
  });

  // --------- Auth hook ---------
  app.addHook('preHandler', async (req, reply) => {
    const pathname = req.url.split('?')[0];

    if (!pathname.startsWith('/api')) return;

    // Public endpoints
    if (
        pathname === '/api/health' ||
        pathname === '/api/vapidPublicKey' ||
        pathname === '/api/pair/complete' ||
        pathname === '/api/sms/stream' ||
        pathname.startsWith('/api/telegram/webhook/')
    ) {
      return;
    }

    // Admin endpoints
    if (pathname === '/api/pair/start' || pathname.startsWith('/api/android/')) {
      const key = String((req.headers['x-api-key'] ?? '') as any).trim();
      if (!key || key !== cfg.apiKey) {
        return reply.code(401).send({ ok: false, error: 'Unauthorized' });
      }
      return;
    }

    // Pair token endpoints
    let token = String((req.headers['x-pair-token'] ?? '') as any).trim();

    // Support Authorization: Bearer <token>
    if (!token) {
      const auth = String((req.headers['authorization'] ?? '') as any);
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) token = m[1].trim();
    }

    if (!token) {
      return reply.code(401).send({ ok: false, error: 'Missing pair token' });
    }

    const pair = await repo.getPairByToken(token);
    if (!pair) {
      return reply.code(401).send({ ok: false, error: 'Invalid pair token' });
    }

    req.pairAuth = pair;
  });

  // --------- Routes ---------
  await registerHealthRoutes(app, cfg);
  await registerPairingRoutes(app, cfg, repo);
  await registerSmsRoutes(app, repo, hub);
  await registerContactsRoutes(app, repo);
  await registerPushRoutes(app, cfg, repo);

  const telegramCfgs = cfg.telegram.enabled
      ? cfg.telegram.allowedChatIds.map((chatId) => ({ botToken: cfg.telegram.botToken!, chatId }))
      : [];

  await registerAndroidRoutes(app, cfg, repo, hub, telegramCfgs);
  await registerTelegramRoutes(app, cfg, repo, hub);

  await app.ready();

  return { app, cfg, repo, pool, hub };
}
