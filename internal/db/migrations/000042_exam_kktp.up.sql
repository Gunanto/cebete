BEGIN;

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS kktp NUMERIC(5,2) NOT NULL DEFAULT 70;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_exams_kktp_range'
  ) THEN
    ALTER TABLE exams
      ADD CONSTRAINT chk_exams_kktp_range
      CHECK (kktp >= 0 AND kktp <= 100);
  END IF;
END$$;

COMMIT;
