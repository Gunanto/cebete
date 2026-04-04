BEGIN;

DROP INDEX IF EXISTS idx_enrollments_active_class_school;
DROP INDEX IF EXISTS idx_enrollments_user_active;
DROP INDEX IF EXISTS idx_attempts_exam_started;
DROP INDEX IF EXISTS idx_attempts_exam_status_expires;

COMMIT;
