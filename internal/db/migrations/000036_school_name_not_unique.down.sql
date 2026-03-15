BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_schools_name
  ON schools (LOWER(name));

COMMIT;
