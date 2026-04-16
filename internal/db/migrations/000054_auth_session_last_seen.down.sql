BEGIN;

DROP INDEX IF EXISTS idx_auth_sessions_online;

ALTER TABLE auth_sessions
  DROP COLUMN IF EXISTS last_seen_at;

COMMIT;
