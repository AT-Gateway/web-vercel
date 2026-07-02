import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { normalizePhone, safePreview } from '../utils/phone';

export type DeviceType = 'pwa' | 'telegram' | 'android' | 'other';
export type MessageDirection = 'in' | 'out';
export type MessageStatus = 'received' | 'queued' | 'sent' | 'failed';
export type MessageCreatedBy = 'android' | 'pwa' | 'telegram';

export type PairAuth = {
  pairToken: string;
  pairingId: string;
  gatewayDeviceId: string;
  gatewayPubSpkiB64: string;
  deviceId: string;
  deviceType: string;
  deviceLabel: string | null;
  createdAt: number;
  lastSeenAt: number | null;
};

export type PairingRow = {
  id: string;
  gatewayDeviceId: string;
  gatewayPubSpkiB64: string;
  createdAt: number;
};

export type JoinCodeRow = {
  code: string;
  pairingId: string;
  gatewayDeviceId: string;
  gatewayPubSpkiB64: string;
  createdAt: number;
  expiresAt: number;
  createdByToken: string | null;
};

export type ConversationRow = {
  /**
   * Stable thread identifier used by clients.
   *
   * We intentionally prefer `peer_tail` (last 8 digits) when available, so
   * different formats of the same phone (e.g. `0912...` vs `+98912...`) are
   * treated as one thread.
   */
  threadId: string;
  peer: string;
  peerName: string | null;
  lastTs: number;
  lastPreview: string;
  lastBodyIsEncrypted: 0 | 1;
  unreadCount: number;
  blocked: boolean;
};

export type ContactRow = {
  displayName: string;
  rawNumber: string | null;
  norm: string;
  source: 'android' | 'web';
  nameLocked: boolean;
};

export type BlockedChatRow = {
  threadId: string;
  peer: string;
  peerName: string | null;
  note: string | null;
  blockedAt: number;
};

export type MessageRow = {
  id: string;
  threadId: string;
  peer: string;
  peerName: string | null;
  direction: MessageDirection;
  body: string;
  bodyIsEncrypted: 0 | 1;
  ts: number;
  status: MessageStatus;
  deliveredAt: number | null;
  simSlotIndex: number | null;
  subscriptionId: number | null;
  createdBy: MessageCreatedBy;
};

export type OutboxItem = {
  id: string;
  pairingId: string | null;
  peer: string;
  body: string;
  bodyIsEncrypted: 0 | 1;
  ts: number;
  simSlotIndex: number | null;
  subscriptionId: number | null;
};

export type TelegramSession = {
  chatId: string;
  gatewayDeviceId: string | null;
  lastPeer: string | null;
  lastThreadId: string | null;
  defaultSimSlotIndex: number | null;
};

export type TelegramChatSubscription = {
  pairingId: string;
  gatewayDeviceId: string;
  chatId: string;
  chatType: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TelegramPairingSettings = {
  pairingId: string;
  alertsEnabled: boolean;
  updatedAt: number | null;
};

function threadIdFromParts(peer: string, norm?: string | null, tail?: string | null) {
  return tail || norm || peer;
}

function normalizePeerForThread(peer: string) {
  const trimmed = String(peer ?? '').trim();
  const { norm, tail } = normalizePhone(trimmed);
  return {
    peer: trimmed,
    norm: norm || null,
    tail: tail || null,
    threadId: threadIdFromParts(trimmed, norm || null, tail || null),
  };
}

export function createRepo(pool: Pool) {
  // ---------------- gateway devices ----------------
  async function upsertGatewayDevice(gatewayDeviceId: string) {
    await pool.query(
      `
      INSERT INTO gateway_devices(id, last_seen_at)
      VALUES ($1, now())
      ON CONFLICT (id) DO UPDATE SET last_seen_at = now();
      `,
      [gatewayDeviceId]
    );
  }

  async function listGatewayDevices(limit = 20): Promise<{ id: string; lastSeenAt: number | null }[]> {
    const r = await pool.query(
      `
      SELECT id, EXTRACT(EPOCH FROM last_seen_at) * 1000 AS last_seen_at_ms
      FROM gateway_devices
      ORDER BY COALESCE(last_seen_at, created_at) DESC
      LIMIT $1
      `,
      [limit]
    );
    return r.rows.map((row: any) => ({
      id: String(row.id),
      lastSeenAt: row.last_seen_at_ms ? Number(row.last_seen_at_ms) : null,
    }));
  }

  async function gatewayDeviceExists(gatewayDeviceId: string): Promise<boolean> {
    const r = await pool.query('SELECT 1 FROM gateway_devices WHERE id = $1 LIMIT 1', [gatewayDeviceId]);
    return (r.rowCount ?? 0) > 0;
  }

  // ---------------- telegram sessions ----------------

  async function getTelegramSession(chatId: string): Promise<TelegramSession> {
    const r = await pool.query(
      `
      SELECT chat_id, gateway_device_id, last_peer, last_thread_id, default_sim_slot_index
      FROM telegram_sessions
      WHERE chat_id = $1
      `,
      [chatId]
    );
    const row = r.rows[0] as any;
    if (!row) {
      return {
        chatId,
        gatewayDeviceId: null,
        lastPeer: null,
        lastThreadId: null,
        defaultSimSlotIndex: null,
      };
    }
    return {
      chatId: String(row.chat_id),
      gatewayDeviceId: row.gateway_device_id ? String(row.gateway_device_id) : null,
      lastPeer: row.last_peer ? String(row.last_peer) : null,
      lastThreadId: row.last_thread_id ? String(row.last_thread_id) : null,
      defaultSimSlotIndex:
        row.default_sim_slot_index === 0 || row.default_sim_slot_index === 1
          ? Number(row.default_sim_slot_index)
          : null,
    };
  }

  async function setTelegramSession(session: TelegramSession) {
    await pool.query(
      `
      INSERT INTO telegram_sessions(chat_id, gateway_device_id, last_peer, last_thread_id, default_sim_slot_index, updated_at)
      VALUES ($1,$2,$3,$4,$5, now())
      ON CONFLICT (chat_id) DO UPDATE SET
        gateway_device_id = EXCLUDED.gateway_device_id,
        last_peer = EXCLUDED.last_peer,
        last_thread_id = EXCLUDED.last_thread_id,
        default_sim_slot_index = EXCLUDED.default_sim_slot_index,
        updated_at = now();
      `,
      [
        session.chatId,
        session.gatewayDeviceId,
        session.lastPeer,
        session.lastThreadId,
        session.defaultSimSlotIndex,
      ]
    );
  }

  async function getTelegramPairingSettings(pairingId: string): Promise<TelegramPairingSettings> {
    const r = await pool.query(
      `
      SELECT pairing_id, alerts_enabled, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      FROM telegram_pairing_settings
      WHERE pairing_id = $1
      `,
      [pairingId]
    );
    const row = r.rows[0] as any;
    if (!row) return { pairingId, alertsEnabled: true, updatedAt: null };
    return {
      pairingId: String(row.pairing_id),
      alertsEnabled: row.alerts_enabled !== false,
      updatedAt: row.updated_at_ms ? Number(row.updated_at_ms) : null,
    };
  }

  async function setTelegramPairingSettings(pairingId: string, alertsEnabled: boolean): Promise<TelegramPairingSettings> {
    const r = await pool.query(
      `
      INSERT INTO telegram_pairing_settings(pairing_id, alerts_enabled, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (pairing_id) DO UPDATE SET
        alerts_enabled = EXCLUDED.alerts_enabled,
        updated_at = now()
      RETURNING pairing_id, alerts_enabled, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
      `,
      [pairingId, alertsEnabled]
    );
    const row = r.rows[0] as any;
    return {
      pairingId: String(row.pairing_id),
      alertsEnabled: row.alerts_enabled !== false,
      updatedAt: row.updated_at_ms ? Number(row.updated_at_ms) : null,
    };
  }

  async function createTelegramLinkCode(pairingId: string, code: string, ttlMs: number): Promise<{ code: string; expiresAt: number }> {
    const expiresAtDate = new Date(Date.now() + ttlMs);
    await pool.query('DELETE FROM telegram_link_codes WHERE expires_at < now()');
    await pool.query(
      `
      INSERT INTO telegram_link_codes(code, pairing_id, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (code) DO UPDATE SET
        pairing_id = EXCLUDED.pairing_id,
        created_at = now(),
        expires_at = EXCLUDED.expires_at
      `,
      [code, pairingId, expiresAtDate]
    );
    return { code, expiresAt: expiresAtDate.getTime() };
  }

  async function consumeTelegramLinkCode(code: string): Promise<
    | { ok: true; pairingId: string }
    | { ok: false; reason: 'invalid' | 'expired' }
  > {
    const r = await pool.query(
      `
      DELETE FROM telegram_link_codes
      WHERE code = $1
      RETURNING pairing_id, EXTRACT(EPOCH FROM expires_at) * 1000 AS expires_at_ms
      `,
      [code]
    );
    const row = r.rows[0] as any;
    if (!row) return { ok: false, reason: 'invalid' };
    const expiresAt = Number(row.expires_at_ms);
    if (expiresAt < Date.now()) return { ok: false, reason: 'expired' };
    return { ok: true, pairingId: String(row.pairing_id) };
  }

  async function upsertTelegramSubscription(input: {
    pairingId: string;
    chatId: string;
    chatType?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    enabled?: boolean;
  }) {
    await pool.query(
      `
      INSERT INTO telegram_chat_subscriptions(
        pairing_id, chat_id, chat_type, username, first_name, last_name, enabled, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true), now())
      ON CONFLICT (pairing_id, chat_id) DO UPDATE SET
        chat_type = EXCLUDED.chat_type,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        enabled = COALESCE($7, telegram_chat_subscriptions.enabled, true),
        updated_at = now()
      `,
      [
        input.pairingId,
        input.chatId,
        input.chatType ?? null,
        input.username ?? null,
        input.firstName ?? null,
        input.lastName ?? null,
        input.enabled ?? null,
      ]
    );
  }

  function mapTelegramSubscription(row: any): TelegramChatSubscription {
    return {
      pairingId: String(row.pairing_id),
      gatewayDeviceId: String(row.gateway_device_id),
      chatId: String(row.chat_id),
      chatType: row.chat_type ? String(row.chat_type) : null,
      username: row.username ? String(row.username) : null,
      firstName: row.first_name ? String(row.first_name) : null,
      lastName: row.last_name ? String(row.last_name) : null,
      enabled: row.enabled !== false,
      createdAt: Number(row.created_at_ms),
      updatedAt: Number(row.updated_at_ms),
    };
  }

  async function listTelegramSubscriptions(pairingId: string): Promise<TelegramChatSubscription[]> {
    const r = await pool.query(
      `
      SELECT s.*, p.gateway_device_id,
             EXTRACT(EPOCH FROM s.created_at) * 1000 AS created_at_ms,
             EXTRACT(EPOCH FROM s.updated_at) * 1000 AS updated_at_ms
      FROM telegram_chat_subscriptions s
      JOIN pairings p ON p.id = s.pairing_id
      WHERE s.pairing_id = $1
      ORDER BY s.updated_at DESC
      `,
      [pairingId]
    );
    return r.rows.map(mapTelegramSubscription);
  }

  async function listTelegramSubscriptionsForChat(chatId: string): Promise<TelegramChatSubscription[]> {
    const r = await pool.query(
      `
      SELECT s.*, p.gateway_device_id,
             EXTRACT(EPOCH FROM s.created_at) * 1000 AS created_at_ms,
             EXTRACT(EPOCH FROM s.updated_at) * 1000 AS updated_at_ms
      FROM telegram_chat_subscriptions s
      JOIN pairings p ON p.id = s.pairing_id
      WHERE s.chat_id = $1
      ORDER BY s.enabled DESC, s.updated_at DESC
      `,
      [chatId]
    );
    return r.rows.map(mapTelegramSubscription);
  }

  async function setTelegramSubscriptionEnabled(pairingId: string, chatId: string, enabled: boolean) {
    await pool.query(
      `
      UPDATE telegram_chat_subscriptions
      SET enabled = $3, updated_at = now()
      WHERE pairing_id = $1 AND chat_id = $2
      `,
      [pairingId, chatId, enabled]
    );
  }

  async function deleteTelegramSubscription(pairingId: string, chatId: string) {
    await pool.query('DELETE FROM telegram_chat_subscriptions WHERE pairing_id = $1 AND chat_id = $2', [pairingId, chatId]);
  }

  // ---------------- pairings ----------------
  async function getPairingById(pairingId: string): Promise<PairingRow | null> {
    const r = await pool.query(
      `
      SELECT id, gateway_device_id, gateway_pub_spki_b64, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
      FROM pairings
      WHERE id = $1
      `,
      [pairingId]
    );
    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      id: String(row.id),
      gatewayDeviceId: String(row.gateway_device_id),
      gatewayPubSpkiB64: String(row.gateway_pub_spki_b64 ?? 'AA=='),
      createdAt: Number(row.created_at_ms),
    };
  }

  async function getLatestPairingForGateway(gatewayDeviceId: string): Promise<PairingRow | null> {
    const r = await pool.query(
      `
      SELECT id, gateway_device_id, gateway_pub_spki_b64, EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms
      FROM pairings
      WHERE gateway_device_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [gatewayDeviceId]
    );
    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      id: String(row.id),
      gatewayDeviceId: String(row.gateway_device_id),
      gatewayPubSpkiB64: String(row.gateway_pub_spki_b64 ?? 'AA=='),
      createdAt: Number(row.created_at_ms),
    };
  }

  async function createPairing(input: { pairingId: string; gatewayDeviceId: string; gatewayPubSpkiB64: string }) {
    await upsertGatewayDevice(input.gatewayDeviceId);
    await pool.query(
      `
      INSERT INTO pairings (id, gateway_device_id, gateway_pub_spki_b64)
      VALUES ($1, $2, $3)
      `,
      [input.pairingId, input.gatewayDeviceId, input.gatewayPubSpkiB64]
    );
  }

  async function updateGatewayPub(pairingId: string, gatewayPubSpkiB64: string) {
    await pool.query('UPDATE pairings SET gateway_pub_spki_b64 = $2 WHERE id = $1', [pairingId, gatewayPubSpkiB64]);
  }

  // ---------------- join codes ----------------

  /**
   * Creates or refreshes a join code.
   *
   * IMPORTANT: If a code already exists and is still valid (not expired), we do NOT overwrite it,
   * to avoid "stealing" a code from another pairing.
   * Returns {ok:false, reason:'in_use'} when the code is currently active.
   */
  async function upsertJoinCode(input: {
    code: string;
    pairingId: string;
    gatewayDeviceId: string;
    gatewayPubSpkiB64: string;
    ttlMs: number;
    createdByToken?: string | null;
  }): Promise<{ ok: true } | { ok: false; reason: 'in_use' }>
  {
    await upsertGatewayDevice(input.gatewayDeviceId);

    const expiresAt = new Date(Date.now() + input.ttlMs);

    // Atomic "insert unless in-use".
    // If a row exists and is expired, it will be replaced.
    const r = await pool.query(
      `
      INSERT INTO join_codes(code, pairing_id, gateway_device_id, gateway_pub_spki_b64, expires_at, created_by_token)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (code) DO UPDATE
        SET pairing_id = EXCLUDED.pairing_id,
            gateway_device_id = EXCLUDED.gateway_device_id,
            gateway_pub_spki_b64 = EXCLUDED.gateway_pub_spki_b64,
            created_at = now(),
            expires_at = EXCLUDED.expires_at,
            created_by_token = EXCLUDED.created_by_token
        WHERE join_codes.expires_at < now()
      RETURNING code;
      `,
      [
        input.code,
        input.pairingId,
        input.gatewayDeviceId,
        input.gatewayPubSpkiB64,
        expiresAt,
        input.createdByToken ?? null,
      ]
    );

    if (r.rowCount === 0) return { ok: false, reason: 'in_use' };
    return { ok: true };
  }

  async function getJoinCode(code: string): Promise<JoinCodeRow | null> {
    const r = await pool.query(
      `
      SELECT code, pairing_id, gateway_device_id, gateway_pub_spki_b64,
             EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
             EXTRACT(EPOCH FROM expires_at) * 1000 AS expires_at_ms,
             created_by_token
      FROM join_codes
      WHERE code = $1
      `,
      [code]
    );
    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      code: String(row.code),
      pairingId: String(row.pairing_id),
      gatewayDeviceId: String(row.gateway_device_id),
      gatewayPubSpkiB64: String(row.gateway_pub_spki_b64 ?? 'AA=='),
      createdAt: Number(row.created_at_ms),
      expiresAt: Number(row.expires_at_ms),
      createdByToken: row.created_by_token ? String(row.created_by_token) : null,
    };
  }

  /**
   * Consumes a join code exactly once.
   *
   * Returns:
   * - {ok:true, join}
   * - {ok:false, reason:'invalid'|'expired'}
   */
  async function consumeJoinCode(code: string): Promise<
    | { ok: true; join: JoinCodeRow }
    | { ok: false; reason: 'invalid' | 'expired' }
  > {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sel = await client.query(
        `
        SELECT code, pairing_id, gateway_device_id, gateway_pub_spki_b64,
               EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
               EXTRACT(EPOCH FROM expires_at) * 1000 AS expires_at_ms,
               created_by_token
        FROM join_codes
        WHERE code = $1
        FOR UPDATE
        `,
        [code]
      );

      const row = sel.rows[0] as any;
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'invalid' };
      }

      const expiresAt = Number(row.expires_at_ms);
      // Always delete after reading; code is one-time.
      await client.query('DELETE FROM join_codes WHERE code = $1', [code]);

      await client.query('COMMIT');

      if (expiresAt < Date.now()) {
        return { ok: false, reason: 'expired' };
      }

      return {
        ok: true,
        join: {
          code: String(row.code),
          pairingId: String(row.pairing_id),
          gatewayDeviceId: String(row.gateway_device_id),
          gatewayPubSpkiB64: String(row.gateway_pub_spki_b64 ?? 'AA=='),
          createdAt: Number(row.created_at_ms),
          expiresAt,
          createdByToken: row.created_by_token ? String(row.created_by_token) : null,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- devices + pair tokens ----------------

  async function upsertDevice(input: { deviceId: string; deviceType: DeviceType; deviceLabel?: string | null }) {
    await pool.query(
      `
      INSERT INTO devices(id, type, label, last_seen_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (id) DO UPDATE
        SET type = EXCLUDED.type,
            label = COALESCE(EXCLUDED.label, devices.label),
            last_seen_at = now();
      `,
      [input.deviceId, input.deviceType, input.deviceLabel ?? null]
    );
  }

  async function createPairToken(input: {
    pairToken: string;
    pairingId: string;
    deviceId: string;
    deviceType: DeviceType;
    deviceLabel?: string | null;
    pubSpkiB64?: string | null;
  }) {
    await upsertDevice({ deviceId: input.deviceId, deviceType: input.deviceType, deviceLabel: input.deviceLabel ?? null });

    // Keep only one active token per (pairing, device).
    await pool.query('DELETE FROM pair_tokens WHERE pairing_id = $1 AND device_id = $2', [input.pairingId, input.deviceId]);

    await pool.query(
      `
      INSERT INTO pair_tokens(token, pairing_id, device_id, device_type, device_label, pub_spki_b64, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [
        input.pairToken,
        input.pairingId,
        input.deviceId,
        input.deviceType,
        input.deviceLabel ?? null,
        input.pubSpkiB64 ?? null,
      ]
    );
  }

  async function getPairByToken(pairToken: string): Promise<PairAuth | null> {
    const r = await pool.query(
      `
      SELECT
        t.token AS pair_token,
        t.pairing_id,
        p.gateway_device_id,
        p.gateway_pub_spki_b64,
        t.device_id,
        t.device_type,
        t.device_label,
        EXTRACT(EPOCH FROM t.created_at) * 1000 AS created_at_ms,
        EXTRACT(EPOCH FROM t.last_seen_at) * 1000 AS last_seen_at_ms
      FROM pair_tokens t
      JOIN pairings p ON p.id = t.pairing_id
      WHERE t.token = $1
      `,
      [pairToken]
    );

    const row = r.rows[0] as any;
    if (!row) return null;

    // Touch last seen in background (best-effort)
    pool.query('UPDATE pair_tokens SET last_seen_at = now() WHERE token = $1', [pairToken]).catch(() => {});

    return {
      pairToken: String(row.pair_token),
      pairingId: String(row.pairing_id),
      gatewayDeviceId: String(row.gateway_device_id),
      gatewayPubSpkiB64: String(row.gateway_pub_spki_b64 ?? 'AA=='),
      deviceId: String(row.device_id),
      deviceType: String(row.device_type),
      deviceLabel: row.device_label ? String(row.device_label) : null,
      createdAt: Number(row.created_at_ms),
      lastSeenAt: row.last_seen_at_ms ? Number(row.last_seen_at_ms) : null,
    };
  }

  async function listPairTokens(pairingId: string, limit: number) {
    const r = await pool.query(
      `
      SELECT device_id, device_type, device_label,
             EXTRACT(EPOCH FROM created_at) * 1000 AS created_at_ms,
             EXTRACT(EPOCH FROM last_seen_at) * 1000 AS last_seen_at_ms,
             token
      FROM pair_tokens
      WHERE pairing_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [pairingId, limit]
    );
    return r.rows.map((row: any) => ({
      deviceId: String(row.device_id),
      deviceType: String(row.device_type),
      deviceLabel: row.device_label ? String(row.device_label) : null,
      createdAt: Number(row.created_at_ms),
      lastSeenAt: row.last_seen_at_ms ? Number(row.last_seen_at_ms) : null,
      pairToken: String(row.token),
    }));
  }

  async function deletePairTokensByDevice(pairingId: string, deviceId: string): Promise<{ deleted: number }> {
    const r = await pool.query('DELETE FROM pair_tokens WHERE pairing_id = $1 AND device_id = $2', [pairingId, deviceId]);
    return { deleted: r.rowCount ?? 0 };
  }

  // ---------------- push subscriptions ----------------

  async function upsertPushSubscription(pairingId: string, deviceId: string, subscription: any) {
    await pool.query(
      `
      INSERT INTO push_subscriptions(pairing_id, device_id, subscription, updated_at)
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (pairing_id, device_id) DO UPDATE
        SET subscription = EXCLUDED.subscription,
            updated_at = now();
      `,
      [pairingId, deviceId, JSON.stringify(subscription)]
    );
  }

  async function listPushSubscriptions(pairingId: string): Promise<Array<{ deviceId: string; subscription: any }>> {
    const r = await pool.query('SELECT device_id, subscription FROM push_subscriptions WHERE pairing_id = $1', [pairingId]);
    return r.rows.map((row: any) => ({ deviceId: String(row.device_id), subscription: row.subscription }));
  }

  async function deletePushSubscription(pairingId: string, deviceId: string) {
    await pool.query('DELETE FROM push_subscriptions WHERE pairing_id = $1 AND device_id = $2', [pairingId, deviceId]);
  }

  // ---------------- contacts ----------------

  async function replaceContactsForGateway(gatewayDeviceId: string, contacts: Array<{ number: string; name: string }>) {
    await upsertGatewayDevice(gatewayDeviceId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
        DELETE FROM contacts
        WHERE gateway_device_id = $1
          AND source <> 'web'
          AND name_locked = false
        `,
        [gatewayDeviceId]
      );

      for (const c of contacts) {
        const name = String(c?.name ?? '').trim();
        const num = String(c?.number ?? '').trim();
        if (!name || !num) continue;

        const { norm, tail } = normalizePhone(num);
        if (!norm) continue;

        await client.query(
          `
          INSERT INTO contacts(gateway_device_id, norm, tail, display_name, raw_number, updated_at)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (gateway_device_id, norm) DO UPDATE
            SET tail = EXCLUDED.tail,
                display_name = CASE
                  WHEN contacts.name_locked THEN contacts.display_name
                  ELSE EXCLUDED.display_name
                END,
                raw_number = EXCLUDED.raw_number,
                source = CASE
                  WHEN contacts.name_locked THEN contacts.source
                  ELSE 'android'
                END,
                updated_at = now();
          `,
          [gatewayDeviceId, norm, tail, name, num]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function upsertContactForGateway(
    gatewayDeviceId: string,
    contact: { number: string; displayName: string }
  ): Promise<ContactRow> {
    await upsertGatewayDevice(gatewayDeviceId);

    const displayName = String(contact.displayName ?? '').trim();
    const number = String(contact.number ?? '').trim();
    const { norm, tail } = normalizePhone(number);
    if (!displayName || !norm) {
      throw new Error('Contact name and a valid phone number are required.');
    }

    const r = await pool.query(
      `
      INSERT INTO contacts(gateway_device_id, norm, tail, display_name, raw_number, source, name_locked, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'web', true, now())
      ON CONFLICT (gateway_device_id, norm) DO UPDATE
        SET tail = EXCLUDED.tail,
            display_name = EXCLUDED.display_name,
            raw_number = EXCLUDED.raw_number,
            source = 'web',
            name_locked = true,
            updated_at = now()
      RETURNING display_name, raw_number, norm, source, name_locked
      `,
      [gatewayDeviceId, norm, tail, displayName, number]
    );

    const row = r.rows[0] as any;
    return {
      displayName: String(row.display_name),
      rawNumber: row.raw_number ? String(row.raw_number) : null,
      norm: String(row.norm),
      source: row.source === 'web' ? 'web' : 'android',
      nameLocked: row.name_locked === true,
    };
  }

  function mapContact(row: any): ContactRow {
    return {
      displayName: String(row.display_name),
      rawNumber: row.raw_number ? String(row.raw_number) : null,
      norm: String(row.norm),
      source: row.source === 'web' ? 'web' : 'android',
      nameLocked: row.name_locked === true,
    };
  }

  async function listContacts(gatewayDeviceId: string, limit: number): Promise<ContactRow[]> {
    const r = await pool.query(
      `
      SELECT display_name, raw_number, norm, source, name_locked
      FROM contacts
      WHERE gateway_device_id = $1
      ORDER BY display_name ASC
      LIMIT $2
      `,
      [gatewayDeviceId, limit]
    );
    return r.rows.map(mapContact);
  }

  async function searchContacts(gatewayDeviceId: string, query: string, limit: number): Promise<ContactRow[]> {
    const q = `%${query}%`;
    const r = await pool.query(
      `
      SELECT display_name, raw_number, norm, source, name_locked
      FROM contacts
      WHERE gateway_device_id = $1
        AND (display_name ILIKE $2 OR raw_number ILIKE $2 OR norm ILIKE $2)
      ORDER BY display_name ASC
      LIMIT $3
      `,
      [gatewayDeviceId, q, limit]
    );
    return r.rows.map(mapContact);
  }

  async function lookupContactName(gatewayDeviceId: string, numberRaw: string): Promise<string | null> {
    const { norm, tail } = normalizePhone(numberRaw);
    if (!norm) return null;

    // Prefer exact match; fallback to last-8 tail match.
    const r = await pool.query(
      `
      SELECT display_name
      FROM contacts
      WHERE gateway_device_id = $1 AND (norm = $2 OR tail = $3)
      ORDER BY (norm = $2) DESC, updated_at DESC
      LIMIT 1
      `,
      [gatewayDeviceId, norm, tail]
    );
    const row = r.rows[0] as any;
    return row?.display_name ? String(row.display_name) : null;
  }

  // ---------------- conversations ----------------

  async function upsertConversationFromMessage(input: {
    pairingId: string;
    peer: string;
    peerNorm: string | null;
    peerTail: string | null;
    ts: number;
    body: string;
    bodyIsEncrypted: boolean;
  }) {
    const preview = safePreview(input.body, input.bodyIsEncrypted);

    // We generate a random conversation id on insert and rely on UNIQUE(pairing_id, peer)
    // to make the UPSERT deterministic.
    await pool.query(
      `
      INSERT INTO conversations(id, pairing_id, peer, peer_norm, peer_tail, last_message_ts_ms, last_message_preview, last_body_is_encrypted)
      VALUES ($8, $1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (pairing_id, peer) DO UPDATE
        SET peer_norm = COALESCE(EXCLUDED.peer_norm, conversations.peer_norm),
            peer_tail = COALESCE(EXCLUDED.peer_tail, conversations.peer_tail),
            last_message_ts_ms = GREATEST(conversations.last_message_ts_ms, EXCLUDED.last_message_ts_ms),
            last_message_preview = CASE
              WHEN EXCLUDED.last_message_ts_ms >= conversations.last_message_ts_ms THEN EXCLUDED.last_message_preview
              ELSE conversations.last_message_preview
            END,
            last_body_is_encrypted = CASE
              WHEN EXCLUDED.last_message_ts_ms >= conversations.last_message_ts_ms THEN EXCLUDED.last_body_is_encrypted
              ELSE conversations.last_body_is_encrypted
            END;
      `,
      [
        input.pairingId,
        input.peer,
        input.peerNorm,
        input.peerTail,
        input.ts,
        preview,
        input.bodyIsEncrypted,
        randomUUID(),
      ]
    );
  }

  async function listConversations(pairingId: string, limit: number): Promise<ConversationRow[]> {
    const r = await pool.query(
      `
      WITH conv_base AS (
        SELECT
          c.pairing_id,
          c.peer,
          c.peer_norm,
          c.peer_tail,
          c.last_message_ts_ms,
          c.last_message_preview,
          c.last_body_is_encrypted,
          COALESCE(c.peer_tail, c.peer_norm, c.peer) AS thread_id
        FROM conversations c
        WHERE c.pairing_id = $1
      ),
      latest AS (
        SELECT DISTINCT ON (thread_id)
          pairing_id,
          thread_id,
          peer,
          peer_norm,
          peer_tail,
          last_message_ts_ms,
          last_message_preview,
          last_body_is_encrypted
        FROM conv_base
        ORDER BY thread_id, last_message_ts_ms DESC
      )
      SELECT
        l.thread_id,
        l.peer,
        l.last_message_ts_ms,
        l.last_message_preview,
        l.last_body_is_encrypted,
        p.gateway_device_id,
        COALESCE(ct_exact.display_name, ct_tail.display_name) AS peer_name,
        (b.thread_id IS NOT NULL) AS blocked
      FROM latest l
      JOIN pairings p ON p.id = l.pairing_id
      LEFT JOIN contacts ct_exact ON ct_exact.gateway_device_id = p.gateway_device_id AND ct_exact.norm = l.peer_norm
      LEFT JOIN contacts ct_tail ON ct_tail.gateway_device_id = p.gateway_device_id AND ct_tail.tail = l.peer_tail
      LEFT JOIN blocked_chats b ON b.pairing_id = l.pairing_id AND b.thread_id = l.thread_id
      ORDER BY l.last_message_ts_ms DESC
      LIMIT $2
      `,
      [pairingId, limit]
    );

    return r.rows.map((row: any) => ({
      threadId: String(row.thread_id),
      peer: String(row.peer),
      peerName: row.peer_name ? String(row.peer_name) : null,
      lastTs: Number(row.last_message_ts_ms),
      lastPreview: String(row.last_message_preview ?? ''),
      lastBodyIsEncrypted: row.last_body_is_encrypted ? 1 : 0,
      unreadCount: 0,
      blocked: row.blocked === true,
    }));
  }

  async function resolvePeerByThreadId(pairingId: string, threadId: string): Promise<{ peer: string; peerName: string | null } | null> {
    const r = await pool.query(
      `
      WITH base AS (
        SELECT
          c.peer,
          c.peer_norm,
          c.peer_tail,
          c.last_message_ts_ms,
          COALESCE(c.peer_tail, c.peer_norm, c.peer) AS thread_id
        FROM conversations c
        WHERE c.pairing_id = $1
      )
      SELECT
        b.peer,
        p.gateway_device_id,
        COALESCE(ct_exact.display_name, ct_tail.display_name) AS peer_name
      FROM base b
      JOIN pairings p ON p.id = $1
      LEFT JOIN contacts ct_exact ON ct_exact.gateway_device_id = p.gateway_device_id AND ct_exact.norm = b.peer_norm
      LEFT JOIN contacts ct_tail ON ct_tail.gateway_device_id = p.gateway_device_id AND ct_tail.tail = b.peer_tail
      WHERE b.thread_id = $2
      ORDER BY b.last_message_ts_ms DESC
      LIMIT 1
      `,
      [pairingId, threadId]
    );

    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      peer: String(row.peer),
      peerName: row.peer_name ? String(row.peer_name) : null,
    };
  }

  async function markThreadRead(pairingId: string, threadId: string): Promise<{ ok: true }> {
    // Real database unread counts are not persisted yet, so this is a no-op for production data.
    // Demo mode overrides this method to clear seeded unread badges when a chat is opened.
    void pairingId;
    void threadId;
    return { ok: true };
  }

  // ---------------- chat management ----------------

  function threadWhereClause(alias: string) {
    return `
      (
        ${alias}.peer = $2
        OR COALESCE(${alias}.peer_tail, ${alias}.peer_norm, ${alias}.peer) = $2
        OR ($3::text IS NOT NULL AND ${alias}.peer_norm = $3)
        OR ($4::text IS NOT NULL AND ${alias}.peer_tail = $4)
      )
    `;
  }

  async function listBlockedChats(pairingId: string): Promise<BlockedChatRow[]> {
    const r = await pool.query(
      `
      SELECT
        b.thread_id,
        b.peer,
        b.note,
        EXTRACT(EPOCH FROM b.blocked_at) * 1000 AS blocked_at_ms,
        COALESCE(ct_exact.display_name, ct_tail.display_name) AS peer_name
      FROM blocked_chats b
      JOIN pairings p ON p.id = b.pairing_id
      LEFT JOIN contacts ct_exact ON ct_exact.gateway_device_id = p.gateway_device_id AND ct_exact.norm = b.peer_norm
      LEFT JOIN contacts ct_tail ON ct_tail.gateway_device_id = p.gateway_device_id AND ct_tail.tail = b.peer_tail
      WHERE b.pairing_id = $1
      ORDER BY b.blocked_at DESC
      `,
      [pairingId]
    );

    return r.rows.map((row: any) => ({
      threadId: String(row.thread_id),
      peer: String(row.peer),
      peerName: row.peer_name ? String(row.peer_name) : null,
      note: row.note ? String(row.note) : null,
      blockedAt: Number(row.blocked_at_ms),
    }));
  }

  async function isThreadBlocked(pairingId: string, peerOrThreadId: string): Promise<boolean> {
    const p = normalizePeerForThread(peerOrThreadId);
    const r = await pool.query(
      `
      SELECT 1
      FROM blocked_chats
      WHERE pairing_id = $1
        AND (
          thread_id = $2
          OR peer = $2
          OR ($3::text IS NOT NULL AND peer_norm = $3)
          OR ($4::text IS NOT NULL AND peer_tail = $4)
        )
      LIMIT 1
      `,
      [pairingId, p.threadId || p.peer, p.norm, p.tail]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async function blockThread(input: {
    pairingId: string;
    threadId: string;
    peer?: string | null;
    note?: string | null;
  }): Promise<BlockedChatRow> {
    const threadId = String(input.threadId ?? '').trim();
    const resolved = threadId ? await resolvePeerByThreadId(input.pairingId, threadId) : null;
    const peerRaw = String(resolved?.peer ?? input.peer ?? threadId).trim();
    const peer = peerRaw || threadId;
    const normalized = normalizePeerForThread(peer);
    const effectiveThreadId = threadId || normalized.threadId;
    const canonicalThreadId = normalized.tail || normalized.norm || effectiveThreadId;
    const note = input.note ? String(input.note).trim().slice(0, 300) : null;

    const r = await pool.query(
      `
      INSERT INTO blocked_chats(pairing_id, thread_id, peer, peer_norm, peer_tail, note, blocked_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (pairing_id, thread_id) DO UPDATE
        SET peer = EXCLUDED.peer,
            peer_norm = EXCLUDED.peer_norm,
            peer_tail = EXCLUDED.peer_tail,
            note = EXCLUDED.note
      RETURNING thread_id, peer, note, EXTRACT(EPOCH FROM blocked_at) * 1000 AS blocked_at_ms
      `,
      [input.pairingId, canonicalThreadId, peer, normalized.norm, normalized.tail, note]
    );

    const row = r.rows[0] as any;
    const peerName = await lookupContactName(
      (await getPairingById(input.pairingId))?.gatewayDeviceId ?? '',
      String(row.peer)
    ).catch(() => null);

    return {
      threadId: String(row.thread_id),
      peer: String(row.peer),
      peerName,
      note: row.note ? String(row.note) : null,
      blockedAt: Number(row.blocked_at_ms),
    };
  }

  async function unblockThread(pairingId: string, threadId: string): Promise<{ deleted: number }> {
    const p = normalizePeerForThread(threadId);
    const r = await pool.query(
      `
      DELETE FROM blocked_chats
      WHERE pairing_id = $1
        AND (
          thread_id = $2
          OR peer = $2
          OR ($3::text IS NOT NULL AND peer_norm = $3)
          OR ($4::text IS NOT NULL AND peer_tail = $4)
        )
      `,
      [pairingId, p.threadId || p.peer, p.norm, p.tail]
    );
    return { deleted: r.rowCount ?? 0 };
  }

  async function deleteThread(pairingId: string, threadId: string): Promise<{ deletedMessages: number; deletedConversations: number }> {
    const p = normalizePeerForThread(threadId);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const deletedMessages = await client.query(
        `
        DELETE FROM messages m
        WHERE m.pairing_id = $1
          AND ${threadWhereClause('m')}
        `,
        [pairingId, p.threadId || p.peer, p.norm, p.tail]
      );

      const deletedConversations = await client.query(
        `
        DELETE FROM conversations c
        WHERE c.pairing_id = $1
          AND ${threadWhereClause('c')}
        `,
        [pairingId, p.threadId || p.peer, p.norm, p.tail]
      );

      await client.query('COMMIT');
      return {
        deletedMessages: deletedMessages.rowCount ?? 0,
        deletedConversations: deletedConversations.rowCount ?? 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }


  // ---------------- messages ----------------

  async function insertMessage(input: {
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
    await upsertGatewayDevice(input.gatewayDeviceId);

    await pool.query(
      `
      INSERT INTO messages(
        id, pairing_id, gateway_device_id,
        peer, peer_norm, peer_tail,
        direction, body, body_is_encrypted,
        ts_ms, status, delivered_at_ms,
        created_by, sim_slot_index, subscription_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        input.id,
        input.pairingId,
        input.gatewayDeviceId,
        input.peer,
        input.peerNorm,
        input.peerTail,
        input.direction,
        input.body,
        input.bodyIsEncrypted,
        input.ts,
        input.status,
        input.deliveredAt,
        input.createdBy,
        input.simSlotIndex,
        input.subscriptionId,
      ]
    );

    if (input.pairingId) {
      await upsertConversationFromMessage({
        pairingId: input.pairingId,
        peer: input.peer,
        peerNorm: input.peerNorm,
        peerTail: input.peerTail,
        ts: input.ts,
        body: input.body,
        bodyIsEncrypted: input.bodyIsEncrypted,
      });
    }
  }

  async function tryInsertMessage(input: Parameters<typeof insertMessage>[0]) {
    await upsertGatewayDevice(input.gatewayDeviceId);

    const r = await pool.query(
      `
      INSERT INTO messages(
        id, pairing_id, gateway_device_id,
        peer, peer_norm, peer_tail,
        direction, body, body_is_encrypted,
        ts_ms, status, delivered_at_ms,
        created_by, sim_slot_index, subscription_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        input.id,
        input.pairingId,
        input.gatewayDeviceId,
        input.peer,
        input.peerNorm,
        input.peerTail,
        input.direction,
        input.body,
        input.bodyIsEncrypted,
        input.ts,
        input.status,
        input.deliveredAt,
        input.createdBy,
        input.simSlotIndex,
        input.subscriptionId,
      ]
    );

    if ((r.rowCount ?? 0) > 0 && input.pairingId) {
      await upsertConversationFromMessage({
        pairingId: input.pairingId,
        peer: input.peer,
        peerNorm: input.peerNorm,
        peerTail: input.peerTail,
        ts: input.ts,
        body: input.body,
        bodyIsEncrypted: input.bodyIsEncrypted,
      });
    }

    return { inserted: (r.rowCount ?? 0) > 0 };
  }

  async function listMessages(pairingId: string, threadIdOrPeer: string, limit: number): Promise<MessageRow[]> {
    const r = await pool.query(
      `
      SELECT
        m.id,
        COALESCE(m.peer_tail, m.peer_norm, m.peer) AS thread_id,
        m.peer,
        m.direction,
        m.body,
        m.body_is_encrypted,
        m.ts_ms,
        m.status,
        m.delivered_at_ms,
        m.sim_slot_index,
        m.subscription_id,
        m.created_by,
        p.gateway_device_id,
        COALESCE(ct_exact.display_name, ct_tail.display_name) AS peer_name
      FROM messages m
      JOIN pairings p ON p.id = m.pairing_id
      LEFT JOIN contacts ct_exact ON ct_exact.gateway_device_id = p.gateway_device_id AND ct_exact.norm = m.peer_norm
      LEFT JOIN contacts ct_tail ON ct_tail.gateway_device_id = p.gateway_device_id AND ct_tail.tail = m.peer_tail
      WHERE m.pairing_id = $1
        AND (
          m.peer = $2
          OR (m.peer_norm IS NOT NULL AND m.peer_norm = $2)
          OR (m.peer_tail IS NOT NULL AND m.peer_tail = $2)
        )
      ORDER BY m.ts_ms ASC
      LIMIT $3
      `,
      [pairingId, threadIdOrPeer, limit]
    );

    return r.rows.map((row: any) => ({
      id: String(row.id),
      threadId: String(row.thread_id),
      peer: String(row.peer),
      peerName: row.peer_name ? String(row.peer_name) : null,
      direction: row.direction as MessageDirection,
      body: String(row.body),
      bodyIsEncrypted: row.body_is_encrypted ? 1 : 0,
      ts: Number(row.ts_ms),
      status: row.status as MessageStatus,
      deliveredAt: row.delivered_at_ms ? Number(row.delivered_at_ms) : null,
      simSlotIndex: row.sim_slot_index !== null && row.sim_slot_index !== undefined ? Number(row.sim_slot_index) : null,
      subscriptionId: row.subscription_id !== null && row.subscription_id !== undefined ? Number(row.subscription_id) : null,
      createdBy: row.created_by as MessageCreatedBy,
    }));
  }

  async function getMessageMeta(id: string): Promise<{ pairingId: string | null; peer: string; gatewayDeviceId: string } | null> {
    const r = await pool.query(
      'SELECT pairing_id, peer, gateway_device_id FROM messages WHERE id = $1',
      [id]
    );
    const row = r.rows[0] as any;
    if (!row) return null;
    return {
      pairingId: row.pairing_id ? String(row.pairing_id) : null,
      peer: String(row.peer),
      gatewayDeviceId: String(row.gateway_device_id),
    };
  }

  // ---------------- outbox ----------------

  async function enqueueOutboundMessage(input: {
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
    await insertMessage({
      id: input.id,
      pairingId: input.pairingId,
      gatewayDeviceId: input.gatewayDeviceId,
      peer: input.peer,
      peerNorm: input.peerNorm,
      peerTail: input.peerTail,
      direction: 'out',
      body: input.body,
      bodyIsEncrypted: input.bodyIsEncrypted,
      ts: input.ts,
      status: 'queued',
      deliveredAt: null,
      createdBy: input.createdBy,
      simSlotIndex: input.simSlotIndex,
      subscriptionId: input.subscriptionId,
    });

    await pool.query('INSERT INTO outbox(message_id, claimed_at) VALUES ($1, NULL) ON CONFLICT (message_id) DO NOTHING', [
      input.id,
    ]);
  }

  async function claimOutbox(gatewayDeviceId: string, limit: number, claimTtlMs: number): Promise<OutboxItem[]> {
    await upsertGatewayDevice(gatewayDeviceId);

    const staleBefore = new Date(Date.now() - claimTtlMs);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const claimed = await client.query(
        `
        WITH candidates AS (
          SELECT o.message_id
          FROM outbox o
          JOIN messages m ON m.id = o.message_id
          WHERE m.gateway_device_id = $1
            AND m.direction = 'out'
            AND m.status = 'queued'
            AND (o.claimed_at IS NULL OR o.claimed_at < $2)
          ORDER BY m.ts_ms ASC
          LIMIT $3
          FOR UPDATE OF o SKIP LOCKED
        )
        UPDATE outbox o
          SET claimed_at = now()
        FROM candidates c
        WHERE o.message_id = c.message_id
        RETURNING o.message_id;
        `,
        [gatewayDeviceId, staleBefore, limit]
      );

      const ids = claimed.rows.map((r: any) => String(r.message_id));

      let items: OutboxItem[] = [];
      if (ids.length > 0) {
        const r = await client.query(
          `
          SELECT
            m.id,
            m.pairing_id,
            m.peer,
            m.body,
            m.body_is_encrypted,
            m.ts_ms,
            m.sim_slot_index,
            m.subscription_id
          FROM messages m
          WHERE m.id = ANY($1::uuid[])
          ORDER BY m.ts_ms ASC
          `,
          [ids]
        );

        items = r.rows.map((row: any) => ({
          id: String(row.id),
          pairingId: row.pairing_id ? String(row.pairing_id) : null,
          peer: String(row.peer),
          body: String(row.body),
          bodyIsEncrypted: row.body_is_encrypted ? 1 : 0,
          ts: Number(row.ts_ms),
          simSlotIndex: row.sim_slot_index !== null && row.sim_slot_index !== undefined ? Number(row.sim_slot_index) : null,
          subscriptionId: row.subscription_id !== null && row.subscription_id !== undefined ? Number(row.subscription_id) : null,
        }));
      }

      await client.query('COMMIT');
      return items;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function updateOutboxStatus(id: string, status: 'sent' | 'failed') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE messages SET status = $2 WHERE id = $1', [id, status]);
      await client.query('DELETE FROM outbox WHERE message_id = $1', [id]);
      await client.query(
        'INSERT INTO delivery_receipts(message_id, kind) VALUES ($1, $2)',
        [id, status]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function markDelivered(id: string, deliveredAtMs: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // If status is still queued (rare), promote to sent.
      await client.query(
        `
        UPDATE messages
        SET delivered_at_ms = $2,
            status = CASE WHEN status = 'queued' THEN 'sent' ELSE status END
        WHERE id = $1
        `,
        [id, deliveredAtMs]
      );
      // Ensure the outbox entry is removed so it won't be offered again.
      await client.query('DELETE FROM outbox WHERE message_id = $1', [id]);
      await client.query('INSERT INTO delivery_receipts(message_id, kind, meta) VALUES ($1, $2, $3::jsonb)', [
        id,
        'delivered',
        JSON.stringify({ deliveredAtMs }),
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    // pairings
    upsertGatewayDevice,
    listGatewayDevices,
    gatewayDeviceExists,
    getPairingById,
    getLatestPairingForGateway,
    createPairing,
    updateGatewayPub,

    // join codes
    upsertJoinCode,
    getJoinCode,
    consumeJoinCode,

    // tokens
    createPairToken,
    getPairByToken,
    listPairTokens,
    deletePairTokensByDevice,

    // push
    upsertPushSubscription,
    listPushSubscriptions,
    deletePushSubscription,

    // contacts
    replaceContactsForGateway,
    upsertContactForGateway,
    listContacts,
    searchContacts,
    lookupContactName,

    // conversations
    listConversations,
    resolvePeerByThreadId,
    markThreadRead,
    listBlockedChats,
    isThreadBlocked,
    blockThread,
    unblockThread,
    deleteThread,

    // messages
    insertMessage,
    tryInsertMessage,
    listMessages,
    getMessageMeta,

    // telegram
    getTelegramSession,
    setTelegramSession,
    getTelegramPairingSettings,
    setTelegramPairingSettings,
    createTelegramLinkCode,
    consumeTelegramLinkCode,
    upsertTelegramSubscription,
    listTelegramSubscriptions,
    listTelegramSubscriptionsForChat,
    setTelegramSubscriptionEnabled,
    deleteTelegramSubscription,

    // outbox
    enqueueOutboundMessage,
    claimOutbox,
    updateOutboxStatus,
    markDelivered,

    // util
    normalizePhone,
  };
}
