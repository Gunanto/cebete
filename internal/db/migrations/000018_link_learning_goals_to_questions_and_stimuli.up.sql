BEGIN;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS learning_goal_id BIGINT;

ALTER TABLE stimuli
  ADD COLUMN IF NOT EXISTS learning_goal_id BIGINT;

INSERT INTO learning_goals (tujuan_pembelajaran, mata_pelajaran, kelas, semester)
SELECT
  'Tujuan Pembelajaran Umum - ' || s.name,
  s.name,
  s.education_level,
  1
FROM subjects s
WHERE NOT EXISTS (
  SELECT 1
  FROM learning_goals lg
  WHERE lg.tujuan_pembelajaran = 'Tujuan Pembelajaran Umum - ' || s.name
    AND lg.mata_pelajaran = s.name
    AND lg.kelas = s.education_level
    AND lg.semester = 1
);

WITH subject_goal AS (
  SELECT
    s.id AS subject_id,
    MIN(lg.id) AS learning_goal_id
  FROM subjects s
  JOIN learning_goals lg
    ON lg.mata_pelajaran = s.name
   AND lg.kelas = s.education_level
   AND lg.semester = 1
  GROUP BY s.id
)
UPDATE questions q
SET learning_goal_id = sg.learning_goal_id
FROM subject_goal sg
WHERE q.subject_id = sg.subject_id
  AND q.learning_goal_id IS NULL;

WITH subject_goal AS (
  SELECT
    s.id AS subject_id,
    MIN(lg.id) AS learning_goal_id
  FROM subjects s
  JOIN learning_goals lg
    ON lg.mata_pelajaran = s.name
   AND lg.kelas = s.education_level
   AND lg.semester = 1
  GROUP BY s.id
)
UPDATE stimuli st
SET learning_goal_id = sg.learning_goal_id
FROM subject_goal sg
WHERE st.subject_id = sg.subject_id
  AND st.learning_goal_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_questions_learning_goal'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT fk_questions_learning_goal
      FOREIGN KEY (learning_goal_id) REFERENCES learning_goals(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_stimuli_learning_goal'
  ) THEN
    ALTER TABLE stimuli
      ADD CONSTRAINT fk_stimuli_learning_goal
      FOREIGN KEY (learning_goal_id) REFERENCES learning_goals(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_learning_goal
  ON questions (learning_goal_id);

CREATE INDEX IF NOT EXISTS idx_stimuli_learning_goal
  ON stimuli (learning_goal_id);

COMMIT;
