BEGIN;

ALTER TABLE learning_goals
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_learning_goals_created_by
  ON learning_goals (created_by);

COMMIT;
