BEGIN;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS stimulus_content;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS stimulus_type;

COMMIT;
