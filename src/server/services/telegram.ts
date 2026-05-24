import { fetch } from 'undici';

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type TelegramSendOptions = {
  replyMarkup?: any;
  disableWebPagePreview?: boolean;
};

export type TelegramApiResult<T = any> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

export async function telegramApi<T = any>(
  botToken: string,
  method: string,
  payload: Record<string, any> = {}
): Promise<TelegramApiResult<T>> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(async () => {
    const text = await res.text().catch(() => '');
    return { ok: false, description: text || res.statusText, error_code: res.status };
  })) as TelegramApiResult<T>;

  if (!res.ok || data.ok !== true) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${data.description ?? ''}`.trim());
  }

  return data;
}

export async function telegramSend(cfg: TelegramConfig, text: string, opts?: TelegramSendOptions) {
  await telegramApi(cfg.botToken, 'sendMessage', {
    chat_id: cfg.chatId,
    text,
    disable_web_page_preview: opts?.disableWebPagePreview ?? true,
    reply_markup: opts?.replyMarkup ?? undefined,
  });
}

export async function telegramAnswerCallback(botToken: string, callbackQueryId: string, text?: string) {
  await telegramApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text ?? undefined,
    show_alert: false,
  });
}

export async function telegramSetWebhook(botToken: string, webhookUrl: string) {
  return telegramApi(botToken, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: false,
  });
}

export async function telegramSetCommands(botToken: string) {
  return telegramApi(botToken, 'setMyCommands', {
    commands: [
      { command: 'start', description: 'Open setup or main menu' },
      { command: 'link', description: 'Connect this chat with a link code' },
      { command: 'status', description: 'Show bot status' },
      { command: 'recent', description: 'Show recent SMS chats' },
      { command: 'open', description: 'Set an active SMS chat' },
      { command: 'sms', description: 'Send an SMS' },
      { command: 'sim', description: 'Choose default SIM' },
      { command: 'gateways', description: 'List Android gateways' },
      { command: 'pause', description: 'Pause Telegram alerts' },
      { command: 'resume', description: 'Resume Telegram alerts' },
      { command: 'help', description: 'Show help' },
    ],
  });
}

export async function telegramGetMe(botToken: string) {
  return telegramApi<{ id: number; is_bot: boolean; first_name: string; username?: string }>(botToken, 'getMe');
}

// ----------------- parsing helpers -----------------

export type TgCmd =
  | { kind: 'help' }
  | { kind: 'who' }
  | { kind: 'status' }
  | { kind: 'link'; code: string }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'unlink' }
  | { kind: 'gateways' }
  | { kind: 'use_gateway'; gatewayDeviceId: string }
  | { kind: 'set_sim'; simSlotIndex: number | null }
  | { kind: 'recent'; limit: number }
  | { kind: 'open'; threadId: string }
  | { kind: 'sms'; numberOrQuery: string; body: string; simSlotIndex: number | null }
  | { kind: 'reply_text'; body: string };

function cleanCode(raw: string) {
  return String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function parseTelegramText(raw: string): TgCmd {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'help' };

  if (!text.startsWith('/')) {
    return { kind: 'reply_text', body: text };
  }

  const t = text.replace(/^\//, '').trim();
  const [cmdRawWithBot, ...rest] = t.split(/\s+/);
  const cmdRaw = (cmdRawWithBot ?? '').split('@')[0] ?? '';
  const cmd = cmdRaw.toLowerCase();

  if (cmd === 'start') {
    const code = cleanCode(rest.join(' '));
    return code ? { kind: 'link', code } : { kind: 'help' };
  }
  if (cmd === 'help' || cmd === 'menu') return { kind: 'help' };
  if (cmd === 'who' || cmd === 'status') return { kind: 'status' };

  if (cmd === 'link') {
    const code = cleanCode(rest.join(' '));
    return code ? { kind: 'link', code } : { kind: 'help' };
  }

  if (cmd === 'pause' || cmd === 'off' || cmd === 'stop') return { kind: 'pause' };
  if (cmd === 'resume' || cmd === 'on') return { kind: 'resume' };
  if (cmd === 'unlink') return { kind: 'unlink' };
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
    const m = text.match(/^\/(sms|sms1|sms2)(?:@\w+)?\s+(\S+)\s+([\s\S]+)$/i);
    if (!m) return { kind: 'help' };
    const numberOrQuery = m[2].trim();
    const body = m[3].trim();
    if (!numberOrQuery || !body) return { kind: 'help' };
    return { kind: 'sms', numberOrQuery, body, simSlotIndex };
  }

  return { kind: 'help' };
}

export function telegramHelpText(isLinked = true) {
  if (!isLinked) {
    return [
      '✨ SMS Gateway Telegram Bot',
      '',
      'This chat is not connected yet.',
      '',
      'How to connect:',
      '1) Open the web app',
      '2) Settings → Telegram Bot',
      '3) Tap “Generate link code”',
      '4) Send /link CODE here',
      '',
      'After linking, I can notify you about new SMS messages and let you reply from Telegram.',
    ].join('\n');
  }

  return [
    '✨ SMS Gateway Telegram Bot',
    '',
    'Send an SMS:',
    '• /sms <number-or-contact> <message>',
    '• /sms1 <number> <message>   force SIM1',
    '• /sms2 <number> <message>   force SIM2',
    '',
    'Reply mode:',
    '• Tap “Reply” under an inbound SMS, then type your reply',
    '• /recent [n]      list recent chats',
    '• /open <threadId> set active chat',
    '',
    'Gateway & SIM:',
    '• /gateways        list gateways',
    '• /use <gatewayId> select gateway',
    '• /sim auto|1|2    default SIM',
    '',
    'Bot controls:',
    '• /status          current bot status',
    '• /pause           pause alerts for this chat',
    '• /resume          resume alerts',
    '• /unlink          disconnect this chat',
  ].join('\n');
}
