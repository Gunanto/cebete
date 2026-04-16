BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS teacher_access_profile VARCHAR(20);

UPDATE users
SET teacher_access_profile = 'school'
WHERE role = 'guru'
  AND (teacher_access_profile IS NULL OR btrim(teacher_access_profile) = '');

ALTER TABLE users
  ALTER COLUMN teacher_access_profile SET DEFAULT 'school';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_teacher_access_profile;

ALTER TABLE users
  ADD CONSTRAINT chk_users_teacher_access_profile
  CHECK (
    teacher_access_profile IS NULL
    OR teacher_access_profile IN ('school', 'cross_school')
  );

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS management_scope VARCHAR(20);

UPDATE exams
SET management_scope = 'same_school'
WHERE management_scope IS NULL OR btrim(management_scope) = '';

ALTER TABLE exams
  ALTER COLUMN management_scope SET DEFAULT 'same_school';

ALTER TABLE exams
  DROP CONSTRAINT IF EXISTS chk_exams_management_scope;

ALTER TABLE exams
  ADD CONSTRAINT chk_exams_management_scope
  CHECK (management_scope IN ('same_school', 'cross_school'));

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS owner_school_id BIGINT REFERENCES schools(id);

UPDATE exams e
SET owner_school_id = src.school_id
FROM (
  SELECT ex.id AS exam_id, en.school_id
  FROM exams ex
  JOIN LATERAL (
    SELECT e2.school_id
    FROM enrollments e2
    WHERE e2.user_id = ex.created_by
      AND e2.status = 'active'
    ORDER BY e2.enrolled_at DESC, e2.id DESC
    LIMIT 1
  ) en ON TRUE
  WHERE ex.created_by IS NOT NULL
) src
WHERE e.id = src.exam_id
  AND e.owner_school_id IS NULL;

COMMIT;
