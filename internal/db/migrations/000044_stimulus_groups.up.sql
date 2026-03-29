BEGIN;

CREATE TABLE IF NOT EXISTS stimulus_groups (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  title VARCHAR(200),
  stimulus_type VARCHAR(20)
    CHECK (stimulus_type IN ('single','multiteks')),
  stimulus_content JSONB,
  stimulus_html TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stimulus_groups_subject
  ON stimulus_groups (subject_id);

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS stimulus_group_id BIGINT REFERENCES stimulus_groups(id);

CREATE INDEX IF NOT EXISTS idx_question_versions_stimulus_group
  ON question_versions (stimulus_group_id);

DO $$
DECLARE
  rec RECORD;
  new_group_id BIGINT;
BEGIN
  FOR rec IN
    SELECT
      qv.id AS question_version_id,
      q.subject_id,
      CASE
        WHEN NULLIF(btrim(q.metadata->>'title'), '') IS NOT NULL
          THEN btrim(q.metadata->>'title')
        ELSE 'Stimulus Soal #' || q.id::text || ' v' || qv.version_no::text
      END AS title,
      qv.stimulus_type,
      qv.stimulus_content,
      qv.stimulus_html,
      qv.created_by,
      qv.created_at
    FROM question_versions qv
    JOIN questions q ON q.id = qv.question_id
    WHERE qv.stimulus_group_id IS NULL
      AND (
        (qv.stimulus_html IS NOT NULL AND btrim(qv.stimulus_html) <> '')
        OR qv.stimulus_type IS NOT NULL
        OR (qv.stimulus_content IS NOT NULL AND qv.stimulus_content <> '{}'::jsonb)
      )
    ORDER BY qv.id ASC
  LOOP
    INSERT INTO stimulus_groups (
      subject_id,
      title,
      stimulus_type,
      stimulus_content,
      stimulus_html,
      is_active,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      rec.subject_id,
      rec.title,
      rec.stimulus_type,
      rec.stimulus_content,
      rec.stimulus_html,
      TRUE,
      rec.created_by,
      rec.created_at,
      now()
    )
    RETURNING id INTO new_group_id;

    UPDATE question_versions
    SET stimulus_group_id = new_group_id
    WHERE id = rec.question_version_id;
  END LOOP;
END $$;

COMMIT;
