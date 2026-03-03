BEGIN;

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_qv_content_hash
  ON question_versions (content_hash);

COMMIT;
