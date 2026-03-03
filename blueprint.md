# Blueprint CBT LMS (Ringan, Cepat, Stabil)

Dokumen ini adalah rancangan teknis lengkap untuk membangun aplikasi CBT (Computer Based Test) dengan tampilan seperti referensi Anda: halaman pilih simulasi, halaman pengerjaan soal dua panel, dan halaman review hasil.

## 1) Tujuan dan Prinsip

### Tujuan utama
- Performa cepat di perangkat sekolah/lab dengan spesifikasi menengah ke bawah.
- Stabil saat banyak peserta ujian bersamaan.
- Mudah dioperasikan oleh admin/guru.
- UI mirip referensi, tetapi arsitektur tetap modern dan mudah dipelihara.

### Prinsip desain
- Server-Side Rendering (SSR) sebagai default untuk halaman inti ujian.
- JavaScript modular dan ringan, tetapi tetap cukup untuk UI admin/guru/proktor yang kompleks.
- Autosave jawaban yang idempotent dan tahan refresh/jaringan putus sementara.
- Integritas ujian dijaga di server (bukan di browser).

---

## 2) Stack Teknologi (Kondisi Saat Ini)

## Implementasi yang berjalan sekarang
- Backend: Go 1.22+ dengan router Chi.
- Template SSR: Go `html/template`.
- Frontend: vanilla JavaScript modular (`web/static/js`), tanpa SPA framework.
- Editor rich text: Quill (untuk naskah soal).
- Database: PostgreSQL 15+.
- Cache/session: Redis (opsional, saat ini tidak wajib).
- Object storage: S3-compatible (MinIO) opsional untuk media.
- Reverse proxy: Nginx atau Caddy.
- Deployment: Docker Compose (single server), image dari GHCR.

## Alasan pemilihan
- Go efisien untuk concurrency tinggi dan latensi rendah.
- SSR menjaga waktu render cepat dan stabil di perangkat low-end.
- Vanilla JS menghindari overhead bundler/framework besar.
- PostgreSQL kuat untuk transaksi dan konsistensi ujian.

---

## 3) Arsitektur Sistem

## Komponen
- Web App (Go): render halaman, API autosave, submit, review.
- DB (PostgreSQL): menyimpan bank soal, paket ujian, jawaban, hasil.
- Redis (opsional): session cepat, cache data statis.
- Storage (opsional): gambar/audio soal.
- Reverse Proxy: TLS, compression, static caching.
- Static assets: CSS/JS di `web/static/`, di-load dari template SSR.

## Alur tingkat tinggi
1. Peserta login.
2. Peserta memilih jenjang, jenis mapel, mapel.
3. Sistem membuat `attempt` (sesi ujian) dengan waktu mulai/selesai.
4. Halaman ujian tampil 1 nomor + panel navigasi.
5. Setiap perubahan jawaban dipanggil autosave ke server.
6. Saat waktu habis / peserta submit, server finalisasi attempt.
7. Sistem hitung nilai, tampilkan review sesuai kebijakan.

---

## 4) Modul Fungsional

### Modul autentikasi dan otorisasi
- Role: `admin`, `proktor`, `guru`, `siswa`.
- Login berbasis session cookie HttpOnly + Secure + SameSite=Lax/Strict.
- Dukungan reset password dan lockout bertahap.

### Modul master data
- Sekolah, kelas, peserta, mapel, topik.
- Impor data peserta via CSV.

### Modul bank soal
- Jenis soal:
  - Pilihan ganda tunggal
  - Pilihan ganda kompleks (multi jawaban)
  - Benar/Salah per pernyataan
  - Isian singkat (opsional tahap 2)
- Soal punya tingkat kesulitan, topik, tag.
- Versi soal untuk audit perubahan.

### Modul paket ujian
- Paket statis atau randomisasi berdasarkan blueprint.
- Pengaturan: durasi, jumlah soal, urutan acak, bobot.

### Modul pelaksanaan ujian
- Start attempt dengan server timestamp.
- Timer authoritative di server.
- Autosave jawaban per soal.
- Status soal: belum dijawab, dijawab, ragu-ragu.

### Modul penilaian dan review
- Auto scoring untuk objective items.
- Simpan detail skor per nomor.
- Kebijakan review:
  - langsung setelah submit
  - setelah jadwal berakhir
  - tanpa tampilkan kunci

### Modul laporan
- Rekap per kelas/sekolah/mapel.
- Distribusi nilai, analisis butir soal (opsional tahap 2).
- Ekspor CSV/PDF.

---

## 5) Non-Functional Requirements (NFR)

### Performa
- P95 response time:
  - halaman render < 300 ms (tanpa gambar berat)
  - autosave < 150 ms
- Target konkuren awal: 500 peserta aktif/server.

### Ketersediaan
- Uptime target: 99.5% (fase awal), 99.9% (produksi matang).
- Health check endpoint: `/healthz`, `/readyz`.

### Keamanan
- Password hash Argon2id/Bcrypt.
- CSRF protection pada form penting.
- Rate limit login + brute force mitigation.
- Audit log untuk aksi kritikal.

### Reliabilitas data
- Submit final dalam transaksi DB.
- Idempotency key untuk request submit.
- Backup harian + PITR (Point-in-Time Recovery) PostgreSQL.

---

## 6) Desain Data (Skema Inti)

Catatan: nama tabel bisa disesuaikan, di bawah adalah minimum viable schema.

```sql
-- Users & Roles
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','proktor','guru','siswa')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nisn VARCHAR(30),
  school_id BIGINT,
  grade_level VARCHAR(20),
  class_name VARCHAR(30)
);

-- Subject / Exam definitions
CREATE TABLE subjects (
  id BIGSERIAL PRIMARY KEY,
  education_level VARCHAR(30) NOT NULL,
  subject_type VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE questions (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  question_type VARCHAR(30) NOT NULL,
  stem_html TEXT NOT NULL,
  stimulus_html TEXT,
  difficulty SMALLINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_options (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_key VARCHAR(10) NOT NULL,
  option_html TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (question_id, option_key)
);

CREATE TABLE exams (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  duration_minutes INT NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  randomize_questions BOOLEAN NOT NULL DEFAULT FALSE,
  randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  review_policy VARCHAR(30) NOT NULL DEFAULT 'after_submit',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE exam_questions (
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id),
  seq_no INT NOT NULL,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (exam_id, question_id),
  UNIQUE (exam_id, seq_no)
);

-- Attempt/session
CREATE TABLE attempts (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id),
  student_id BIGINT NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress','submitted','expired','cancelled')),
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  score NUMERIC(7,2),
  total_correct INT,
  total_wrong INT,
  total_unanswered INT,
  client_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE attempt_answers (
  id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id),
  answer_payload JSONB,
  is_doubt BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE attempt_scores (
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id),
  earned_score NUMERIC(6,2) NOT NULL,
  is_correct BOOLEAN,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (attempt_id, question_id)
);

-- Audit
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id VARCHAR(50),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attempts_exam_status ON attempts (exam_id, status);
CREATE INDEX idx_attempt_answers_attempt ON attempt_answers (attempt_id);
CREATE INDEX idx_questions_subject ON questions (subject_id);
```

---

## 7) Kontrak API Minimum (REST)

Semua endpoint `/api/v1` dan auth via session cookie.

### Auth
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Discovery ujian
- `GET /subjects?level=&type=`
- `GET /exams?subject_id=`
- `POST /attempts/start` -> buat / lanjutkan attempt

### Pengerjaan
- `GET /attempts/{id}` -> ringkasan attempt + sisa waktu server
- `GET /attempts/{id}/questions/{no}` -> data soal nomor tertentu
- `PUT /attempts/{id}/answers/{question_id}` -> autosave jawaban
- `PUT /attempts/{id}/flags/{question_id}` -> toggle ragu-ragu
- `POST /attempts/{id}/submit` -> final submit (idempotent)

### Review dan hasil
- `GET /attempts/{id}/result`
- `GET /attempts/{id}/review` (tergantung policy)

### Admin
- CRUD `/questions`, `/exams`, `/subjects`, `/users`
- `POST /imports/students`
- `GET /reports/exams/{id}`

## Contoh payload autosave

```json
{
  "answer_payload": {
    "selected": ["B"]
  },
  "client_ts": "2026-02-18T13:45:10+07:00"
}
```

## Response standar

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "request_id": "req_abc123"
  }
}
```

---

## 8) Alur Ujian yang Aman

### Start attempt
1. Validasi peserta terdaftar dan jadwal ujian aktif.
2. Jika attempt ada dan `in_progress`, lanjutkan attempt lama.
3. Jika belum ada, buat attempt dengan `started_at` dan `expires_at` dari server.

### Autosave jawaban
- Debounce di client (mis. 400-700 ms).
- Server melakukan UPSERT `attempt_answers`.
- Simpan status `is_doubt` terpisah agar cepat diubah.

### Submit final
1. Kunci attempt row (`SELECT ... FOR UPDATE`).
2. Pastikan status masih `in_progress` dan belum lewat aturan final.
3. Hitung skor berdasarkan jawaban terakhir.
4. Simpan ke `attempt_scores`, update `attempts` ke `submitted`.
5. Commit transaksi.

### Timeout handling
- Saat request masuk, server cek `now() > expires_at`.
- Jika habis, server auto-finalize (status `expired`) dan hitung skor.

---

## 9) Frontend Blueprint (UI mirip referensi)

### Halaman 1: Pilih Simulasi
- Komponen:
  - Header branding
  - Card tengah: dropdown jenjang, jenis mapel, mapel
  - Tombol `Mulai Simulasi`
- Aksi:
  - Dropdown chained loading (request kecil via JS)
  - Tombol aktif jika semua pilihan valid

### Halaman 2: Pengerjaan Soal
- Layout dua panel:
  - Kiri: stimulus/bacaan/gambar
  - Kanan: pertanyaan + opsi jawaban
- Top bar:
  - nomor soal, sisa waktu, info mapel
- Bottom actions:
  - `Soal Sebelumnya`, `Ragu-ragu`, `Soal Berikutnya`
- Panel navigasi nomor (opsional): warna status soal.

### Halaman 3: Review Hasil
- Tabel per nomor:
  - jawaban peserta
  - kunci jawaban/penjelasan (sesuai policy)
- Ringkasan nilai di atas.

### Token UI state
- `not_answered`, `answered`, `doubt`, `current`.
- Semua state berbasis data server agar sinkron lintas refresh.

Catatan implementasi:
- Saat ini interaksi UI dilakukan oleh vanilla JS (bukan HTMX).
- Admin/guru/proktor memakai panel SSR + JS modul untuk tabel, form, dan editor.

---

## 10) Keamanan Anti-Curang (Pragmatis)

Catatan: anti-cheat sempurna tidak mungkin di browser biasa, fokus pada mitigasi praktis.

- Fullscreen enforcement (best effort, tidak hard-fail).
- Event logging:
  - pindah tab/window blur
  - koneksi putus
  - reload halaman berulang
- Randomisasi urutan soal/opsi per peserta.
- Token attempt bertanda tangan (HMAC) untuk endpoint kritikal.
- Batasi 1 sesi aktif per akun (opsional by policy).

---

## 11) Observability dan Operasional

### Logging
- Structured logs (JSON): `request_id`, `user_id`, `attempt_id`, latency.

### Metrics (Prometheus)
- request count/latency/error rate
- autosave throughput
- submit success/failure
- DB pool usage

### Tracing (opsional)
- OpenTelemetry untuk path lambat.

### Backup
- Daily full backup + WAL archiving.
- Simulasi restore rutin (minimal bulanan).

---

## 12) Strategi Deployment

### Fase 1 (cepat go-live)
- 1 VM:
  - app Go
  - PostgreSQL (managed lebih baik jika ada)
  - Nginx + TLS
- Docker Compose.

### Fase 2 (scale)
- Pisahkan DB ke managed service.
- Tambah Redis.
- Horizontal scale app (2-3 replica).
- Load balancer + sticky/session store terpusat.

### Baseline sizing awal (estimasi)
- 500 peserta aktif:
  - App: 2 vCPU, 4-8 GB RAM
  - DB: 4 vCPU, 8-16 GB RAM, SSD NVMe
- Sesuaikan dari hasil uji beban nyata.

---

## 13) Strategi Testing

### Unit tests
- Scoring engine.
- Validasi state machine attempt.

### Integration tests
- Start -> autosave -> submit -> review.
- Concurrency test pada submit ganda.

### Load test
- Skenario 500-2000 virtual users.
- Fokus endpoint autosave dan submit.

### UAT checklist
- Timer sinkron server-client.
- Recovery setelah koneksi putus.
- Review policy sesuai aturan lembaga.

---

## 14) Roadmap Implementasi (8 Minggu)

### Minggu 1-2
- Setup project, auth, role, master data minimal.
- Skema DB inti + migration.

### Minggu 3-4
- Bank soal + paket ujian + halaman pilih simulasi.
- Attempt lifecycle dasar.

### Minggu 5-6
- Halaman pengerjaan dua panel.
- Autosave, ragu-ragu, navigasi nomor.

### Minggu 7
- Submit final atomic + scoring + review hasil.
- Laporan ringkas.

### Minggu 8
- Hardening, load test, security checklist, go-live prep.

---

## 15) Struktur Folder yang Disarankan

```text
cbtlms/
  cmd/
    web/
      main.go
  internal/
    app/
      router.go
      middleware.go
    auth/
      service.go
      handler.go
    exam/
      service.go
      handler.go
      scoring.go
    question/
      service.go
      handler.go
    report/
      service.go
      handler.go
    db/
      migrations/
      queries/
  web/
    templates/
      layout/
      pages/
      partials/
    static/
      css/
      js/
      img/
  deployments/
    docker-compose.yml
    nginx.conf
  scripts/
    seed.sql
    loadtest/
  blueprint.md
```

---

## 16) Risiko Utama dan Mitigasi

- Risiko: submit bersamaan menyebabkan data ganda.
  - Mitigasi: idempotency key + row lock transaksi.
- Risiko: DB lambat saat autosave massal.
  - Mitigasi: index tepat, payload kecil, pooling, batch tuning.
- Risiko: peserta kehilangan jawaban karena jaringan.
  - Mitigasi: autosave agresif + indikator status tersimpan.
- Risiko: UI berat di komputer lama.
  - Mitigasi: SSR + minim JS + optimasi gambar.

---

## 17) Keputusan Teknis Final yang Disarankan

Jika target Anda adalah "paling ringan dan cepat" untuk meniru UI referensi:
- Gunakan Go + PostgreSQL + SSR template + HTMX.
- Hindari SPA penuh di fase awal.
- Fokus pada integritas attempt, autosave idempotent, dan submit atomic.

Blueprint ini cukup sebagai acuan implementasi tim kecil (1-3 developer) untuk MVP produksi.
