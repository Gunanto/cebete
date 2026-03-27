ALTER TABLE exams
DROP COLUMN IF EXISTS exam_token_published_by,
DROP COLUMN IF EXISTS exam_token_published_at,
DROP COLUMN IF EXISTS exam_token_plain;
