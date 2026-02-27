BEGIN;

CREATE TABLE IF NOT EXISTS question_codes (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, code)
);

CREATE INDEX IF NOT EXISTS idx_question_codes_subject
  ON question_codes (subject_id);

CREATE INDEX IF NOT EXISTS idx_question_codes_created_by
  ON question_codes (created_by);

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_code_id BIGINT REFERENCES question_codes(id);

CREATE INDEX IF NOT EXISTS idx_questions_question_code
  ON questions (question_code_id);

CREATE TABLE IF NOT EXISTS exam_question_code_rules (
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_code_id BIGINT NOT NULL REFERENCES question_codes(id),
  strategy VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (strategy IN ('all', 'random')),
  pick_count INT CHECK (pick_count IS NULL OR pick_count > 0),
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exam_id, question_code_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_question_code_rules_exam
  ON exam_question_code_rules (exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_question_code_rules_code
  ON exam_question_code_rules (question_code_id);

DROP TRIGGER IF EXISTS trg_question_codes_set_updated_at ON question_codes;
CREATE TRIGGER trg_question_codes_set_updated_at
BEFORE UPDATE ON question_codes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_exam_question_code_rules_set_updated_at ON exam_question_code_rules;
CREATE TRIGGER trg_exam_question_code_rules_set_updated_at
BEFORE UPDATE ON exam_question_code_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
