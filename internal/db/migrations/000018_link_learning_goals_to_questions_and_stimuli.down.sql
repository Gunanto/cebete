BEGIN;

DROP INDEX IF EXISTS idx_stimuli_learning_goal;
DROP INDEX IF EXISTS idx_questions_learning_goal;

ALTER TABLE stimuli
  DROP CONSTRAINT IF EXISTS fk_stimuli_learning_goal;

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS fk_questions_learning_goal;

ALTER TABLE stimuli
  DROP COLUMN IF EXISTS learning_goal_id;

ALTER TABLE questions
  DROP COLUMN IF EXISTS learning_goal_id;

COMMIT;
