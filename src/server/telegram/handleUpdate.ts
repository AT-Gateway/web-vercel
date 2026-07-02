import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type { createRepo, PairingRow, TelegramChatSubscription } from '../db/repo';
import type { SseHub } from '../realtime/sseHub';
import {
  parseTelegramText,
  telegramAnswerCallback,
  telegramHelpText,
  telegramSend,
} from '../services/telegram';

function fmtSim(simSlotIndex: number | null) {
  if (simSlotIndex === 0) return 'SIM1';
  if (simSlotIndex === 1) return 'SIM2';
  return 'AUTO';
}

function looksLikePhone(q: string) {
  const s = q.trim();
  return /^[+0-9][0-9+()\-\s]{5,}$/.test(s);
}

function chatDisplayName(msgOrCb: any) {
  const from = msgOrCb?.from ?? msgOrCb?.message?.from ?? {};
  return {
    username: from?.username ? String(from.username) : null,
    firstName: from?.first_name ? String(from.first_name) : null,
    lastName: from?.last_name ? String(from.last_name) : null,
  };
}

function mainKeyboard(isEnabled = true) {
  return {
    inline_keyboard: [
      [
        { text: '🕘 Recent chats', callback_data: 'tg:recent' },
        { text: '📊 Status', callback_data: 'tg:status' },
      ],
      [
        isEnabled
          ? { text: '⏸ Pause alerts', callback_data: 'tg:pause' }
          : { text: '▶️ Resume alerts', callback_data: 'tg:resume' },
      ],
    ],
  };
}

function cleanLinkCode(code: string) {
  return String(code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

async function activePairingFor(
  repo: ReturnType<typeof createRepo>,
  gatewayDeviceId: string,
  primarySubscription: TelegramChatSubscription | null
): Promise<PairingRow | null> {
  if (primarySubscription?.pairingId) {
    const pairing = await repo.getPairingById(primarySubscription.pairingId);
    if (pairing) return pairing;
  }
  return repo.getLatestPairingForGateway(gatewayDeviceId);
}

async function sendStatus(
  botToken: string,
  chatId: string,
  cfg: AppConfig,
  repo: ReturnType<typeof createRepo>,
  session: any,
  linked: TelegramChatSubscription[],
  gatewayDeviceId: string
) {
  const primary = linked.find((s) => s.enabled) ?? linked[0] ?? null;
  const pairing = await activePairingFor(repo, gatewayDeviceId, primary);
  const settings = pairing ? await repo.getTelegramPairingSettings(pairing.id) : null;
  const enabledChats = linked.filter((s) => s.enabled).length;

  await telegramSend(
    { botToken, chatId },
    [
      '📊 Telegram bot status',
      '',
      `Server bot: ${cfg.telegram.enabled ? 'Enabled' : 'Disabled'}`,
      `Mode: ${cfg.telegram.mode}`,
      `Connected chat: ${primary ? (primary.enabled ? 'Active' : 'Paused') : 'Not linked'}`,
      `App alerts: ${settings?.alertsEnabled === false ? 'Inactive' : 'Active'}`,
      `Linked chats: ${linked.length} (${enabledChats} active)`,
      `Gateway: ${gatewayDeviceId}`,
      `Pairing: ${pairing?.id ?? '-'}`,
      `Default SIM: ${fmtSim(session.defaultSimSlotIndex)}`,
      `Active peer: ${session.lastPeer ?? '-'}`,
    ].join('\n'),
    { replyMarkup: mainKeyboard(primary?.enabled ?? true) }
  );
}

async function sendRecent(
  botToken: string,
  chatId: string,
  repo: ReturnType<typeof createRepo>,
  gatewayDeviceId: string,
  primary: TelegramChatSubscription | null,
  limit = 10
) {
  const pairing = await activePairingFor(repo, gatewayDeviceId, primary);
  if (!pairing) {
    await telegramSend(
      { botToken, chatId },
      `No pairing found yet for gateway ${gatewayDeviceId}. Pair the web app first or send an SMS to create history.`
    );
    return;
  }

  const convs = await repo.listConversations(pairing.id, limit);
  if (convs.length === 0) {
    await telegramSend({ botToken, chatId }, 'No conversations yet.');
    return;
  }

  const lines = convs.map((c, i) => {
    const title = c.peerName ? `${c.peerName} (${c.peer})` : c.peer;
    const preview = c.lastBodyIsEncrypted ? '🔒 Encrypted' : c.lastPreview;
    return `${i + 1}) ${title}\n   Thread: ${c.threadId}\n   ${preview}`;
  });

  await telegramSend(
    { botToken, chatId },
    ['🕘 Recent chats', '', ...lines, '', 'Open one with: /open <threadId>'].join('\n')
  );
}

/**
 * Shared Telegram update handler.
 * Works for both webhook updates and polling (getUpdates).
 */
export async function handleTelegramUpdate(
  update: any,
  cfg: AppConfig,
  repo: ReturnType<typeof createRepo>,
  hub: SseHub
) {
  if (!cfg.telegram.enabled || !cfg.telegram.botToken) return;

  const botToken = cfg.telegram.botToken;

  const msg = update?.message ?? update?.edited_message;
  const cb = update?.callback_query;

  const chatIdRaw = cb?.message?.chat?.id ?? msg?.chat?.id;
  const chatId = chatIdRaw !== undefined && chatIdRaw !== null ? String(chatIdRaw) : '';
  if (!chatId) return;

  const allowListEnabled = cfg.telegram.allowedChatIds.length > 0;
  const isAllowed = !allowListEnabled || cfg.telegram.allowedChatIds.includes(chatId);

  // If user is not allowed, STILL ACK callback query to stop Telegram's loading spinner.
  if (!isAllowed) {
    if (cb?.id) {
      try {
        await telegramAnswerCallback(botToken, String(cb.id), 'This chat is not allowed.');
      } catch {
        // ignore
      }
    }
    return;
  }

  const linked = await repo.listTelegramSubscriptionsForChat(chatId);
  const primary = linked.find((s) => s.enabled) ?? linked[0] ?? null;
  const session = await repo.getTelegramSession(chatId);
  const gatewayDeviceId = session.gatewayDeviceId || primary?.gatewayDeviceId || cfg.defaultGatewayDeviceId;

  async function send(textOut: string, opts?: { replyMarkup?: any }) {
    await telegramSend({ botToken, chatId }, textOut, opts);
  }

  async function requireLinkedOrLegacy() {
    if (primary || cfg.telegram.allowedChatIds.includes(chatId)) return true;
    await send(telegramHelpText(false));
    return false;
  }

  // ---------------- callback query ----------------
  if (cb) {
    const cbId = String(cb.id ?? '');
    const data = String(cb.data ?? '').trim();

    if (data === 'tg:status') {
      await telegramAnswerCallback(botToken, cbId).catch(() => {});
      await sendStatus(botToken, chatId, cfg, repo, session, linked, gatewayDeviceId);
      return;
    }

    if (data === 'tg:recent') {
      await telegramAnswerCallback(botToken, cbId).catch(() => {});
      if (await requireLinkedOrLegacy()) await sendRecent(botToken, chatId, repo, gatewayDeviceId, primary, 10);
      return;
    }

    if (data === 'tg:pause' || data.startsWith('tg:pause:')) {
      await telegramAnswerCallback(botToken, cbId, 'Alerts paused').catch(() => {});
      const pairingId = data.split(':')[2] || primary?.pairingId;
      if (pairingId && primary) {
        await repo.setTelegramSubscriptionEnabled(pairingId, chatId, false);
        await send('⏸ Telegram alerts paused for this chat.', { replyMarkup: mainKeyboard(false) });
      } else if (pairingId) {
        await repo.setTelegramPairingSettings(pairingId, false);
        await send('⏸ Telegram alerts paused for this pairing from the app-level setting.', { replyMarkup: mainKeyboard(false) });
      } else {
        await send('No linked pairing found. Use the app to generate a Telegram link code.');
      }
      return;
    }

    if (data === 'tg:resume') {
      await telegramAnswerCallback(botToken, cbId, 'Alerts resumed').catch(() => {});
      if (primary) {
        await repo.setTelegramSubscriptionEnabled(primary.pairingId, chatId, true);
        await send('▶️ Telegram alerts resumed for this chat.', { replyMarkup: mainKeyboard(true) });
      } else {
        await send('No linked pairing found. Use /link CODE first.');
      }
      return;
    }

    // r:<messageId>:<keep|0|1>
    const m = data.match(/^r:([0-9a-f\-]{16,}):(keep|0|1)$/i);
    if (m) {
      const messageId = m[1];
      const sim = m[2];

      // ACK quickly with a hint.
      await telegramAnswerCallback(botToken, cbId, 'Reply mode set').catch(() => {});

      const meta = await repo.getMessageMeta(messageId);
      if (!meta) {
        await send('⚠️ Could not find that message.');
        return;
      }

      const { norm, tail } = repo.normalizePhone(meta.peer);
      const threadId = tail || norm || meta.peer;

      session.gatewayDeviceId = meta.gatewayDeviceId;
      session.lastPeer = meta.peer;
      session.lastThreadId = threadId;
      if (sim === '0' || sim === '1') session.defaultSimSlotIndex = Number(sim);
      await repo.setTelegramSession(session);

      const peerName = await repo.lookupContactName(meta.gatewayDeviceId, meta.peer);
      const title = peerName ? `${peerName} (${meta.peer})` : meta.peer;
      const simLabel = fmtSim(session.defaultSimSlotIndex);

      await send(`↩️ Reply mode ready\n\nGateway: ${meta.gatewayDeviceId}\nSIM: ${simLabel}\nTo: ${title}\n\nNow just type your message.`);
      return;
    }

    // Unknown callback: acknowledge to avoid Telegram retries + spinner.
    await telegramAnswerCallback(botToken, cbId).catch(() => {});
    return;
  }

  // ---------------- message ----------------
  const text = String(msg?.text ?? '').trim();
  const cmd = parseTelegramText(text);

  try {
    if (cmd.kind === 'link') {
      const code = cleanLinkCode(cmd.code);
      const link = await repo.consumeTelegramLinkCode(code);
      if (link.ok === false) {
        const reason = link.reason;
        await send(
          reason === 'expired'
            ? '⏱ That link code expired. Generate a fresh code in the web app.'
            : '❌ Invalid link code. Open the web app → Settings → Telegram Bot → Generate link code.'
        );
        return;
      }

      const pairing = await repo.getPairingById(link.pairingId);
      if (!pairing) {
        await send('⚠️ Pairing not found. Generate a new link code from the web app.');
        return;
      }

      const chat = msg?.chat ?? {};
      const name = chatDisplayName(msg);
      await repo.upsertTelegramSubscription({
        pairingId: pairing.id,
        chatId,
        chatType: chat?.type ? String(chat.type) : null,
        username: name.username,
        firstName: name.firstName,
        lastName: name.lastName,
        enabled: true,
      });

      session.gatewayDeviceId = pairing.gatewayDeviceId;
      await repo.setTelegramSession(session);

      await send(
        [
          '✅ Telegram connected',
          '',
          `Gateway: ${pairing.gatewayDeviceId}`,
          'Alerts: Active',
          '',
          'You can now receive new SMS messages here and reply directly from Telegram.',
        ].join('\n'),
        { replyMarkup: mainKeyboard(true) }
      );
      return;
    }

    if (cmd.kind === 'help') {
      await send(telegramHelpText(Boolean(primary || cfg.telegram.allowedChatIds.includes(chatId))), {
        replyMarkup: primary ? mainKeyboard(primary.enabled) : undefined,
      });
      return;
    }

    if (!(await requireLinkedOrLegacy())) return;

    if (cmd.kind === 'status' || cmd.kind === 'who') {
      await sendStatus(botToken, chatId, cfg, repo, session, linked, gatewayDeviceId);
      return;
    }

    if (cmd.kind === 'pause') {
      if (!primary) {
        await send('This chat is using a legacy TELEGRAM_CHAT_ID env setup. Pause it from the app Telegram setting.');
        return;
      }
      await repo.setTelegramSubscriptionEnabled(primary.pairingId, chatId, false);
      await send('⏸ Telegram alerts paused for this chat. Use /resume to turn them back on.', {
        replyMarkup: mainKeyboard(false),
      });
      return;
    }

    if (cmd.kind === 'resume') {
      if (!primary) {
        await send('This chat is using a legacy TELEGRAM_CHAT_ID env setup. Resume it from the app Telegram setting.');
        return;
      }
      await repo.setTelegramSubscriptionEnabled(primary.pairingId, chatId, true);
      await send('▶️ Telegram alerts resumed for this chat.', { replyMarkup: mainKeyboard(true) });
      return;
    }

    if (cmd.kind === 'unlink') {
      if (!primary) {
        await send('No linked Telegram chat found.');
        return;
      }
      await repo.deleteTelegramSubscription(primary.pairingId, chatId);
      await send('🧹 This Telegram chat has been disconnected. Generate a new link code in the web app to connect again.');
      return;
    }

    if (cmd.kind === 'gateways') {
      const gs = await repo.listGatewayDevices(25);
      if (gs.length === 0) {
        await send('No gateways found yet. Start the Android app once so it registers.');
        return;
      }
      const lines = gs.map((g, i) => {
        const age = g.lastSeenAt ? new Date(g.lastSeenAt).toLocaleString() : 'never';
        const mark = g.id === gatewayDeviceId ? ' ✅' : '';
        return `${i + 1}) ${g.id}${mark}\n   Last seen: ${age}`;
      });
      await send(['📱 Gateways', '', ...lines, '', 'Use one with: /use <gatewayId>'].join('\n'));
      return;
    }

    if (cmd.kind === 'use_gateway') {
      session.gatewayDeviceId = cmd.gatewayDeviceId;
      await repo.setTelegramSession(session);
      await send(`✅ Gateway set to: ${cmd.gatewayDeviceId}`);
      return;
    }

    if (cmd.kind === 'set_sim') {
      session.defaultSimSlotIndex = cmd.simSlotIndex;
      await repo.setTelegramSession(session);
      await send(`✅ Default SIM set to: ${fmtSim(cmd.simSlotIndex)}`);
      return;
    }

    if (cmd.kind === 'recent') {
      await sendRecent(botToken, chatId, repo, gatewayDeviceId, primary, cmd.limit);
      return;
    }

    if (cmd.kind === 'open') {
      const pairing = await activePairingFor(repo, gatewayDeviceId, primary);
      if (!pairing) {
        await send(`No pairing found yet for gateway ${gatewayDeviceId}.`);
        return;
      }
      const resolved = await repo.resolvePeerByThreadId(pairing.id, cmd.threadId);
      if (!resolved) {
        await send('Thread not found. Use /recent to see valid threadIds.');
        return;
      }
      session.lastPeer = resolved.peer;
      session.lastThreadId = cmd.threadId;
      await repo.setTelegramSession(session);
      const title = resolved.peerName ? `${resolved.peerName} (${resolved.peer})` : resolved.peer;
      await send(`✅ Active chat set\n\nTo: ${title}\nNow just type your message.`);
      return;
    }

    if (cmd.kind === 'sms') {
      let toNumber = cmd.numberOrQuery;
      let toName: string | null = null;

      // Allow sending by contact search (name) too.
      if (!looksLikePhone(toNumber)) {
        const matches = await repo.searchContacts(gatewayDeviceId, toNumber, 6);
        if (matches.length === 0) {
          await send(`No contact match for “${toNumber}”. Use a phone number: /sms +98912... hi`);
          return;
        }
        if (matches.length > 1) {
          const lines = matches.map((c) => `• ${c.displayName} — ${c.rawNumber ?? c.norm}`);
          await send(['Multiple matches:', ...lines, '', 'Use a full number with /sms.'].join('\n'));
          return;
        }
        const c = matches[0];
        toName = c.displayName;
        toNumber = c.rawNumber ?? c.norm;
      } else {
        toName = await repo.lookupContactName(gatewayDeviceId, toNumber);
      }

      // Ensure we have a pairing to attach the outbox to.
      const pairing = await activePairingFor(repo, gatewayDeviceId, primary);
      let pairingId = pairing?.id ?? null;
      if (!pairingId) {
        pairingId = randomUUID();
        await repo.createPairing({ pairingId, gatewayDeviceId, gatewayPubSpkiB64: 'AA==' });
      }

      if (await repo.isThreadBlocked(pairingId, toNumber)) {
        await send('Blocked chat. Unblock it in the web app before sending.');
        return;
      }

      const simSlotIndex = cmd.simSlotIndex ?? session.defaultSimSlotIndex;
      const { norm, tail } = repo.normalizePhone(toNumber);

      const id = randomUUID();
      await repo.enqueueOutboundMessage({
        id,
        pairingId,
        gatewayDeviceId,
        peer: toNumber,
        peerNorm: norm || null,
        peerTail: tail || null,
        body: cmd.body,
        bodyIsEncrypted: false,
        ts: Date.now(),
        createdBy: 'telegram',
        simSlotIndex: simSlotIndex ?? null,
        subscriptionId: null,
      });

      hub.emit(pairingId, 'message', {
        id,
        peer: toNumber,
        threadId: tail || norm || toNumber,
        direction: 'out',
        ts: Date.now(),
        status: 'queued',
      });

      const who = toName ? `${toName} (${toNumber})` : toNumber;
      await send(`✅ Queued SMS\n\nGateway: ${gatewayDeviceId}\nSIM: ${fmtSim(simSlotIndex ?? null)}\nTo: ${who}`);
      return;
    }

    if (cmd.kind === 'reply_text') {
      if (!session.lastPeer) {
        await send('No active chat. Tap “Reply” under an inbound SMS or use /recent and /open.');
        return;
      }

      const pairing = await activePairingFor(repo, gatewayDeviceId, primary);
      let pairingId = pairing?.id ?? null;
      if (!pairingId) {
        pairingId = randomUUID();
        await repo.createPairing({ pairingId, gatewayDeviceId, gatewayPubSpkiB64: 'AA==' });
      }

      if (await repo.isThreadBlocked(pairingId, session.lastPeer)) {
        await send('Blocked chat. Unblock it in the web app before sending.');
        return;
      }

      const { norm, tail } = repo.normalizePhone(session.lastPeer);
      const id = randomUUID();
      const simSlotIndex = session.defaultSimSlotIndex;

      await repo.enqueueOutboundMessage({
        id,
        pairingId,
        gatewayDeviceId,
        peer: session.lastPeer,
        peerNorm: norm || null,
        peerTail: tail || null,
        body: cmd.body,
        bodyIsEncrypted: false,
        ts: Date.now(),
        createdBy: 'telegram',
        simSlotIndex: simSlotIndex ?? null,
        subscriptionId: null,
      });

      hub.emit(pairingId, 'message', {
        id,
        peer: session.lastPeer,
        threadId: tail || norm || session.lastPeer,
        direction: 'out',
        ts: Date.now(),
        status: 'queued',
      });

      await send(`✅ Queued reply via ${gatewayDeviceId} · ${fmtSim(simSlotIndex)}.`);
      return;
    }

    await send(telegramHelpText(true));
  } catch (err) {
    // Don’t crash; always respond.
    try {
      await send('⚠️ Telegram bot error. Check server logs.');
    } catch {
      // ignore
    }
  }
}
