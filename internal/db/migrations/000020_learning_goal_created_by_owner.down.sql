BEGIN;

DROP INDEX IF EXISTS idx_learning_goals_created_by;

ALTER TABLE learning_goals
  DROP COLUMN IF EXISTS created_by;

COMMIT;
