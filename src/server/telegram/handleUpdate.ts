import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { createRepo } from '../db/repo.js';
import type { SseHub } from '../realtime/sseHub.js';
import {
    parseTelegramText,
    telegramAnswerCallback,
    telegramHelpText,
    telegramSend,
} from '../services/telegram.js';

function fmtSim(simSlotIndex: number | null) {
    if (simSlotIndex === 0) return 'SIM1';
    if (simSlotIndex === 1) return 'SIM2';
    return 'AUTO';
}

function looksLikePhone(q: string) {
    const s = q.trim();
    return /^[+0-9][0-9+()\-\s]{5,}$/.test(s);
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

    const isAllowed =
        cfg.telegram.allowedChatIds.length === 0 || cfg.telegram.allowedChatIds.includes(chatId);

    // If user is not allowed, STILL ACK callback query to stop Telegram's loading spinner.
    if (!isAllowed) {
        if (cb?.id) {
            try {
                await telegramAnswerCallback(botToken, String(cb.id));
            } catch {
                // ignore
            }
        }
        return;
    }

    // ---------------- callback query ----------------
    if (cb) {
        const cbId = String(cb.id ?? '');
        const data = String(cb.data ?? '').trim();

        // r:<messageId>:<keep|0|1>
        const m = data.match(/^r:([0-9a-f\-]{16,}):(keep|0|1)$/i);
        if (m) {
            const messageId = m[1];
            const sim = m[2];

            // ACK quickly with a hint.
            try {
                await telegramAnswerCallback(botToken, cbId, 'Reply mode set');
            } catch {
                // ignore
            }

            const meta = await repo.getMessageMeta(messageId);
            if (!meta) {
                try {
                    await telegramSend({ botToken, chatId }, '⚠️ Could not find that message.');
                } catch {
                    // ignore
                }
                return;
            }

            const { norm, tail } = repo.normalizePhone(meta.peer);
            const threadId = tail || norm || meta.peer;

            const session = await repo.getTelegramSession(chatId);
            session.gatewayDeviceId = meta.gatewayDeviceId;
            session.lastPeer = meta.peer;
            session.lastThreadId = threadId;
            if (sim === '0' || sim === '1') session.defaultSimSlotIndex = Number(sim);
            await repo.setTelegramSession(session);

            const peerName = await repo.lookupContactName(meta.gatewayDeviceId, meta.peer);
            const title = peerName ? `${peerName} (${meta.peer})` : meta.peer;
            const simLabel = fmtSim(session.defaultSimSlotIndex);

            try {
                await telegramSend(
                    { botToken, chatId },
                    `↩️ Reply mode: [${meta.gatewayDeviceId}] ${simLabel}\nTo: ${title}\n\nNow just type your message.`
                );
            } catch {
                // ignore
            }

            return;
        }

        // Unknown callback: acknowledge to avoid Telegram retries + spinner.
        try {
            await telegramAnswerCallback(botToken, cbId);
        } catch {
            // ignore
        }
        return;
    }

    // ---------------- message ----------------
    const text = String(msg?.text ?? '').trim();
    const cmd = parseTelegramText(text);

    const session = await repo.getTelegramSession(chatId);
    const gatewayDeviceId = session.gatewayDeviceId || cfg.defaultGatewayDeviceId;

    async function send(textOut: string) {
        await telegramSend({ botToken, chatId }, textOut);
    }

    try {
        if (cmd.kind === 'help') {
            await send(telegramHelpText());
            return;
        }

        if (cmd.kind === 'who') {
            await send(
                [
                    'Session:',
                    `• Gateway: ${gatewayDeviceId}`,
                    `• Default SIM: ${fmtSim(session.defaultSimSlotIndex)}`,
                    `• Active thread: ${session.lastThreadId ?? '-'}`,
                    `• Active peer: ${session.lastPeer ?? '-'}`,
                ].join('\n')
            );
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
                return `${i + 1}) ${g.id}${mark} (last seen: ${age})`;
            });
            await send(['Gateways:', ...lines, '', 'Use: /use <gatewayId>'].join('\n'));
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
            const pairing = await repo.getLatestPairingForGateway(gatewayDeviceId);
            if (!pairing) {
                await send(
                    `No pairing found yet for gateway ${gatewayDeviceId}. Pair a PWA first or send an SMS to create history.`
                );
                return;
            }
            const convs = await repo.listConversations(pairing.id, cmd.limit);
            if (convs.length === 0) {
                await send('No conversations yet.');
                return;
            }
            const lines = convs.map((c) => {
                const title = c.peerName ? `${c.peerName} (${c.peer})` : c.peer;
                const preview = c.lastBodyIsEncrypted ? '🔒 Encrypted' : c.lastPreview;
                return `• ${c.threadId} — ${title}\n  ${preview}`;
            });
            await send(['Recent chats:', ...lines, '', 'Open: /open <threadId>'].join('\n'));
            return;
        }

        if (cmd.kind === 'open') {
            const pairing = await repo.getLatestPairingForGateway(gatewayDeviceId);
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
            await send(`✅ Active chat set: ${title}\nNow just type your message.`);
            return;
        }

        if (cmd.kind === 'sms') {
            let toNumber = cmd.numberOrQuery;
            let toName: string | null = null;

            // Allow sending by contact search (name) too.
            if (!looksLikePhone(toNumber)) {
                const matches = await repo.searchContacts(gatewayDeviceId, toNumber, 6);
                if (matches.length === 0) {
                    await send(
                        `No contact match for “${toNumber}”. Use a phone number: /sms +98912... hi`
                    );
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
            const pairing = await repo.getLatestPairingForGateway(gatewayDeviceId);
            let pairingId = pairing?.id ?? null;
            if (!pairingId) {
                pairingId = randomUUID();
                await repo.createPairing({ pairingId, gatewayDeviceId, gatewayPubSpkiB64: 'AA==' });
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
            await send(`✅ Queued via [${gatewayDeviceId}] ${fmtSim(simSlotIndex ?? null)} → ${who}`);
            return;
        }

        if (cmd.kind === 'reply_text') {
            if (!session.lastPeer) {
                await send('No active chat. Tap “Reply” under an inbound SMS or use /recent and /open.');
                return;
            }

            const pairing = await repo.getLatestPairingForGateway(gatewayDeviceId);
            let pairingId = pairing?.id ?? null;
            if (!pairingId) {
                pairingId = randomUUID();
                await repo.createPairing({ pairingId, gatewayDeviceId, gatewayPubSpkiB64: 'AA==' });
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

            await send(`✅ Queued reply via [${gatewayDeviceId}] ${fmtSim(simSlotIndex)}.`);
            return;
        }

        await send(telegramHelpText());
    } catch (err) {
        // Don’t crash; always respond.
        try {
            await send('⚠️ Telegram bot error. Check server logs.');
        } catch {
            // ignore
        }
    }
}
