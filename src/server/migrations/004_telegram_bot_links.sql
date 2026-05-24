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
