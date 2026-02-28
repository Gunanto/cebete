BEGIN;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_created_by_active
  ON subjects (created_by, is_active);

COMMIT;
