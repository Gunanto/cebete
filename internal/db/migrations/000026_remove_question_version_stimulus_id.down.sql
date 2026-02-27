BEGIN;

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS stimulus_id BIGINT REFERENCES stimuli(id);

COMMIT;
