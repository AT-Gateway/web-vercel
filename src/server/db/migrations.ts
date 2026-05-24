export const MIGRATIONS: Array<{ id: string; sql: string }> = [
  { id: '001_init.sql', sql: `
-- SMS Gateway initial schema (PostgreSQL)

-- NOTE: We intentionally avoid using DB-generated UUIDs so the app can generate them.

CREATE TABLE IF NOT EXISTS gateway_devices (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pairings (
  id UUID PRIMARY KEY,
  gateway_device_id TEXT NOT NULL REFERENCES gateway_devices(id) ON DELETE CASCADE,
  gateway_pub_spki_b64 TEXT NOT NULL DEFAULT 'AA==',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairings_gateway_created_at
  ON pairings (gateway_device_id, created_at DESC);

-- A "device" is any client that can hold a pair token.
-- Examples: PWA browser, Telegram bot, future native clients.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pair_tokens (
  token TEXT PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL,
  device_label TEXT,
  pub_spki_b64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pair_tokens_pairing_created_at
  ON pair_tokens (pairing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pair_tokens_device
  ON pair_tokens (device_id);

CREATE TABLE IF NOT EXISTS join_codes (
  code TEXT PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  gateway_device_id TEXT NOT NULL REFERENCES gateway_devices(id) ON DELETE CASCADE,
  gateway_pub_spki_b64 TEXT NOT NULL DEFAULT 'AA==',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_token TEXT
);

CREATE INDEX IF NOT EXISTS idx_join_codes_pairing
  ON join_codes (pairing_id);

-- Contacts are owned by a gateway device (Android phone), not by a pairing.
CREATE TABLE IF NOT EXISTS contacts (
  gateway_device_id TEXT NOT NULL REFERENCES gateway_devices(id) ON DELETE CASCADE,
  norm TEXT NOT NULL,
  tail TEXT NOT NULL,
  display_name TEXT NOT NULL,
  raw_number TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway_device_id, norm)
);

CREATE INDEX IF NOT EXISTS idx_contacts_gateway_tail
  ON contacts (gateway_device_id, tail);

-- Conversation summary table.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  peer TEXT NOT NULL,
  peer_norm TEXT,
  peer_tail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_ts_ms BIGINT NOT NULL,
  last_message_preview TEXT NOT NULL,
  last_body_is_encrypted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (pairing_id, peer)
);

CREATE INDEX IF NOT EXISTS idx_conversations_pairing_last_ts
  ON conversations (pairing_id, last_message_ts_ms DESC);

-- All messages (inbound + outbound)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  pairing_id UUID REFERENCES pairings(id) ON DELETE SET NULL,
  gateway_device_id TEXT NOT NULL REFERENCES gateway_devices(id) ON DELETE CASCADE,
  peer TEXT NOT NULL,
  peer_norm TEXT,
  peer_tail TEXT,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  body_is_encrypted BOOLEAN NOT NULL DEFAULT false,
  ts_ms BIGINT NOT NULL,
  status TEXT NOT NULL,
  delivered_at_ms BIGINT,
  created_by TEXT NOT NULL,
  sim_slot_index INTEGER,
  subscription_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_pair_peer_ts
  ON messages (pairing_id, peer, ts_ms);

CREATE INDEX IF NOT EXISTS idx_messages_pair_ts
  ON messages (pairing_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_messages_gateway_outbox
  ON messages (gateway_device_id, direction, status, ts_ms);

-- Outbox rows exist only for outbound messages that are queued/sending.
CREATE TABLE IF NOT EXISTS outbox (
  message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_claimed_at
  ON outbox (claimed_at);

-- Append-only status/delivery history.
CREATE TABLE IF NOT EXISTS delivery_receipts (
  id BIGSERIAL PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_delivery_receipts_message
  ON delivery_receipts (message_id, reported_at DESC);

-- Web push subscriptions (per pairing + device)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_pairing
  ON push_subscriptions (pairing_id);

` },
  { id: '002_thread_indexes.sql', sql: `
-- Improve performance for thread-based queries.

CREATE INDEX IF NOT EXISTS idx_messages_pair_tail_ts
  ON messages (pairing_id, peer_tail, ts_ms);

CREATE INDEX IF NOT EXISTS idx_messages_pair_norm_ts
  ON messages (pairing_id, peer_norm, ts_ms);

CREATE INDEX IF NOT EXISTS idx_conversations_pair_tail_ts
  ON conversations (pairing_id, peer_tail, last_message_ts_ms DESC);

` },
  { id: '003_telegram_sessions.sql', sql: `
-- Telegram sessions: store per-chat context (selected gateway, default SIM, last opened conversation)

CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id TEXT PRIMARY KEY,
  gateway_device_id TEXT,
  last_peer TEXT,
  last_thread_id TEXT,
  default_sim_slot_index INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_updated_at
  ON telegram_sessions (updated_at DESC);

` },
  { id: '004_telegram_bot_links.sql', sql: `
-- Telegram bot linking, chat subscriptions, and per-pairing alert settings

CREATE TABLE IF NOT EXISTS telegram_pairing_settings (
  pairing_id UUID PRIMARY KEY REFERENCES pairings(id) ON DELETE CASCADE,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_pairing
  ON telegram_link_codes (pairing_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires_at
  ON telegram_link_codes (expires_at);

CREATE TABLE IF NOT EXISTS telegram_chat_subscriptions (
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  chat_type TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_subscriptions_pairing_enabled
  ON telegram_chat_subscriptions (pairing_id, enabled);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_subscriptions_chat
  ON telegram_chat_subscriptions (chat_id, updated_at DESC);

` },
];
