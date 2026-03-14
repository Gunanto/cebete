BEGIN;

ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_provider_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('password','email_otp','google'));

ALTER TABLE registration_requests
  ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(30),
  ADD COLUMN IF NOT EXISTS oauth_subject VARCHAR(255);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  id BIGSERIAL PRIMARY KEY,
  state_hash TEXT NOT NULL,
  flow VARCHAR(20) NOT NULL CHECK (flow IN ('login','signup')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_oauth_states_hash
  ON auth_oauth_states (state_hash);

CREATE TABLE IF NOT EXISTS auth_oauth_signups (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_oauth_signups_hash
  ON auth_oauth_signups (token_hash);

COMMIT;
