BEGIN;

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS question_content JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
