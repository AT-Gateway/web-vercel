-- Improve performance for thread-based queries.

CREATE INDEX IF NOT EXISTS idx_messages_pair_tail_ts
  ON messages (pairing_id, peer_tail, ts_ms);

CREATE INDEX IF NOT EXISTS idx_messages_pair_norm_ts
  ON messages (pairing_id, peer_norm, ts_ms);

CREATE INDEX IF NOT EXISTS idx_conversations_pair_tail_ts
  ON conversations (pairing_id, peer_tail, last_message_ts_ms DESC);
