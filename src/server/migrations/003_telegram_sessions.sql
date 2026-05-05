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
