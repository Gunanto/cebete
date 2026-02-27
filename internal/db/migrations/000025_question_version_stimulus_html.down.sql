BEGIN;

ALTER TABLE question_versions
DROP COLUMN stimulus_html;

COMMIT;
