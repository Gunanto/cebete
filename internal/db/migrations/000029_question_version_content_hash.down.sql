BEGIN;

DROP INDEX IF EXISTS idx_qv_content_hash;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS content_hash;

COMMIT;
