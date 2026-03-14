BEGIN;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS province VARCHAR(120);

UPDATE schools
SET
  city = COALESCE(
    NULLIF(btrim(split_part(address, ',', 1)), ''),
    city
  ),
  province = COALESCE(
    NULLIF(btrim(split_part(address, ',', 2)), ''),
    province
  )
WHERE address IS NOT NULL
  AND btrim(address) <> '';

COMMIT;
