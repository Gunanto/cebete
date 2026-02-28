BEGIN;

DROP INDEX IF EXISTS idx_subjects_created_by_active;

ALTER TABLE subjects
  DROP COLUMN IF EXISTS created_by;

COMMIT;
