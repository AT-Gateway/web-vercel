-- Chat blocking, thread cleanup support, and web-managed contact names.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'android';

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS name_locked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_gateway_source
  ON contacts (gateway_device_id, source, updated_at DESC);

CREATE TABLE IF NOT EXISTS blocked_chats (
  pairing_id UUID NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  peer TEXT NOT NULL,
  peer_norm TEXT,
  peer_tail TEXT,
  note TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_chats_pairing_blocked_at
  ON blocked_chats (pairing_id, blocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocked_chats_pairing_norm
  ON blocked_chats (pairing_id, peer_norm);

CREATE INDEX IF NOT EXISTS idx_blocked_chats_pairing_tail
  ON blocked_chats (pairing_id, peer_tail);
