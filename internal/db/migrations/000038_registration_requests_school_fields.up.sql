BEGIN;

ALTER TABLE registration_requests
  ADD COLUMN IF NOT EXISTS school_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS npsn VARCHAR(20),
  ADD COLUMN IF NOT EXISTS kabupaten VARCHAR(120),
  ADD COLUMN IF NOT EXISTS provinsi VARCHAR(120),
  ADD COLUMN IF NOT EXISTS kecamatan VARCHAR(120),
  ADD COLUMN IF NOT EXISTS alamat TEXT,
  ADD COLUMN IF NOT EXISTS school_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS jenjang VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status_sekolah VARCHAR(50),
  ADD COLUMN IF NOT EXISTS class_name VARCHAR(120);

UPDATE registration_requests
SET
  school_name = COALESCE(school_name, NULLIF(form_payload->>'school_name','')),
  npsn = COALESCE(npsn, NULLIF(form_payload->>'npsn','')),
  kabupaten = COALESCE(kabupaten, NULLIF(form_payload->>'kabupaten','')),
  provinsi = COALESCE(provinsi, NULLIF(form_payload->>'provinsi','')),
  kecamatan = COALESCE(kecamatan, NULLIF(form_payload->>'kecamatan','')),
  alamat = COALESCE(alamat, NULLIF(form_payload->>'alamat','')),
  school_email = COALESCE(school_email, NULLIF(form_payload->>'school_email','')),
  jenjang = COALESCE(jenjang, NULLIF(form_payload->>'jenjang','')),
  status_sekolah = COALESCE(status_sekolah, NULLIF(form_payload->>'status_sekolah','')),
  class_name = COALESCE(class_name, NULLIF(form_payload->>'class_name',''))
WHERE form_payload <> '{}'::jsonb;

COMMIT;
