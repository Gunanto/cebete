BEGIN;

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS stimulus_type VARCHAR(20)
    CHECK (stimulus_type IN ('single','multiteks'));

ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS stimulus_content JSONB;

UPDATE question_versions
SET stimulus_type = 'single',
    stimulus_content = jsonb_build_object('body', COALESCE(stimulus_html, ''))
WHERE stimulus_type IS NULL
  AND stimulus_content IS NULL
  AND stimulus_html IS NOT NULL
  AND btrim(stimulus_html) <> '';

COMMIT;
