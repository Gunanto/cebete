BEGIN;

WITH created_audit AS (
  SELECT DISTINCT ON (al.entity_id)
    al.entity_id,
    al.user_id
  FROM audit_logs al
  WHERE al.entity_type = 'learning_goal'
    AND al.action = 'learning_goal_created'
    AND al.user_id IS NOT NULL
  ORDER BY al.entity_id, al.created_at ASC, al.id ASC
)
UPDATE learning_goals lg
SET created_by = ca.user_id
FROM created_audit ca
WHERE lg.id::text = ca.entity_id
  AND lg.created_by IS NULL;

COMMIT;
