ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 1;

ALTER TABLE exams
  DROP CONSTRAINT IF EXISTS exams_max_attempts_check;

ALTER TABLE exams
  ADD CONSTRAINT exams_max_attempts_check CHECK (max_attempts > 0);

ALTER TABLE attempts
  DROP CONSTRAINT IF EXISTS attempts_exam_id_student_id_key;

CREATE INDEX IF NOT EXISTS idx_attempts_exam_student_started
  ON attempts (exam_id, student_id, started_at DESC, id DESC);
