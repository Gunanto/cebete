BEGIN;

ALTER TABLE exams
  DROP CONSTRAINT IF EXISTS chk_exams_management_scope;

ALTER TABLE exams
  ALTER COLUMN management_scope DROP DEFAULT;

ALTER TABLE exams
  DROP COLUMN IF EXISTS owner_school_id;

ALTER TABLE exams
  DROP COLUMN IF EXISTS management_scope;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_teacher_access_profile;

ALTER TABLE users
  ALTER COLUMN teacher_access_profile DROP DEFAULT;

ALTER TABLE users
  DROP COLUMN IF EXISTS teacher_access_profile;

COMMIT;
