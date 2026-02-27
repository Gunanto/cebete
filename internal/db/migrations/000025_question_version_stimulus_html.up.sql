BEGIN;

ALTER TABLE question_versions
ADD COLUMN stimulus_html TEXT;

UPDATE question_versions qv
SET stimulus_html = CASE
  WHEN st.stimulus_type = 'multiteks' THEN (
    SELECT COALESCE(string_agg(
      '<section class="panel mt"><h4>' ||
      COALESCE(NULLIF(btrim(tab->>'title'), ''), 'Tab ' || idx::text) ||
      '</h4><div class="box mt">' ||
      COALESCE(NULLIF(btrim(tab->>'body'), ''), '<span class="muted">(konten kosong)</span>') ||
      '</div></section>',
      ''
    ), '')
    FROM (
      SELECT tab, row_number() OVER () AS idx
      FROM jsonb_array_elements(st.content->'tabs') AS tab
    ) t
  )
  ELSE NULLIF(btrim(st.content->>'body'), '')
END
FROM stimuli st
WHERE qv.stimulus_id = st.id
  AND (qv.stimulus_html IS NULL OR btrim(qv.stimulus_html) = '');

COMMIT;
