BEGIN;

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE auth_sessions
SET last_seen_at = COALESCE(last_seen_at, created_at)
WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_online
  ON auth_sessions (last_seen_at DESC)
  WHERE revoked_at IS NULL;

COMMIT;
