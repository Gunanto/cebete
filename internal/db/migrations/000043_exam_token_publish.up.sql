ALTER TABLE exams
ADD COLUMN exam_token_plain TEXT,
ADD COLUMN exam_token_published_at TIMESTAMPTZ,
ADD COLUMN exam_token_published_by BIGINT;
