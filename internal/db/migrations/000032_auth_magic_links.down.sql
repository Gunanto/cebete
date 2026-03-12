BEGIN;

DROP INDEX IF EXISTS idx_auth_magic_links_purpose_created;
DROP INDEX IF EXISTS idx_auth_magic_links_user_created;
DROP TABLE IF EXISTS auth_magic_links;

COMMIT;
