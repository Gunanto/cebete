DROP INDEX IF EXISTS idx_attempts_exam_student_started;

ALTER TABLE attempts
  ADD CONSTRAINT attempts_exam_id_student_id_key UNIQUE (exam_id, student_id);

ALTER TABLE exams
  DROP CONSTRAINT IF EXISTS exams_max_attempts_check;

ALTER TABLE exams
  DROP COLUMN IF EXISTS max_attempts;
