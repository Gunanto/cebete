BEGIN;

CREATE TABLE IF NOT EXISTS auth_magic_links (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('first_login')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_magic_links_user_created
  ON auth_magic_links (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_magic_links_purpose_created
  ON auth_magic_links (purpose, created_at DESC);

COMMIT;
