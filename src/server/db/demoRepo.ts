import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type {
  ConversationRow,
  DeviceType,
  JoinCodeRow,
  MessageCreatedBy,
  MessageDirection,
  MessageRow,
  MessageStatus,
  OutboxItem,
  PairAuth,
  PairingRow,
  TelegramSession,
  createRepo,
} from './repo';
import { normalizePhone } from '../utils/phone';

type Repo = ReturnType<typeof createRepo>;
type DemoConfig = AppConfig['demo'];

type DemoContact = {
  displayName: string;
  rawNumber: string | null;
  norm: string;
  tail: string;
};

type DemoDevice = {
  deviceId: string;
  deviceType: string;
  deviceLabel: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  pairToken: string;
};

type DemoState = {
  createdAt: number;
  contacts: DemoContact[];
  devices: DemoDevice[];
  messages: MessageRow[];
  pushSubscriptions: Array<{ deviceId: string; subscription: any }>;
  telegramSessions: Map<string, TelegramSession>;
};

function isDemoPairing(cfg: DemoConfig, pairingId: string | null | undefined) {
  return Boolean(pairingId && pairingId === cfg.pairingId);
}

function isDemoGateway(cfg: DemoConfig, gatewayDeviceId: string | null | undefined) {
  return Boolean(gatewayDeviceId && gatewayDeviceId === cfg.gatewayDeviceId);
}

function isDemoToken(cfg: DemoConfig, pairToken: string | null | undefined) {
  return Boolean(pairToken && pairToken === cfg.pairToken);
}

function threadIdFor(peer: string) {
  const { norm, tail } = normalizePhone(peer);
  return tail || norm || peer;
}

function buildMessage(input: {
  id?: string;
  peer: string;
  direction: MessageDirection;
  body: string;
  ts: number;
  status?: MessageStatus;
  deliveredAt?: number | null;
  simSlotIndex?: number | null;
  subscriptionId?: number | null;
  createdBy?: MessageCreatedBy;
  peerName?: string | null;
}): MessageRow {
  const { norm, tail } = normalizePhone(input.peer);
  return {
    id: input.id ?? randomUUID(),
    threadId: tail || norm || input.peer,
    peer: input.peer,
    peerName: input.peerName ?? null,
    direction: input.direction,
    body: input.body,
    bodyIsEncrypted: 0,
    ts: input.ts,
    status: input.status ?? (input.direction === 'out' ? 'sent' : 'received'),
    deliveredAt: input.deliveredAt ?? (input.direction === 'out' ? input.ts + 900 : null),
    simSlotIndex: input.simSlotIndex ?? null,
    subscriptionId: input.subscriptionId ?? null,
    createdBy: input.createdBy ?? (input.direction === 'out' ? 'pwa' : 'android'),
  };
}

function makeDemoState(cfg: DemoConfig): DemoState {
  const now = Date.now();
  const contactsRaw = [
    { name: 'Sahar Abbasi', number: '+989121112233' },
    { name: 'Ali Rezaei', number: '+989353334455' },
    { name: 'Neda Mohammadi', number: '+989151234567' },
    { name: 'GoToSafar Support', number: '+982100004242' },
    { name: 'Mina Karimi', number: '+989127778899' },
    { name: 'Reza Frontend', number: '+989301112244' },
    { name: 'Hotel Atlas', number: '+902125551010' },
    { name: 'Demo OTP Service', number: '+989990000000' },
  ];

  const contacts = contactsRaw.map((c) => {
    const { norm, tail } = normalizePhone(c.number);
    return {
      displayName: c.name,
      rawNumber: c.number,
      norm,
      tail,
    };
  });

  const nameFor = (peer: string) => {
    const { norm, tail } = normalizePhone(peer);
    return contacts.find((c) => c.norm === norm || c.tail === tail)?.displayName ?? null;
  };

  const m = (peer: string, direction: MessageDirection, body: string, minutesAgo: number) =>
    buildMessage({
      peer,
      direction,
      body,
      ts: now - minutesAgo * 60_000,
      peerName: nameFor(peer),
      createdBy: direction === 'out' ? 'pwa' : 'android',
    });

  return {
    createdAt: now - 7 * 24 * 60 * 60 * 1000,
    contacts,
    devices: [
      {
        deviceId: 'demo-pwa',
        deviceType: 'pwa',
        deviceLabel: 'Demo PWA',
        createdAt: now - 6 * 24 * 60 * 60 * 1000,
        lastSeenAt: now,
        pairToken: cfg.pairToken,
      },
      {
        deviceId: cfg.gatewayDeviceId,
        deviceType: 'android',
        deviceLabel: 'Demo Android Gateway',
        createdAt: now - 8 * 24 * 60 * 60 * 1000,
        lastSeenAt: now - 2 * 60_000,
        pairToken: 'android-gateway-demo-device',
      },
    ],
    messages: [
      m('+989121112233', 'in', 'Hey Amir, can you send the GoToSafar itinerary link before the meeting?', 220),
      m('+989121112233', 'out', 'Sure, I will send the link and the latest UI preview in a minute.', 216),
      m('+989121112233', 'in', 'Perfect. The demo flow already looks much cleaner.', 207),

      m('+989353334455', 'in', 'The landing page is ready for review. Should we keep the glass cards?', 620),
      m('+989353334455', 'out', 'Yes, keep them. I only want to reduce the padding on mobile.', 603),
      m('+989353334455', 'in', 'Done. I pushed the mobile spacing update.', 584),

      m('+989151234567', 'in', 'Reminder: presentation at 4 PM. Use the demo code so there is no Android dependency.', 1_320),
      m('+989151234567', 'out', 'Got it. I will present with seeded conversations and contacts.', 1_306),

      m('+982100004242', 'in', 'Your demo verification code is 482191. This message is fake seed data.', 2_100),
      m('+982100004242', 'out', 'Thanks. I will not use the real SMS gateway for the presentation.', 2_080),

      m('+902125551010', 'in', 'Reservation confirmed for tomorrow. Confirmation number: ATG-2048.', 3_640),
    ],
    pushSubscriptions: [],
    telegramSessions: new Map(),
  };
}

function safePreview(body: string, encrypted: 0 | 1) {
  if (encrypted) return 'Encrypted message';
  const s = String(body ?? '').trim();
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

function missingDatabase(method: string): never {
  throw new Error(
    `DATABASE_URL is not configured. ${method} is available in demo mode, but real gateway data needs a Postgres database.`
  );
}

export function createDemoAwareRepo(realRepo: Repo | null, cfg: DemoConfig): Repo {
  const state = makeDemoState(cfg);

  const useReal = (method: keyof Repo, ...args: any[]) => {
    if (!realRepo) missingDatabase(String(method));
    return (realRepo[method] as any)(...args);
  };

  const demoPairing = (): PairingRow => ({
    id: cfg.pairingId,
    gatewayDeviceId: cfg.gatewayDeviceId,
    gatewayPubSpkiB64: cfg.gatewayPubSpkiB64,
    createdAt: state.createdAt,
  });

  const demoAuth = (pairToken = cfg.pairToken): PairAuth => ({
    pairToken,
    pairingId: cfg.pairingId,
    gatewayDeviceId: cfg.gatewayDeviceId,
    gatewayPubSpkiB64: cfg.gatewayPubSpkiB64,
    deviceId: 'demo-pwa',
    deviceType: 'pwa',
    deviceLabel: 'Demo PWA',
    createdAt: state.createdAt,
    lastSeenAt: Date.now(),
  });

  const contactName = (peer: string): string | null => {
    const { norm, tail } = normalizePhone(peer);
    return state.contacts.find((c) => c.norm === norm || c.tail === tail)?.displayName ?? null;
  };

  const addOrUpdateContact = (gatewayDeviceId: string, number: string, name: string) => {
    if (!isDemoGateway(cfg, gatewayDeviceId)) return false;
    const { norm, tail } = normalizePhone(number);
    if (!norm) return true;
    const existing = state.contacts.find((c) => c.norm === norm);
    if (existing) {
      existing.displayName = name;
      existing.rawNumber = number;
      existing.tail = tail;
    } else {
      state.contacts.push({ displayName: name, rawNumber: number, norm, tail });
    }
    return true;
  };

  const pushDemoMessage = (message: MessageRow) => {
    const peerName = message.peerName ?? contactName(message.peer);
    state.messages.push({ ...message, peerName });
    state.messages.sort((a, b) => a.ts - b.ts);
  };

  const repo: Repo = {
    async upsertGatewayDevice(gatewayDeviceId: string) {
      if (isDemoGateway(cfg, gatewayDeviceId)) return;
      return useReal('upsertGatewayDevice', gatewayDeviceId);
    },

    async listGatewayDevices(limit = 20) {
      const demo = [{ id: cfg.gatewayDeviceId, lastSeenAt: Date.now() - 2 * 60_000 }];
      if (!realRepo) return demo.slice(0, limit);
      const real = await realRepo.listGatewayDevices(limit);
      return [...demo, ...real.filter((g) => g.id !== cfg.gatewayDeviceId)].slice(0, limit);
    },

    async gatewayDeviceExists(gatewayDeviceId: string) {
      if (isDemoGateway(cfg, gatewayDeviceId)) return true;
      if (!realRepo) return false;
      return realRepo.gatewayDeviceExists(gatewayDeviceId);
    },

    async getPairingById(pairingId: string) {
      if (isDemoPairing(cfg, pairingId)) return demoPairing();
      if (!realRepo) return null;
      return realRepo.getPairingById(pairingId);
    },

    async getLatestPairingForGateway(gatewayDeviceId: string) {
      if (isDemoGateway(cfg, gatewayDeviceId)) return demoPairing();
      if (!realRepo) return null;
      return realRepo.getLatestPairingForGateway(gatewayDeviceId);
    },

    async createPairing(input: { pairingId: string; gatewayDeviceId: string; gatewayPubSpkiB64: string }) {
      if (isDemoPairing(cfg, input.pairingId) || isDemoGateway(cfg, input.gatewayDeviceId)) return;
      return useReal('createPairing', input);
    },

    async updateGatewayPub(pairingId: string, gatewayPubSpkiB64: string) {
      if (isDemoPairing(cfg, pairingId)) return;
      return useReal('updateGatewayPub', pairingId, gatewayPubSpkiB64);
    },

    async upsertJoinCode(input: {
      code: string;
      pairingId: string;
      gatewayDeviceId: string;
      gatewayPubSpkiB64: string;
      ttlMs: number;
      createdByToken?: string | null;
    }) {
      if (isDemoPairing(cfg, input.pairingId) || input.code === cfg.code) return { ok: true as const };
      return useReal('upsertJoinCode', input);
    },

    async getJoinCode(code: string): Promise<JoinCodeRow | null> {
      if (cfg.enabled && code === cfg.code) {
        const now = Date.now();
        return {
          code,
          pairingId: cfg.pairingId,
          gatewayDeviceId: cfg.gatewayDeviceId,
          gatewayPubSpkiB64: cfg.gatewayPubSpkiB64,
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          createdByToken: null,
        };
      }
      if (!realRepo) return null;
      return realRepo.getJoinCode(code);
    },

    async consumeJoinCode(code: string) {
      if (cfg.enabled && code === cfg.code) {
        const join = await repo.getJoinCode(code);
        return { ok: true as const, join: join! };
      }
      if (!realRepo) return { ok: false as const, reason: 'invalid' as const };
      return realRepo.consumeJoinCode(code);
    },

    async createPairToken(input: {
      pairToken: string;
      pairingId: string;
      deviceId: string;
      deviceType: DeviceType;
      deviceLabel?: string | null;
      pubSpkiB64?: string | null;
    }) {
      if (isDemoPairing(cfg, input.pairingId)) {
        const now = Date.now();
        const existing = state.devices.find((d) => d.deviceId === input.deviceId);
        if (existing) {
          existing.lastSeenAt = now;
          existing.deviceType = input.deviceType;
          existing.deviceLabel = input.deviceLabel ?? existing.deviceLabel;
          existing.pairToken = cfg.pairToken;
        } else {
          state.devices.unshift({
            deviceId: input.deviceId,
            deviceType: input.deviceType,
            deviceLabel: input.deviceLabel ?? null,
            createdAt: now,
            lastSeenAt: now,
            pairToken: cfg.pairToken,
          });
        }
        return;
      }
      return useReal('createPairToken', input);
    },

    async getPairByToken(pairToken: string) {
      if (cfg.enabled && isDemoToken(cfg, pairToken)) return demoAuth(pairToken);
      if (!realRepo) return null;
      return realRepo.getPairByToken(pairToken);
    },

    async listPairTokens(pairingId: string, limit: number) {
      if (isDemoPairing(cfg, pairingId)) return state.devices.slice(0, limit);
      return useReal('listPairTokens', pairingId, limit);
    },

    async deletePairTokensByDevice(pairingId: string, deviceId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        const before = state.devices.length;
        state.devices = state.devices.filter((d) => d.deviceId !== deviceId || d.deviceId === 'demo-pwa');
        return { deleted: Math.max(0, before - state.devices.length) };
      }
      return useReal('deletePairTokensByDevice', pairingId, deviceId);
    },

    async upsertPushSubscription(pairingId: string, deviceId: string, subscription: any) {
      if (isDemoPairing(cfg, pairingId)) {
        state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.deviceId !== deviceId);
        state.pushSubscriptions.push({ deviceId, subscription });
        return;
      }
      return useReal('upsertPushSubscription', pairingId, deviceId, subscription);
    },

    async listPushSubscriptions(pairingId: string) {
      if (isDemoPairing(cfg, pairingId)) return state.pushSubscriptions;
      return useReal('listPushSubscriptions', pairingId);
    },

    async deletePushSubscription(pairingId: string, deviceId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.deviceId !== deviceId);
        return;
      }
      return useReal('deletePushSubscription', pairingId, deviceId);
    },

    async replaceContactsForGateway(gatewayDeviceId: string, contacts: Array<{ number: string; name: string }>) {
      if (isDemoGateway(cfg, gatewayDeviceId)) {
        state.contacts = [];
        for (const c of contacts) addOrUpdateContact(gatewayDeviceId, c.number, c.name);
        return;
      }
      return useReal('replaceContactsForGateway', gatewayDeviceId, contacts);
    },

    async listContacts(gatewayDeviceId: string, limit: number) {
      if (isDemoGateway(cfg, gatewayDeviceId)) {
        return [...state.contacts]
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .slice(0, limit)
          .map(({ displayName, rawNumber, norm }) => ({ displayName, rawNumber, norm }));
      }
      return useReal('listContacts', gatewayDeviceId, limit);
    },

    async searchContacts(gatewayDeviceId: string, query: string, limit: number) {
      if (isDemoGateway(cfg, gatewayDeviceId)) {
        const q = String(query ?? '').trim().toLowerCase();
        return state.contacts
          .filter((c) => {
            if (!q) return true;
            return (
              c.displayName.toLowerCase().includes(q) ||
              (c.rawNumber ?? '').toLowerCase().includes(q) ||
              c.norm.toLowerCase().includes(q)
            );
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .slice(0, limit)
          .map(({ displayName, rawNumber, norm }) => ({ displayName, rawNumber, norm }));
      }
      return useReal('searchContacts', gatewayDeviceId, query, limit);
    },

    async lookupContactName(gatewayDeviceId: string, numberRaw: string) {
      if (isDemoGateway(cfg, gatewayDeviceId)) return contactName(numberRaw);
      return useReal('lookupContactName', gatewayDeviceId, numberRaw);
    },

    async listConversations(pairingId: string, limit: number): Promise<ConversationRow[]> {
      if (isDemoPairing(cfg, pairingId)) {
        const latest = new Map<string, MessageRow>();
        for (const msg of state.messages) {
          const thread = msg.threadId || threadIdFor(msg.peer);
          const cur = latest.get(thread);
          if (!cur || msg.ts > cur.ts) latest.set(thread, msg);
        }
        return [...latest.values()]
          .sort((a, b) => b.ts - a.ts)
          .slice(0, limit)
          .map((msg) => ({
            threadId: msg.threadId || threadIdFor(msg.peer),
            peer: msg.peer,
            peerName: msg.peerName ?? contactName(msg.peer),
            lastTs: msg.ts,
            lastPreview: safePreview(msg.body, msg.bodyIsEncrypted),
            lastBodyIsEncrypted: msg.bodyIsEncrypted,
            unreadCount: msg.direction === 'in' ? 1 : 0,
          }));
      }
      return useReal('listConversations', pairingId, limit);
    },

    async resolvePeerByThreadId(pairingId: string, threadId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        const msg = [...state.messages]
          .reverse()
          .find((m) => (m.threadId || threadIdFor(m.peer)) === threadId || m.peer === threadId);
        if (!msg) return null;
        return { peer: msg.peer, peerName: msg.peerName ?? contactName(msg.peer) };
      }
      return useReal('resolvePeerByThreadId', pairingId, threadId);
    },

    async insertMessage(input: {
      id: string;
      pairingId: string | null;
      gatewayDeviceId: string;
      peer: string;
      peerNorm: string | null;
      peerTail: string | null;
      direction: MessageDirection;
      body: string;
      bodyIsEncrypted: boolean;
      ts: number;
      status: MessageStatus;
      deliveredAt: number | null;
      createdBy: MessageCreatedBy;
      simSlotIndex: number | null;
      subscriptionId: number | null;
    }) {
      if (isDemoPairing(cfg, input.pairingId) || isDemoGateway(cfg, input.gatewayDeviceId)) {
        pushDemoMessage(
          buildMessage({
            id: input.id,
            peer: input.peer,
            direction: input.direction,
            body: input.body,
            ts: input.ts,
            status: input.status,
            deliveredAt: input.deliveredAt,
            createdBy: input.createdBy,
            simSlotIndex: input.simSlotIndex,
            subscriptionId: input.subscriptionId,
          })
        );
        return;
      }
      return useReal('insertMessage', input);
    },

    async tryInsertMessage(input: Parameters<Repo['insertMessage']>[0]) {
      if (isDemoPairing(cfg, input.pairingId) || isDemoGateway(cfg, input.gatewayDeviceId)) {
        const exists = state.messages.some((m) => m.id === input.id);
        if (!exists) await repo.insertMessage(input);
        return { inserted: !exists };
      }
      return useReal('tryInsertMessage', input);
    },

    async listMessages(pairingId: string, threadIdOrPeer: string, limit: number): Promise<MessageRow[]> {
      if (isDemoPairing(cfg, pairingId)) {
        const thread = threadIdOrPeer;
        return state.messages
          .filter((m) => {
            const tid = m.threadId || threadIdFor(m.peer);
            const { norm, tail } = normalizePhone(m.peer);
            return tid === thread || m.peer === thread || norm === thread || tail === thread;
          })
          .sort((a, b) => a.ts - b.ts)
          .slice(-limit)
          .map((m) => ({ ...m, peerName: m.peerName ?? contactName(m.peer) }));
      }
      return useReal('listMessages', pairingId, threadIdOrPeer, limit);
    },

    async getMessageMeta(id: string) {
      const msg = state.messages.find((m) => m.id === id);
      if (msg) return { pairingId: cfg.pairingId, peer: msg.peer, gatewayDeviceId: cfg.gatewayDeviceId };
      if (!realRepo) return null;
      return realRepo.getMessageMeta(id);
    },

    async getTelegramSession(chatId: string) {
      if (realRepo) return realRepo.getTelegramSession(chatId);
      return (
        state.telegramSessions.get(chatId) ?? {
          chatId,
          gatewayDeviceId: null,
          lastPeer: null,
          lastThreadId: null,
          defaultSimSlotIndex: null,
        }
      );
    },

    async setTelegramSession(session: TelegramSession) {
      if (realRepo) return realRepo.setTelegramSession(session);
      state.telegramSessions.set(session.chatId, session);
    },

    async enqueueOutboundMessage(input: {
      id: string;
      pairingId: string;
      gatewayDeviceId: string;
      peer: string;
      peerNorm: string | null;
      peerTail: string | null;
      body: string;
      bodyIsEncrypted: boolean;
      ts: number;
      createdBy: MessageCreatedBy;
      simSlotIndex: number | null;
      subscriptionId: number | null;
    }) {
      if (isDemoPairing(cfg, input.pairingId) || isDemoGateway(cfg, input.gatewayDeviceId)) {
        pushDemoMessage(
          buildMessage({
            id: input.id,
            peer: input.peer,
            direction: 'out',
            body: input.body,
            ts: input.ts,
            status: 'sent',
            deliveredAt: input.ts + 900,
            createdBy: input.createdBy,
            simSlotIndex: input.simSlotIndex,
            subscriptionId: input.subscriptionId,
          })
        );

        pushDemoMessage(
          buildMessage({
            peer: input.peer,
            direction: 'in',
            body: `Demo auto-reply: received "${input.body.slice(0, 70)}".`,
            ts: input.ts + 1_500,
            status: 'received',
            createdBy: 'android',
          })
        );
        return;
      }
      return useReal('enqueueOutboundMessage', input);
    },

    async claimOutbox(gatewayDeviceId: string, limit: number, claimTtlMs: number): Promise<OutboxItem[]> {
      if (isDemoGateway(cfg, gatewayDeviceId)) return [];
      return useReal('claimOutbox', gatewayDeviceId, limit, claimTtlMs);
    },

    async updateOutboxStatus(id: string, status: 'sent' | 'failed') {
      const msg = state.messages.find((m) => m.id === id);
      if (msg) {
        msg.status = status;
        if (status === 'sent') msg.deliveredAt = Date.now();
        return;
      }
      return useReal('updateOutboxStatus', id, status);
    },

    async markDelivered(id: string, deliveredAtMs: number) {
      const msg = state.messages.find((m) => m.id === id);
      if (msg) {
        msg.status = 'sent';
        msg.deliveredAt = deliveredAtMs;
        return;
      }
      return useReal('markDelivered', id, deliveredAtMs);
    },

    normalizePhone,
  } satisfies Repo;

  return repo;
}
