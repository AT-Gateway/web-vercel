-- Persistent read state for inbound messages.
--
-- Read state is tracked per message (not by timestamp) because message
-- timestamps come from the phone's clock, which can drift from the server's.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS read_at_ms BIGINT;

-- Existing history counts as read, so upgrading doesn't flag every old message.
UPDATE messages
  SET read_at_ms = (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
  WHERE direction = 'in' AND read_at_ms IS NULL;

-- Unread counts only ever scan unread inbound rows, which this keeps tiny.
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages (pairing_id, peer_tail, peer_norm)
  WHERE direction = 'in' AND read_at_ms IS NULL;
