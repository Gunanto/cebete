BEGIN;

CREATE TABLE IF NOT EXISTS user_school_scopes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id BIGINT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_user_school_scopes_school
  ON user_school_scopes (school_id, user_id);

COMMIT;
