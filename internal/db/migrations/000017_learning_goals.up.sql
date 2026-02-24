BEGIN;

CREATE TABLE IF NOT EXISTS learning_goals (
  id BIGSERIAL PRIMARY KEY,
  tujuan_pembelajaran TEXT NOT NULL,
  mata_pelajaran VARCHAR(150) NOT NULL,
  kelas VARCHAR(50) NOT NULL,
  semester SMALLINT NOT NULL CHECK (semester >= 1)
);

CREATE INDEX IF NOT EXISTS idx_learning_goals_mapel_kelas_semester
  ON learning_goals (mata_pelajaran, kelas, semester);

COMMIT;
