import { fetch } from 'undici';

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramSendOptions = {
  replyMarkup?: any;
  disableWebPagePreview?: boolean;
};

export async function telegramSend(cfg: TelegramConfig, text: string, opts?: TelegramSendOptions) {
  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text,
      disable_web_page_preview: opts?.disableWebPagePreview ?? true,
      reply_markup: opts?.replyMarkup ?? undefined,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed: ${res.status} ${t}`);
  }
}

export async function telegramAnswerCallback(botToken: string, callbackQueryId: string, text?: string) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text ?? undefined,
      show_alert: false,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Telegram answerCallbackQuery failed: ${res.status} ${t}`);
  }
}

// ----------------- parsing helpers -----------------

export type TgCmd =
    | { kind: 'help' }
    | { kind: 'who' }
    | { kind: 'gateways' }
    | { kind: 'use_gateway'; gatewayDeviceId: string }
    | { kind: 'set_sim'; simSlotIndex: number | null }
    | { kind: 'recent'; limit: number }
    | { kind: 'open'; threadId: string }
    | { kind: 'sms'; numberOrQuery: string; body: string; simSlotIndex: number | null }
    | { kind: 'reply_text'; body: string };

export function parseTelegramText(raw: string): TgCmd {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'help' };

  if (!text.startsWith('/')) {
    return { kind: 'reply_text', body: text };
  }

  const t = text.replace(/^\//, '').trim();
  const [cmdRaw, ...rest] = t.split(/\s+/);
  const cmd = (cmdRaw ?? '').toLowerCase();

  if (cmd === 'start' || cmd === 'help') return { kind: 'help' };
  if (cmd === 'who') return { kind: 'who' };
  if (cmd === 'gateways') return { kind: 'gateways' };

  if (cmd === 'use') {
    const gatewayDeviceId = rest.join(' ').trim();
    return gatewayDeviceId ? { kind: 'use_gateway', gatewayDeviceId } : { kind: 'help' };
  }

  if (cmd === 'sim') {
    const v = (rest[0] ?? '').trim().toLowerCase();
    if (!v || v === 'auto' || v === 'default') return { kind: 'set_sim', simSlotIndex: null };
    if (v === '1') return { kind: 'set_sim', simSlotIndex: 0 };
    if (v === '2') return { kind: 'set_sim', simSlotIndex: 1 };
    return { kind: 'help' };
  }

  if (cmd === 'recent') {
    const n = Number(rest[0] ?? 10);
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : 10;
    return { kind: 'recent', limit };
  }

  if (cmd === 'open') {
    const threadId = rest.join(' ').trim();
    return threadId ? { kind: 'open', threadId } : { kind: 'help' };
  }

  if (cmd === 'sms' || cmd === 'sms1' || cmd === 'sms2') {
    const simSlotIndex = cmd === 'sms1' ? 0 : cmd === 'sms2' ? 1 : null;
    const m = text.match(/^\/(sms|sms1|sms2)\s+(\S+)\s+([\s\S]+)$/i);
    if (!m) return { kind: 'help' };
    const numberOrQuery = m[2].trim();
    const body = m[3].trim();
    if (!numberOrQuery || !body) return { kind: 'help' };
    return { kind: 'sms', numberOrQuery, body, simSlotIndex };
  }

  return { kind: 'help' };
}

export function telegramHelpText() {
  return [
    'SMS Gateway — Telegram bot',
    '',
    'Send an SMS:',
    '• /sms <number> <message>',
    '• /sms1 <number> <message>   (force SIM1)',
    '• /sms2 <number> <message>   (force SIM2)',
    '',
    'Reply mode:',
    '• Tap “Reply” under an inbound SMS, then just type your message',
    '• /recent [n]      (list recent chats)',
    '• /open <threadId> (set active chat)',
    '',
    'Gateway & SIM:',
    '• /gateways        (list gateways)',
    '• /use <gatewayId> (set current gateway)',
    '• /sim auto|1|2    (set default SIM)',
    '',
    'Info:',
    '• /who             (show current session)',
  ].join('\n');
}
