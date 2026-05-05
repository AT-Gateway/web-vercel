import 'dotenv/config';

export type TelegramMode = 'webhook' | 'polling';

export type AppConfig = {
  port: number;
  apiKey: string;
  databaseUrl: string | null;

  claimTtlMs: number;
  joinCodeTtlMs: number;

  defaultGatewayDeviceId: string;

  demo: {
    enabled: boolean;
    code: string;
    pairToken: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
  };

  vapid: {
    subject: string | null;
    publicKey: string | null;
    privateKey: string | null;
    enabled: boolean;
  };

  telegram: {
    mode: TelegramMode;
    botToken: string | null;
    /**
     * Optional allow-list of Telegram chat IDs that can use the bot.
     *
     * Backward compatible:
     * - if TELEGRAM_ALLOWED_CHAT_IDS is not set, we will fall back to TELEGRAM_CHAT_ID
     */
    allowedChatIds: string[];
    /**
     * Used only in webhook mode.
     */
    webhookSecret: string | null;
    enabled: boolean;
  };
};

function optEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const t = v.trim();
  return t ? t : null;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const v = optEnv(name);
  if (v === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function sixDigitEnv(name: string, fallback: string): string {
  const raw = optEnv(name) ?? fallback;
  const digits = raw.replace(/\D+/g, '').slice(0, 6);
  return digits.padEnd(6, '0');
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 8787);

  // Admin key (Android uses this via X-Api-Key). In production, set a strong value in Vercel.
  const apiKey = optEnv('API_KEY') ?? 'change-me-before-production';

  // Postgres is optional so demo mode can run without any external database.
  const databaseUrl = optEnv('DATABASE_URL');

  const claimTtlMs = Number(process.env.CLAIM_TTL_MS ?? 60_000);
  const joinCodeTtlMs = Number(process.env.JOIN_CODE_TTL_MS ?? 10 * 60 * 1000);

  const defaultGatewayDeviceId = (process.env.DEFAULT_GATEWAY_DEVICE_ID ?? 'note8').trim() || 'note8';

  const demoEnabled = boolEnv('DEMO_MODE_ENABLED', true);
  const demoCode = sixDigitEnv('DEMO_MODE_CODE', process.env.NEXT_PUBLIC_DEMO_MODE_CODE ?? '000000');
  const demoPairToken = optEnv('DEMO_PAIR_TOKEN') ?? `demo:${demoCode}:sms-gateway`;
  const demoPairingId = optEnv('DEMO_PAIRING_ID') ?? '00000000-0000-4000-8000-000000000001';
  const demoGatewayDeviceId = optEnv('DEMO_GATEWAY_DEVICE_ID') ?? 'demo-android-gateway';
  const demoGatewayPubSpkiB64 = optEnv('DEMO_GATEWAY_PUB_SPKI_B64') ?? 'AA==';

  const vapidSubject = optEnv('VAPID_SUBJECT');
  const vapidPublicKey = optEnv('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = optEnv('VAPID_PRIVATE_KEY');
  const vapidEnabled = Boolean(vapidSubject && vapidPublicKey && vapidPrivateKey);

  // Telegram
  const telegramBotToken = optEnv('TELEGRAM_BOT_TOKEN');
  const telegramChatId = optEnv('TELEGRAM_CHAT_ID');
  const telegramWebhookSecret = optEnv('TELEGRAM_WEBHOOK_SECRET');
  const telegramModeRaw = (process.env.TELEGRAM_MODE ?? 'webhook').trim().toLowerCase();
  const telegramMode: TelegramMode = telegramModeRaw === 'polling' ? 'polling' : 'webhook';

  const allowedRaw = optEnv('TELEGRAM_ALLOWED_CHAT_IDS');
  const allowedChatIds = (
      allowedRaw
          ? allowedRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : telegramChatId
              ? [telegramChatId]
              : []
  );

  const telegramEnabled =
      telegramMode === 'polling'
          ? Boolean(telegramBotToken && allowedChatIds.length > 0)
          : Boolean(telegramBotToken && allowedChatIds.length > 0 && telegramWebhookSecret);

  return {
    port,
    apiKey,
    databaseUrl,
    claimTtlMs,
    joinCodeTtlMs,
    defaultGatewayDeviceId,
    demo: {
      enabled: demoEnabled,
      code: demoCode,
      pairToken: demoPairToken,
      pairingId: demoPairingId,
      gatewayDeviceId: demoGatewayDeviceId,
      gatewayPubSpkiB64: demoGatewayPubSpkiB64,
    },
    vapid: {
      subject: vapidSubject,
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
      enabled: vapidEnabled,
    },
    telegram: {
      mode: telegramMode,
      botToken: telegramBotToken,
      allowedChatIds,
      webhookSecret: telegramWebhookSecret,
      enabled: telegramEnabled,
    },
  };
}
