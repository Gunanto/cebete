BEGIN;

WITH owner_candidates AS (
  SELECT
    st.learning_goal_id,
    st.created_by
  FROM stimuli st
  WHERE st.learning_goal_id IS NOT NULL
    AND st.created_by IS NOT NULL

  UNION ALL

  SELECT
    q.learning_goal_id,
    qv.created_by
  FROM questions q
  JOIN question_versions qv ON qv.question_id = q.id
  WHERE q.learning_goal_id IS NOT NULL
    AND qv.created_by IS NOT NULL
),
resolved_owner AS (
  SELECT
    learning_goal_id,
    MIN(created_by) AS created_by
  FROM owner_candidates
  GROUP BY learning_goal_id
)
UPDATE learning_goals lg
SET created_by = ro.created_by
FROM resolved_owner ro
WHERE lg.id = ro.learning_goal_id
  AND lg.created_by IS NULL;

COMMIT;
