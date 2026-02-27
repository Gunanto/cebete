BEGIN;

DROP TRIGGER IF EXISTS trg_exam_question_code_rules_set_updated_at ON exam_question_code_rules;
DROP TRIGGER IF EXISTS trg_question_codes_set_updated_at ON question_codes;

DROP INDEX IF EXISTS idx_exam_question_code_rules_code;
DROP INDEX IF EXISTS idx_exam_question_code_rules_exam;
DROP TABLE IF EXISTS exam_question_code_rules;

DROP INDEX IF EXISTS idx_questions_question_code;
ALTER TABLE questions
  DROP COLUMN IF EXISTS question_code_id;

DROP INDEX IF EXISTS idx_question_codes_created_by;
DROP INDEX IF EXISTS idx_question_codes_subject;
DROP TABLE IF EXISTS question_codes;

COMMIT;
