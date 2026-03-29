BEGIN;

ALTER TABLE question_versions
  DROP COLUMN IF EXISTS stimulus_group_id;

DROP TABLE IF EXISTS stimulus_groups;

COMMIT;
