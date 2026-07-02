import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type {
  BlockedChatRow,
  ContactRow,
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
  TelegramChatSubscription,
  TelegramPairingSettings,
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
  source?: 'android' | 'web';
  nameLocked?: boolean;
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
  readAtByThread: Map<string, number>;
  pushSubscriptions: Array<{ deviceId: string; subscription: any }>;
  telegramSessions: Map<string, TelegramSession>;
  telegramPairingSettings: Map<string, TelegramPairingSettings>;
  telegramLinkCodes: Map<string, { pairingId: string; expiresAt: number }>;
  telegramSubscriptions: TelegramChatSubscription[];
  blockedChats: Map<string, { peer: string; note: string | null; blockedAt: number }>;
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
    { name: 'Emma Carter', number: '+14155550132' },
    { name: 'Michael Brooks', number: '+12125550184' },
    { name: 'Olivia Martin', number: '+13105550191' },
    { name: 'Sarah Johnson', number: '+16175550145' },
    { name: 'Mert Yilmaz', number: '+905325551010' },
    { name: 'Ayse Demir', number: '+905555551121' },
    { name: 'Emirates Travel Desk', number: '+971555012034' },
    { name: 'Dubai Hotel Concierge', number: '+97144550144' },
    { name: 'London Visa Center', number: '+442071838750' },
    { name: 'Berlin Car Service', number: '+493055501209' },
    { name: 'Demo OTP Service', number: '+18885550100' },
    { name: 'AT Gateway Support', number: '+18005550199' },
  ];

  const contacts = contactsRaw.map((c) => {
    const { norm, tail } = normalizePhone(c.number);
    return {
      displayName: c.name,
      rawNumber: c.number,
      norm,
      tail,
      source: 'android' as const,
      nameLocked: false,
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

  const messages = [
    // Active recent sales / presentation-style chat. 3 unread incoming messages.
    m('+14155550132', 'in', 'Morning! Are you still good to show the SMS gateway demo at 2?', 72),
    m('+14155550132', 'out', 'Yes. I have the demo mode ready, so we will not need the Android phone connected.', 70),
    m('+14155550132', 'in', 'Great. Can you start with the pairing screen and then open the seeded chats?', 65),
    m('+14155550132', 'out', 'Exactly. I will use the 000000 code, show the contacts, then send a sample SMS.', 60),
    m('+14155550132', 'in', 'Perfect. Please also mention that /api and the web app are on the same Vercel URL.', 24),
    m('+14155550132', 'in', 'One more thing: keep the fake replies visible so the flow feels live.', 18),
    m('+14155550132', 'in', 'Thanks — this will make the presentation much easier.', 12),

    // Turkish chat. 2 unread messages.
    m('+905325551010', 'in', 'Merhaba Amir, Istanbul hotel transfer details came through.', 310),
    m('+905325551010', 'out', 'Thanks Mert. Is pickup still from Gate 8?', 304),
    m('+905325551010', 'in', 'Yes, Gate 8. The driver will hold a sign with your name.', 298),
    m('+905325551010', 'out', 'Perfect. Please send the driver number when it is assigned.', 290),
    m('+905325551010', 'in', 'Driver: Deniz, +90 532 555 44 82.', 36),
    m('+905325551010', 'in', 'He will arrive 10 minutes early.', 28),

    // UAE travel/service chat. 4 unread messages.
    m('+971555012034', 'in', 'Hello Amir, your Dubai itinerary has been updated.', 1_080),
    m('+971555012034', 'out', 'Thanks. Did the airport pickup time change?', 1_064),
    m('+971555012034', 'in', 'Yes, pickup is now 7:15 PM local time.', 1_030),
    m('+971555012034', 'out', 'Got it. Please keep the same hotel drop-off.', 1_020),
    m('+971555012034', 'in', 'Confirmed. Hotel drop-off remains the same.', 52),
    m('+971555012034', 'in', 'Your voucher number is UAE-48219.', 48),
    m('+971555012034', 'in', 'The driver will message you after landing.', 46),
    m('+971555012034', 'in', 'Reply HELP if you need support during the trip.', 41),

    // American personal chat. Read conversation.
    m('+12125550184', 'in', 'Hey, quick question: did you deploy the latest frontend build?', 1_520),
    m('+12125550184', 'out', 'Yes, pushed it last night. The Vercel preview is already live.', 1_512),
    m('+12125550184', 'in', 'Nice. The chat list feels smoother now.', 1_500),
    m('+12125550184', 'out', 'I also fixed the same-domain API setup under /api.', 1_492),
    m('+12125550184', 'in', 'That is exactly what we needed.', 1_480),

    // Longer support chat. 1 unread message.
    m('+18005550199', 'in', 'AT Gateway Support: your demo workspace is active.', 2_160),
    m('+18005550199', 'out', 'Great. Can I present without setting up Postgres?', 2_150),
    m('+18005550199', 'in', 'Yes. Demo mode uses seeded in-memory conversations when the code is 000000.', 2_140),
    m('+18005550199', 'out', 'And the frontend still calls the backend on the same URL?', 2_132),
    m('+18005550199', 'in', 'Correct. Use /api for backend requests and the rest of the URL for the web app.', 2_122),
    m('+18005550199', 'in', 'We also added multiple unread counts so the inbox looks realistic.', 33),

    // OTP/business chat. Read conversation.
    m('+18885550100', 'in', 'Your demo verification code is 000000. Do not share it outside the presentation.', 2_940),
    m('+18885550100', 'out', 'Received. I will use it only for demo mode.', 2_930),
    m('+18885550100', 'in', 'Demo contacts and fake SMS messages are ready.', 2_920),

    // UAE hotel concierge. Read conversation with recent outgoing last message.
    m('+97144550144', 'in', 'Good evening. Your room is confirmed for early check-in.', 4_320),
    m('+97144550144', 'out', 'Thank you. Could you also arrange a quiet room if available?', 4_300),
    m('+97144550144', 'in', 'Of course. We added a quiet-room request to your booking.', 4_280),
    m('+97144550144', 'out', 'Appreciate it. I will arrive around 9:30 AM.', 4_260),

    // Turkish normal life chat. 2 unread messages.
    m('+905555551121', 'in', 'Selam, I booked the table for Saturday night.', 5_500),
    m('+905555551121', 'out', 'Great, what time?', 5_480),
    m('+905555551121', 'in', '8:30 PM. The place is near Karakoy.', 5_460),
    m('+905555551121', 'out', 'Sounds good. Send the location when you can.', 5_455),
    m('+905555551121', 'in', 'Sending it now.', 95),
    m('+905555551121', 'in', 'Also, parking is easier on the side street.', 88),

    // London Visa Center. Read conversation.
    m('+442071838750', 'in', 'Your appointment reminder: Wednesday at 10:20 AM.', 6_420),
    m('+442071838750', 'out', 'Thanks. Do I need to bring printed hotel confirmations?', 6_400),
    m('+442071838750', 'in', 'Printed copies are recommended, but digital copies are accepted.', 6_380),

    // Berlin car service. 1 unread message.
    m('+493055501209', 'in', 'Hallo Amir, your car is scheduled for 6:40 tomorrow morning.', 7_200),
    m('+493055501209', 'out', 'Thanks. Please make sure there is space for two bags.', 7_180),
    m('+493055501209', 'in', 'No problem. The driver will bring a wagon car.', 74),

    // California contact. Read and friendly.
    m('+13105550191', 'in', 'Lunch tomorrow?', 8_200),
    m('+13105550191', 'out', 'Works for me. Around 12:30?', 8_180),
    m('+13105550191', 'in', '12:30 is perfect. Same place as last time.', 8_160),
    m('+13105550191', 'out', 'Done. I added it to my calendar.', 8_150),

    // Boston contact. Unread 1.
    m('+16175550145', 'in', 'Can you review the tiny layout issue on mobile?', 11_000),
    m('+16175550145', 'out', 'Sure, send me a screenshot when you have it.', 10_980),
    m('+16175550145', 'in', 'Sent it. It happens only on narrow screens.', 21),
  ].sort((a, b) => a.ts - b.ts);

  const readAtByThread = new Map<string, number>();
  const unreadSeeds: Record<string, number> = {
    [threadIdFor('+14155550132')]: 3,
    [threadIdFor('+905325551010')]: 2,
    [threadIdFor('+971555012034')]: 4,
    [threadIdFor('+18005550199')]: 1,
    [threadIdFor('+905555551121')]: 2,
    [threadIdFor('+493055501209')]: 1,
    [threadIdFor('+16175550145')]: 1,
  };

  const threads = new Map<string, MessageRow[]>();
  for (const msg of messages) {
    const thread = msg.threadId || threadIdFor(msg.peer);
    const list = threads.get(thread) ?? [];
    list.push(msg);
    threads.set(thread, list);
  }

  for (const [thread, list] of threads) {
    const unreadCount = unreadSeeds[thread] ?? 0;
    const incoming = list.filter((msg) => msg.direction === 'in');
    const unreadIncoming = unreadCount > 0 ? incoming.slice(-unreadCount) : [];
    const firstUnreadAt = unreadIncoming[0]?.ts ?? null;
    const lastMessageAt = list[list.length - 1]?.ts ?? now;
    readAtByThread.set(thread, firstUnreadAt ? firstUnreadAt - 1 : lastMessageAt + 1);
  }

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
    messages,
    readAtByThread,
    pushSubscriptions: [],
    telegramSessions: new Map(),
    telegramPairingSettings: new Map(),
    telegramLinkCodes: new Map(),
    telegramSubscriptions: [],
    blockedChats: new Map(),
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

  const mapDemoContact = (c: DemoContact): ContactRow => ({
    displayName: c.displayName,
    rawNumber: c.rawNumber,
    norm: c.norm,
    source: c.source === 'web' ? 'web' : 'android',
    nameLocked: c.nameLocked === true,
  });

  const addOrUpdateContact = (
    gatewayDeviceId: string,
    number: string,
    name: string,
    opts?: { source?: 'android' | 'web'; nameLocked?: boolean }
  ) => {
    if (!isDemoGateway(cfg, gatewayDeviceId)) return false;
    const { norm, tail } = normalizePhone(number);
    if (!norm) return true;
    const existing = state.contacts.find((c) => c.norm === norm);
    if (existing) {
      if (!existing.nameLocked || opts?.nameLocked) existing.displayName = name;
      existing.rawNumber = number;
      existing.tail = tail;
      if (opts?.source) existing.source = opts.source;
      if (typeof opts?.nameLocked === 'boolean') existing.nameLocked = opts.nameLocked;
    } else {
      state.contacts.push({
        displayName: name,
        rawNumber: number,
        norm,
        tail,
        source: opts?.source ?? 'android',
        nameLocked: opts?.nameLocked ?? false,
      });
    }
    return true;
  };

  const blockedKey = (peerOrThreadId: string) => threadIdFor(peerOrThreadId);

  const isDemoThreadBlocked = (peerOrThreadId: string) => {
    const key = blockedKey(peerOrThreadId);
    const { norm, tail } = normalizePhone(peerOrThreadId);
    return (
      state.blockedChats.has(key) ||
      state.blockedChats.has(peerOrThreadId) ||
      Boolean(norm && state.blockedChats.has(norm)) ||
      Boolean(tail && state.blockedChats.has(tail))
    );
  };

  const pushDemoMessage = (message: MessageRow) => {
    const peerName = message.peerName ?? contactName(message.peer);
    state.messages.push({ ...message, peerName });
    state.messages.sort((a, b) => a.ts - b.ts);
  };

  const messageMatchesThread = (message: MessageRow, threadIdOrPeer: string) => {
    const tid = message.threadId || threadIdFor(message.peer);
    const { norm, tail } = normalizePhone(message.peer);
    return tid === threadIdOrPeer || message.peer === threadIdOrPeer || norm === threadIdOrPeer || tail === threadIdOrPeer;
  };

  const unreadCountForThread = (threadId: string) => {
    const readAt = state.readAtByThread.get(threadId) ?? 0;
    return state.messages.filter((m) => (m.threadId || threadIdFor(m.peer)) === threadId && m.direction === 'in' && m.ts > readAt).length;
  };

  const markDemoThreadRead = (threadIdOrPeer: string) => {
    const messages = state.messages.filter((m) => messageMatchesThread(m, threadIdOrPeer));
    if (!messages.length) return;
    const thread = messages[messages.length - 1].threadId || threadIdFor(messages[messages.length - 1].peer);
    const latestTs = Math.max(...messages.map((m) => m.ts));
    state.readAtByThread.set(thread, Math.max(Date.now() + 10_000, latestTs + 1));
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
        state.contacts = state.contacts.filter((c) => c.source === 'web' || c.nameLocked);
        for (const c of contacts) addOrUpdateContact(gatewayDeviceId, c.number, c.name, { source: 'android', nameLocked: false });
        return;
      }
      return useReal('replaceContactsForGateway', gatewayDeviceId, contacts);
    },

    async upsertContactForGateway(gatewayDeviceId: string, contact: { number: string; displayName: string }) {
      if (isDemoGateway(cfg, gatewayDeviceId)) {
        const ok = addOrUpdateContact(gatewayDeviceId, contact.number, contact.displayName, {
          source: 'web',
          nameLocked: true,
        });
        if (!ok) return useReal('upsertContactForGateway', gatewayDeviceId, contact);
        const { norm } = normalizePhone(contact.number);
        const saved = state.contacts.find((c) => c.norm === norm);
        if (!saved) throw new Error('Contact name and a valid phone number are required.');
        return mapDemoContact(saved);
      }
      return useReal('upsertContactForGateway', gatewayDeviceId, contact);
    },

    async listContacts(gatewayDeviceId: string, limit: number) {
      if (isDemoGateway(cfg, gatewayDeviceId)) {
        return [...state.contacts]
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
          .slice(0, limit)
          .map(mapDemoContact);
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
          .map(mapDemoContact);
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
            peerName: contactName(msg.peer) ?? msg.peerName,
            lastTs: msg.ts,
            lastPreview: safePreview(msg.body, msg.bodyIsEncrypted),
            lastBodyIsEncrypted: msg.bodyIsEncrypted,
            unreadCount: unreadCountForThread(msg.threadId || threadIdFor(msg.peer)),
            blocked: isDemoThreadBlocked(msg.threadId || threadIdFor(msg.peer)),
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
        return { peer: msg.peer, peerName: contactName(msg.peer) ?? msg.peerName };
      }
      return useReal('resolvePeerByThreadId', pairingId, threadId);
    },

    async markThreadRead(pairingId: string, threadId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        markDemoThreadRead(threadId);
        return { ok: true as const };
      }
      return useReal('markThreadRead', pairingId, threadId);
    },

    async listBlockedChats(pairingId: string): Promise<BlockedChatRow[]> {
      if (isDemoPairing(cfg, pairingId)) {
        return [...state.blockedChats.entries()]
          .map(([threadId, row]) => ({
            threadId,
            peer: row.peer,
            peerName: contactName(row.peer),
            note: row.note,
            blockedAt: row.blockedAt,
          }))
          .sort((a, b) => b.blockedAt - a.blockedAt);
      }
      return useReal('listBlockedChats', pairingId);
    },

    async isThreadBlocked(pairingId: string, peerOrThreadId: string) {
      if (isDemoPairing(cfg, pairingId)) return isDemoThreadBlocked(peerOrThreadId);
      return useReal('isThreadBlocked', pairingId, peerOrThreadId);
    },

    async blockThread(input: { pairingId: string; threadId: string; peer?: string | null; note?: string | null }) {
      if (isDemoPairing(cfg, input.pairingId)) {
        const resolved = await repo.resolvePeerByThreadId(input.pairingId, input.threadId);
        const peer = resolved?.peer ?? input.peer ?? input.threadId;
        const key = blockedKey(peer || input.threadId);
        const blockedAt = Date.now();
        const note = input.note ? String(input.note).trim().slice(0, 300) : null;
        state.blockedChats.set(key, { peer, note, blockedAt });
        return {
          threadId: key,
          peer,
          peerName: contactName(peer),
          note,
          blockedAt,
        };
      }
      return useReal('blockThread', input);
    },

    async unblockThread(pairingId: string, threadId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        const keys = new Set([threadId, blockedKey(threadId)]);
        const { norm, tail } = normalizePhone(threadId);
        if (norm) keys.add(norm);
        if (tail) keys.add(tail);
        let deleted = 0;
        for (const key of keys) {
          if (state.blockedChats.delete(key)) deleted += 1;
        }
        return { deleted };
      }
      return useReal('unblockThread', pairingId, threadId);
    },

    async deleteThread(pairingId: string, threadId: string) {
      if (isDemoPairing(cfg, pairingId)) {
        const before = state.messages.length;
        const deleted = state.messages.filter((m) => messageMatchesThread(m, threadId));
        state.messages = state.messages.filter((m) => !messageMatchesThread(m, threadId));
        for (const msg of deleted) state.readAtByThread.delete(msg.threadId || threadIdFor(msg.peer));
        return { deletedMessages: before - state.messages.length, deletedConversations: deleted.length ? 1 : 0 };
      }
      return useReal('deleteThread', pairingId, threadId);
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
        if (input.pairingId && isDemoThreadBlocked(input.peer)) return { inserted: false };
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
          .filter((m) => messageMatchesThread(m, thread))
          .sort((a, b) => a.ts - b.ts)
          .slice(-limit)
          .map((m) => ({ ...m, peerName: contactName(m.peer) ?? m.peerName }));
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

    async getTelegramPairingSettings(pairingId: string) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.getTelegramPairingSettings(pairingId);
      return (
        state.telegramPairingSettings.get(pairingId) ?? {
          pairingId,
          alertsEnabled: true,
          updatedAt: null,
        }
      );
    },

    async setTelegramPairingSettings(pairingId: string, alertsEnabled: boolean) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.setTelegramPairingSettings(pairingId, alertsEnabled);
      const settings = { pairingId, alertsEnabled, updatedAt: Date.now() };
      state.telegramPairingSettings.set(pairingId, settings);
      return settings;
    },

    async createTelegramLinkCode(pairingId: string, code: string, ttlMs: number) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.createTelegramLinkCode(pairingId, code, ttlMs);
      const expiresAt = Date.now() + ttlMs;
      state.telegramLinkCodes.set(code, { pairingId, expiresAt });
      return { code, expiresAt };
    },

    async consumeTelegramLinkCode(code: string) {
      const hit = state.telegramLinkCodes.get(code);
      if (hit) {
        state.telegramLinkCodes.delete(code);
        if (hit.expiresAt < Date.now()) return { ok: false as const, reason: 'expired' as const };
        return { ok: true as const, pairingId: hit.pairingId };
      }
      if (realRepo) return realRepo.consumeTelegramLinkCode(code);
      return { ok: false as const, reason: 'invalid' as const };
    },

    async upsertTelegramSubscription(input: {
      pairingId: string;
      chatId: string;
      chatType?: string | null;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      enabled?: boolean;
    }) {
      if (realRepo && !isDemoPairing(cfg, input.pairingId)) return realRepo.upsertTelegramSubscription(input);
      const now = Date.now();
      const existing = state.telegramSubscriptions.find(
        (s) => s.pairingId === input.pairingId && s.chatId === input.chatId
      );
      if (existing) {
        existing.chatType = input.chatType ?? null;
        existing.username = input.username ?? null;
        existing.firstName = input.firstName ?? null;
        existing.lastName = input.lastName ?? null;
        if (typeof input.enabled === 'boolean') existing.enabled = input.enabled;
        existing.updatedAt = now;
        return;
      }
      state.telegramSubscriptions.unshift({
        pairingId: input.pairingId,
        gatewayDeviceId: cfg.gatewayDeviceId,
        chatId: input.chatId,
        chatType: input.chatType ?? null,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        enabled: input.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      });
    },

    async listTelegramSubscriptions(pairingId: string) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.listTelegramSubscriptions(pairingId);
      return state.telegramSubscriptions.filter((s) => s.pairingId === pairingId);
    },

    async listTelegramSubscriptionsForChat(chatId: string) {
      const demoRows = state.telegramSubscriptions.filter((s) => s.chatId === chatId);
      if (demoRows.length || !realRepo) return demoRows;
      return realRepo.listTelegramSubscriptionsForChat(chatId);
    },

    async setTelegramSubscriptionEnabled(pairingId: string, chatId: string, enabled: boolean) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.setTelegramSubscriptionEnabled(pairingId, chatId, enabled);
      const sub = state.telegramSubscriptions.find((s) => s.pairingId === pairingId && s.chatId === chatId);
      if (sub) {
        sub.enabled = enabled;
        sub.updatedAt = Date.now();
      }
    },

    async deleteTelegramSubscription(pairingId: string, chatId: string) {
      if (realRepo && !isDemoPairing(cfg, pairingId)) return realRepo.deleteTelegramSubscription(pairingId, chatId);
      state.telegramSubscriptions = state.telegramSubscriptions.filter(
        (s) => !(s.pairingId === pairingId && s.chatId === chatId)
      );
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
