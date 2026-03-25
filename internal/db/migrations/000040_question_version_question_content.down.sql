BEGIN;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS question_content;

COMMIT;
