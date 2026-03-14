BEGIN;

DROP INDEX IF EXISTS ux_auth_oauth_signups_hash;
DROP TABLE IF EXISTS auth_oauth_signups;

DROP INDEX IF EXISTS ux_auth_oauth_states_hash;
DROP TABLE IF EXISTS auth_oauth_states;

ALTER TABLE registration_requests
  DROP COLUMN IF EXISTS oauth_provider,
  DROP COLUMN IF EXISTS oauth_subject;

ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_provider_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('password','email_otp'));

COMMIT;
