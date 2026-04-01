CREATE INDEX IF NOT EXISTS idx_attempts_status_expires
  ON attempts (status, expires_at);
