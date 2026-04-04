BEGIN;

CREATE INDEX IF NOT EXISTS idx_attempts_exam_status_expires
  ON attempts (exam_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_attempts_exam_started
  ON attempts (exam_id, started_at, id);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_active
  ON enrollments (user_id, status, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrollments_active_class_school
  ON enrollments (status, class_id, school_id, enrolled_at DESC);

COMMIT;
