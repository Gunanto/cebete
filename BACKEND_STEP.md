# BACKEND_STEP.md

Dokumen ini adalah peta kerja backend CBT LMS yang bisa langsung dieksekusi bertahap. Fokusnya: stabil, ringan, aman, dan siap dipakai pada skenario ujian nyata.

## Cara membaca dokumen ini
- Urutan pengerjaan: dari `Step 1` ke `Step 12`.
- Di setiap step ada:
  - Tujuan
  - Ruang lingkup
  - Implementasi teknis
  - Endpoint/DB yang disentuh
  - Checklist selesai
  - Risiko umum

---

## Step 1 - Fondasi auth dan session (wajib pertama)

## Tujuan
Memastikan hanya user valid yang bisa akses sistem, dan role-based access berjalan benar.

## Ruang lingkup
- Login/logout berbasis session cookie.
- Validasi password hash (`argon2id` atau minimal `bcrypt`).
- Middleware auth + role (`admin`, `proktor`, `guru`, `siswa`).

## Implementasi teknis
- Tambah tabel session jika tidak pakai Redis store.
- Gunakan cookie: `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
- Pisahkan middleware:
  - `RequireAuth`
  - `RequireRole(roles...)`
- Normalisasi error auth: 401 (unauthorized), 403 (forbidden).

## Endpoint awal
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Checklist selesai
- Login valid membuat session aktif.
- Login gagal tidak membocorkan detail (username/password salah cukup satu pesan).
- Semua endpoint non-public ditutup untuk user anonim.
- Role test lulus (guru tidak bisa akses endpoint admin).

## Risiko umum
- Session fixation.
- Password disimpan plain-text (harus dihindari total).

---

## Step 2 - Model user, sekolah, dan peserta (master data minimum)

## Tujuan
Menyiapkan data yang dibutuhkan agar ujian bisa di-assign ke peserta nyata.

## Ruang lingkup
- Entitas sekolah, kelas, peserta.
- Relasi user-siswa ke school/class.
- Impor CSV peserta.

## Implementasi teknis
- Tambah tabel jika belum ada: `schools`, `classes`, `enrollments`.
- Tambah unique constraint kombinasi yang penting (misal `nisn`, `school_id + class_name`).
- Buat endpoint import dengan validasi baris per baris dan laporan error per row.

## Checklist selesai
- 1 sekolah + 1 kelas + banyak siswa bisa dibuat/import.
- Data invalid di import tidak merusak baris valid.
- Audit log mencatat siapa import kapan.

---

## Step 3 - Attempt lifecycle lengkap (inti CBT)

## Tujuan
Menutup celah di proses ujian: start, lanjut, autosave, submit final, timeout.

## Ruang lingkup
- Lengkapi endpoint attempt.
- Pastikan state machine attempt valid.
- Final submit atomic.

## Implementasi teknis
- State `attempts`: `in_progress`, `submitted`, `expired`, `cancelled`.
- State transition yang boleh:
  - `in_progress -> submitted`
  - `in_progress -> expired`
- Gunakan transaksi saat submit:
  - lock row attempt (`FOR UPDATE`)
  - hitung nilai
  - simpan `attempt_scores`
  - update summary `attempts`
- Tambah idempotency key untuk submit (hindari submit ganda).

## Endpoint
- `POST /api/v1/attempts/start` (sudah ada, lanjut hardening)
- `GET /api/v1/attempts/{id}`
- `PUT /api/v1/attempts/{id}/answers/{questionID}` (sudah ada, lanjut hardening)
- `POST /api/v1/attempts/{id}/submit`

## Checklist selesai
- Refresh browser tidak membuat attempt ganda.
- Submit 2 kali hasil tetap satu (idempotent).
- Attempt lewat waktu tidak bisa diedit lagi.
- Ringkasan `total_correct/wrong/unanswered` terisi benar.

## Risiko umum
- Race condition submit bersamaan.
- Jawaban tersimpan tapi scoring tidak sinkron (harus satu transaksi saat finalisasi).

---

## Step 4 - Scoring engine yang deterministik

## Tujuan
Perhitungan nilai konsisten, bisa diuji, dan mudah ditelusuri saat komplain.

## Ruang lingkup
- Engine scoring per tipe soal.
- Rekam skor per nomor.

## Implementasi teknis
- Buat modul scoring murni (pure function), tidak langsung tergantung HTTP.
- Support minimal:
  - pilihan ganda tunggal
  - multi jawaban
  - benar/salah per pernyataan
- Simpan detail per nomor di `attempt_scores.feedback` untuk audit.

## Checklist selesai
- Unit test scoring minimal 20+ kasus (benar, salah, kosong, malformed).
- Hasil sama untuk input sama (deterministik).

---

## Step 5 - Authoring service (stimulus, versi soal, paralel)

## Tujuan
Membuat workflow pembuatan soal terstruktur seperti referensi (`hal.jpeg`, `cbt.pdf`).

## Ruang lingkup
- `stimuli`, `question_versions`, `question_parallels`.
- Aksi draft/final dan versi baru.

## Implementasi teknis
- Saat edit soal final: jangan overwrite, buat `version_no + 1`.
- Validasi `stimulus_type` (`single`, `multiteks`) + schema `content` JSON.
- `question_parallels` dipakai untuk grouping paket paralel per exam.

## Endpoint minimal
- `POST /api/v1/stimuli`
- `GET /api/v1/stimuli?subject_id=`
- `POST /api/v1/questions/{id}/versions`
- `POST /api/v1/questions/{id}/versions/{version}/finalize`
- `GET /api/v1/questions/{id}/versions`

## Checklist selesai
- Soal bisa disimpan draft dan final.
- Riwayat versi terbaca jelas.
- Paralel 1/2/3 bisa didefinisikan per exam.

---

## Step 6 - Review/telaah workflow (quality gate)

## Tujuan
Memastikan soal yang tayang ke peserta sudah ditelaah dan ada jejak keputusan.

## Ruang lingkup
- `review_tasks`, `review_comments`.
- State reviu: `menunggu_reviu`, `perlu_revisi`, `disetujui`.

## Implementasi teknis
- Assign reviewer per `question_version`.
- Keputusan `perlu_revisi` wajib isi alasan.
- Keputusan `disetujui` menandai versi layak pakai.

## Endpoint minimal
- `POST /api/v1/reviews/tasks`
- `POST /api/v1/reviews/tasks/{id}/decision`
- `GET /api/v1/reviews/tasks?status=&reviewer_id=`
- `GET /api/v1/questions/{id}/reviews`

## Checklist selesai
- Reviewer melihat only assigned tasks.
- Alasan revisi tercatat dan bisa diaudit.
- Soal final tanpa review bisa diblok (opsional by policy).

---

## Step 7 - Integritas ujian dan anti-cheat pragmatis

## Tujuan
Mengurangi kecurangan tanpa membuat sistem rapuh.

## Ruang lingkup
- Validasi waktu server authoritative.
- Event log perilaku mencurigakan.

## Implementasi teknis
- Simpan event: `tab_blur`, `reconnect`, `rapid_refresh`, `fullscreen_exit`.
- Batasi satu session aktif per user saat ujian (opsional).
- Tanda tangani token attempt (HMAC) untuk endpoint kritikal.

## Checklist selesai
- Event anti-cheat tercatat per attempt.
- Laporan event bisa dilihat proktor.

---

## Step 8 - API contract, validation, dan error model konsisten

## Tujuan
API mudah dipakai frontend dan aman dari input buruk.

## Ruang lingkup
- DTO validation.
- Error response standar.

## Implementasi teknis
- Gunakan validator untuk field required, enum, range.
- Format error konsisten:
  - `ok`
  - `error.code`
  - `error.message`
  - `meta.request_id`
- Gunakan status code tepat (400/401/403/404/409/422/500).

## Checklist selesai
- Semua endpoint punya schema request/response terdokumentasi.
- Frontend tidak perlu tebak format error.

---

## Step 9 - Observability (logging, metrics, trace)

## Tujuan
Memudahkan diagnosis saat ujian live (waktu paling kritikal).

## Ruang lingkup
- Structured logging.
- Metrics service-level.

## Implementasi teknis
- Log JSON minimal: `request_id`, `user_id`, `attempt_id`, `path`, `latency_ms`, `status`.
- Tambah metrics:
  - request latency p95
  - autosave success/error
  - submit success/error
  - DB pool saturation
- Optional tracing via OpenTelemetry.

## Checklist selesai
- Bisa jawab cepat: endpoint mana lambat, user mana error, kapan spike terjadi.

---

## Step 10 - Performa dan query hardening

## Tujuan
Menjaga sistem tetap cepat saat concurrent user naik.

## Ruang lingkup
- Query tuning.
- Index review.

## Implementasi teknis
- Audit query lambat (`EXPLAIN ANALYZE`).
- Tambah composite index sesuai pola akses real.
- Batasi payload autosave tetap kecil.
- Gunakan pooling DB yang benar.

## Checklist selesai
- P95 autosave < 150 ms (target awal).
- P95 halaman utama API < 300 ms.

---

## Step 11 - Test strategy yang wajib ada sebelum produksi

## Tujuan
Mencegah regresi di fitur kritikal ujian.

## Ruang lingkup
- Unit, integration, concurrency, load test.

## Implementasi teknis
- Unit test: scoring, state transition attempt, validator.
- Integration test:
  - start -> autosave -> submit -> result
- Concurrency test:
  - dua submit bersamaan
- Load test:
  - 500+ VU untuk autosave/submit endpoint.

## Checklist selesai
- Build pipeline gagal otomatis jika test kritikal gagal.
- Ada report hasil load test baseline.

---

## Step 12 - Security hardening dan go-live checklist

## Tujuan
Meminimalkan risiko operasional saat dipakai ujian resmi.

## Ruang lingkup
- Security baseline.
- Backup-recovery.

## Implementasi teknis
- Rate limit login dan endpoint sensitif.
- CSRF protection untuk sesi berbasis cookie.
- Secret management (jangan hardcode di repo).
- Backup harian + uji restore berkala.

## Checklist selesai
- Security checklist lulus.
- Runbook insiden tersedia (DB down, app crash, submit spike).

---

## Prioritas Eksekusi Praktis (disarankan)

1. Step 1-4 (fondasi ujian inti): auth, attempt lifecycle, scoring.
2. Step 5-6 (workflow penulisan/review): authoring + telaah.
3. Step 7-10 (operasional): anti-cheat, observability, performa.
4. Step 11-12 (siap produksi): testing lengkap + security hardening.

---

## Deliverables yang harus ada setelah setiap milestone

## Milestone A (setelah Step 1-4)
- Login + role middleware aktif.
- Ujian bisa start, autosave, submit, hasil keluar.
- Unit/integration test inti jalan.

## Milestone B (setelah Step 5-6)
- Guru bisa tulis soal versi draft/final.
- Reviewer bisa memberi keputusan + komentar revisi.
- Riwayat versi dan audit tersedia.

## Milestone C (setelah Step 7-12)
- Monitoring dan alert dasar aktif.
- Lulus load test baseline.
- Checklist security + backup restore tervalidasi.

---

## Catatan implementasi untuk project ini (konteks saat ini)

- Migration `000001`, `000002`, `000003` sudah tersedia dan mendukung sebagian besar fondasi data.
- Endpoint yang sudah ada:
  - `POST /api/v1/attempts/start`
  - `PUT /api/v1/attempts/{id}/answers/{questionID}`
  - `GET /healthz`
- Fokus coding berikutnya paling tepat: selesaikan `Step 1`, `Step 3`, `Step 4` terlebih dulu.

---

## Desain Auth Tambahan: 3 Model Login (Siswa/Guru)

Requirement ini menjadi ekstensi langsung dari `Step 1`.

## Ringkasan 3 model
1. Login dengan `email/username + password` (akun dibuat admin/proktor).
2. Login dengan `OTP via email aktif`.
3. Self-registration pakai email aktif + form lengkap, lalu akun menunggu verifikasi admin/proktor sebelum bisa login.

## Aturan global (berlaku ke semua model)
- Satu identitas user tetap 1 akun (`users`), walau metode login bisa lebih dari satu.
- Email harus unik dan terverifikasi sebelum dipakai login OTP.
- Semua aktivitas auth masuk `audit_logs`.
- Rate-limit berlaku untuk login password, OTP request, OTP verify, dan pendaftaran.

## Perubahan skema DB yang disarankan
- Tambah kolom `users`:
  - `email VARCHAR(255) UNIQUE`
  - `email_verified_at TIMESTAMPTZ`
  - `account_status VARCHAR(20)` (`pending_verification`, `active`, `rejected`, `suspended`)
  - `approved_by BIGINT REFERENCES users(id)`
  - `approved_at TIMESTAMPTZ`
- Tambah tabel `auth_otp_codes`:
  - `id`, `user_id`, `email`, `code_hash`, `purpose`, `expires_at`, `used_at`, `attempt_count`, `created_at`
- Tambah tabel `registration_requests`:
  - `id`, `role_requested` (`siswa`/`guru`), `email`, `password_hash`, `form_payload JSONB`, `status` (`pending`, `approved`, `rejected`), `review_note`, `reviewed_by`, `reviewed_at`, `created_at`
- Tambah tabel `auth_identities` (opsional tapi rapi):
  - `id`, `user_id`, `provider` (`password`, `email_otp`), `provider_key`, `created_at`

## Model 1 - Login username/email + password

## Alur
1. User input identifier (`username` atau `email`) + password.
2. Sistem cari user aktif (`account_status='active'`).
3. Verifikasi hash password.
4. Jika valid, buat session dan set cookie.

## Endpoint
- `POST /api/v1/auth/login-password`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Validasi penting
- Tolak login jika status `pending_verification`/`rejected`/`suspended`.
- Lockout sementara setelah N kali gagal.

## Model 2 - Login OTP via email aktif

## Alur
1. User input email.
2. Sistem cek user ada + status active + email terverifikasi.
3. Generate OTP 6 digit, simpan hash OTP (`code_hash`), kirim email.
4. User input OTP.
5. Sistem validasi hash, masa berlaku, dan retry count.
6. Jika valid, tandai OTP `used_at`, buat session login.

## Endpoint
- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`

## Validasi penting
- OTP berlaku 5 menit (disarankan).
- Maksimal 3-5 percobaan verifikasi per OTP.
- Cooldown kirim ulang OTP (mis. 60 detik).

## Model 3 - Pendaftaran mandiri + verifikasi admin/proktor

## Alur pengguna
1. User isi form registrasi lengkap (data siswa/guru) + email aktif + password.
2. Sistem simpan ke `registration_requests` status `pending`.
3. Sistem kirim email notifikasi ke admin/proktor (opsional).
4. User belum bisa login sampai disetujui.

## Alur admin/proktor
1. Buka daftar registrasi pending.
2. Review data/form dan cocokkan aturan lembaga.
3. Approve/reject dengan catatan.
4. Jika approve:
  - Buat `users` atau aktifkan user terkait.
  - Set `account_status='active'`, `approved_by`, `approved_at`.
  - Opsional: kirim email konfirmasi aktivasi.

## Endpoint
- Public:
  - `POST /api/v1/registrations`
  - `GET /api/v1/registrations/{id}/status` (opsional)
- Admin/Proktor:
  - `GET /api/v1/admin/registrations?status=pending`
  - `POST /api/v1/admin/registrations/{id}/approve`
  - `POST /api/v1/admin/registrations/{id}/reject`

## Validasi form registrasi
- Minimal umum:
  - nama lengkap
  - email aktif
  - no HP
  - role yang didaftarkan (`siswa`/`guru`)
- Khusus siswa:
  - NISN/NIS, sekolah, kelas
- Khusus guru:
  - NUPTK/NIP (opsional sesuai aturan), sekolah, mapel

## Kebijakan keamanan wajib
- Password policy: min length + kombinasi karakter.
- OTP disimpan hash, bukan plain text.
- Jangan pernah mengembalikan detail sensitif di response.
- Anti-enumeration: response login/OTP jangan membocorkan apakah email terdaftar.
- Audit semua keputusan approve/reject.

## Prioritas implementasi (praktis)
1. Model 1 (paling cepat stabil untuk operasional awal).
2. Model 3 (kontrol onboarding via verifikasi admin/proktor).
3. Model 2 (OTP email) setelah email infra siap dan monitoring rate-limit matang.

## Definition of Done untuk 3 model
- Ketiga alur bisa jalan paralel di akun yang sama sesuai policy.
- Admin bisa melihat dan memutus pendaftaran dengan jejak audit.
- Uji keamanan dasar lulus: brute-force, OTP replay, session fixation.
