import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { createRepo } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';
import {
  telegramGetMe,
  telegramSend,
  telegramSetCommands,
  telegramSetWebhook,
} from '../services/telegram';
import { getTelegramRecipientsForPairing } from '../telegram/recipients';
import { handleTelegramUpdate } from '../telegram/handleUpdate';

function makeTelegramCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function normalizeBaseUrl(raw: string | null | undefined) {
  const value = String(raw ?? '').trim().replace(/\/$/, '');
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function requestBaseUrl(req: any) {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  return host ? `${proto}://${host}` : null;
}

function publicBaseUrl(cfg: AppConfig, req: any) {
  return normalizeBaseUrl(cfg.telegram.publicBaseUrl) ?? requestBaseUrl(req);
}

function subscriptionLabel(s: any) {
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
  if (name && s.username) return `${name} (@${s.username})`;
  if (name) return name;
  if (s.username) return `@${s.username}`;
  return s.chatId;
}

export async function registerTelegramRoutes(
  app: FastifyInstance,
  cfg: AppConfig,
  repo: ReturnType<typeof createRepo>,
  hub: SseHub
) {
  // Webhook mode only. Telegram posts updates here.
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

  app.get('/api/telegram/status', async (req) => {
    const p = req.pairAuth!;
    const settings = await repo.getTelegramPairingSettings(p.pairingId);
    const subscriptions = await repo.listTelegramSubscriptions(p.pairingId);

    return {
      ok: true,
      configured: Boolean(cfg.telegram.botToken),
      enabled: cfg.telegram.enabled,
      featureEnabled: cfg.telegram.featureEnabled,
      mode: cfg.telegram.mode,
      webhookConfigured: Boolean(cfg.telegram.webhookSecret),
      botUsername: cfg.telegram.botUsername,
      alertsEnabled: settings.alertsEnabled,
      subscribers: subscriptions.map((s) => ({
        chatId: s.chatId,
        label: subscriptionLabel(s),
        username: s.username,
        firstName: s.firstName,
        lastName: s.lastName,
        enabled: s.enabled,
        updatedAt: s.updatedAt,
      })),
      legacyAllowedChatIds: cfg.telegram.allowedChatIds.length,
    };
  });

  app.post('/api/telegram/settings', async (req) => {
    const p = req.pairAuth!;
    const body = (req.body ?? {}) as any;
    const alertsEnabled = body.alertsEnabled !== false;
    const settings = await repo.setTelegramPairingSettings(p.pairingId, alertsEnabled);
    return { ok: true, alertsEnabled: settings.alertsEnabled };
  });

  app.post('/api/telegram/link-code', async (req, reply) => {
    const p = req.pairAuth!;

    if (!cfg.telegram.botToken) {
      return reply.code(400).send({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }

    const code = makeTelegramCode();
    const created = await repo.createTelegramLinkCode(p.pairingId, code, cfg.telegram.linkCodeTtlMs);
    const botDeepLink = cfg.telegram.botUsername
      ? `https://t.me/${cfg.telegram.botUsername}?start=${encodeURIComponent(code)}`
      : null;

    return { ok: true, code: created.code, expiresAt: created.expiresAt, botDeepLink };
  });

  app.post('/api/telegram/setup-webhook', async (req, reply) => {
    if (!cfg.telegram.botToken) {
      return reply.code(400).send({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' });
    }
    if (!cfg.telegram.webhookSecret) {
      return reply.code(400).send({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not configured.' });
    }
    if (cfg.telegram.mode !== 'webhook') {
      return reply.code(400).send({ ok: false, error: 'TELEGRAM_MODE must be webhook on Vercel.' });
    }

    const base = publicBaseUrl(cfg, req);
    if (!base) {
      return reply.code(400).send({ ok: false, error: 'Could not determine public app URL. Set APP_PUBLIC_URL.' });
    }

    const webhookUrl = `${base}/api/telegram/webhook/${cfg.telegram.webhookSecret}`;
    const [me] = await Promise.all([
      telegramGetMe(cfg.telegram.botToken),
      telegramSetWebhook(cfg.telegram.botToken, webhookUrl),
      telegramSetCommands(cfg.telegram.botToken),
    ]);

    return {
      ok: true,
      webhookUrl,
      botUsername: me.result?.username ?? cfg.telegram.botUsername ?? null,
    };
  });

  app.post('/api/telegram/test', async (req, reply) => {
    const p = req.pairAuth!;

    if (!cfg.telegram.enabled || !cfg.telegram.botToken) {
      return reply.code(400).send({ ok: false, error: 'Telegram bot is not enabled on the server.' });
    }

    const { alertsEnabled, recipients, subscriptions } = await getTelegramRecipientsForPairing(cfg, repo, p.pairingId);
    if (!alertsEnabled) {
      return reply.code(400).send({ ok: false, error: 'Telegram alerts are inactive for this pairing.' });
    }
    if (recipients.length === 0) {
      return reply.code(404).send({ ok: false, error: 'No Telegram chats are connected yet. Generate a link code first.' });
    }

    const results = [];
    for (const recipient of recipients) {
      try {
        await telegramSend(
          recipient,
          [
            '✅ Telegram test notification',
            '',
            `Gateway: ${p.gatewayDeviceId}`,
            `Pairing: ${p.pairingId}`,
            '',
            'If you received this, Telegram alerts are ready.',
          ].join('\n')
        );
        results.push({ chatId: recipient.chatId, ok: true });
      } catch (err: any) {
        results.push({ chatId: recipient.chatId, ok: false, error: err?.message || String(err) });
      }
    }

    return { ok: true, subscribers: subscriptions.length, results };
  });
}
