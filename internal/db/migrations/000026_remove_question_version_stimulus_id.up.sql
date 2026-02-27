BEGIN;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS stimulus_id;

COMMIT;
