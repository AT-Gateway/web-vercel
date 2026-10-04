-- Gateway liveness: the last time the Android gateway polled its outbox.
--
-- last_seen_at is also bumped by web sends (insertMessage upserts the gateway),
-- so it can't tell whether the phone is actually online. last_poll_at is only
-- updated by GET /api/android/outbox (claimOutbox), on the server clock.

ALTER TABLE gateway_devices
  ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ;
