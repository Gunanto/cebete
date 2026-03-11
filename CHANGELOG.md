# Changelog

## 2026-03-10 - in progress

### Added
- Jalur pendaftaran NON-REGULER via OTP email (tab baru di login) dengan form wajib: nama, email, sekolah, NPSN, kabupaten, provinsi, kelas.
- Penandaan akun non-reguler (`users.is_non_regular`) dan auto-create sekolah/kelas/enrollment saat pendaftaran disetujui proktor.
- Self-enroll ujian untuk peserta non-reguler:
  - daftar ujian publish via popup di `/ujian`,
  - endpoint `GET /api/v1/exams/published`,
  - endpoint `POST /api/v1/exams/{id}/self-enroll`.
- Aksi hapus attempt pada menu `Hasil Ujian` guru (endpoint delete attempt).
- Menu `Hasil Ujian` proktor setara dengan guru: matrix hasil per peserta, export Excel, laporan/statistik/grafik, hapus attempt, dan Analisis Butir Soal (dialog + export/print).

### Changed
- Nilai hasil ujian dinormalisasi menggunakan total bobot soal (maksimum 100), baik di UI maupun export Excel.
- Hasil ujian hanya menampilkan attempt `siswa` (attempt guru dari menu Coba Ujian tidak ikut laporan/analisis).
- Tombol `Analisis Butir Soal` di menu Hasil Ujian menggunakan ikon.
- Tabel verifikasi pendaftaran proktor menampilkan detail form non-reguler (popup detail).
- Tabel `Hasil Ujian` proktor mengikuti styling guru termasuk padding kanan area scroll agar kolom terakhir tidak terpotong.

### Fixed
- Regrade ujian tidak lagi gagal karena konflik cursor transaksi pada query attempt.
- Label tipe soal pada Analisis Butir Soal untuk `pg_tunggal`, `multi_jawaban`, `benar_salah_pernyataan`.

## 2026-03-05 - in progress

### Added
- Export/transfer naskah soal antar guru via admin/proktor, termasuk dropdown pilih guru dan subject untuk target transfer.
- Endpoint media baru untuk gambar soal:
  - `POST /api/v1/media/question-images` (upload)
  - `GET /api/v1/media/question-images/*` (serve image)
- Package backend baru `internal/media` untuk integrasi MinIO object storage.
- Test handler media (`internal/media/handler_test.go`) untuk skenario sukses, file terlalu besar, storage unavailable, dan not found.
- Endpoint regrade hasil ujian per exam: `POST /api/v1/admin/exams/{id}/regrade`.
- Audit log untuk perubahan kunci jawaban dan regrade ujian (tabel `audit_logs`).
- UI Audit Log di portal proktor beserta endpoint list `GET /api/v1/admin/audit-logs`.

### Changed
- Integrasi Quill image handler:
  - prioritas upload ke endpoint media (URL image disimpan di HTML),
  - fallback ke base64 hanya ketika upload gagal non-size,
  - batas ukuran gambar 2MB di sisi frontend.
- Konfigurasi aplikasi bertambah untuk MinIO: endpoint/key/secret/use_ssl/bucket/region.
- Routing API aman:
  - upload media hanya untuk `admin/proktor/guru`,
  - serve media tersedia pada route secure (authenticated users).
- Menu Kelola Ujian (guru/proktor) menambahkan aksi `Generate ulang hasil ujian`.

### Fixed
- Isolasi akses guru pada kelola ujian/naskah agar guru tidak bisa membuka exam/question milik guru lain.
- Coverage test handler untuk kasus akses lintas-guru (forbidden) agar regresi lebih cepat terdeteksi.

## 2026-02-19 - commit `31d53d4`

### Added
- Dashboard role-based untuk `admin`, `proktor`, dan `guru` dengan sidebar + panel konten sesuai role.
- Menu `Dashboard` khusus per role sebagai panel terpisah.
- Fitur token ujian/tes untuk proktor.
- Fitur manajemen ujian dan assignment peserta (termasuk enroll by kelas).
- Integrasi Quill.js untuk authoring konten guru (stimuli, naskah soal, opsi jawaban).
- Dukungan tipe soal authoring: `MC`, `MR`, `TF`.
- Import stimuli via CSV + endpoint template CSV.
- Popup detail error import stimuli + unduh laporan gagal CSV.
- Migrasi database:
  - `000012_exam_access_token`
  - `000013_exam_assignments`

### Changed
- UI Admin:
  - `Daftar Pendaftaran` diganti menjadi `Daftar Pengguna`.
  - Data Master dirapikan menjadi tabel terpisah (`Jenjang`, `Sekolah`, `Kelas`) dengan alur CRUD popup.
  - Pengelolaan pengguna diperluas (detail/tambah/ubah/nonaktifkan) dan relasi sekolah/kelas.
- UI Proktor:
  - Sidebar/menu disesuaikan dengan hak akses proktor.
  - Aksi cepat proktor tidak lagi mengarah ke halaman admin.
- UI Guru:
  - Menu guru disusun ulang dan default membuka menu paling atas.
  - Workflow kisi-kisi -> stimuli -> naskah soal diperjelas.
- Import pengguna:
  - Template import + feedback validasi/error diperjelas.
- Security hardening dev infra:
  - Port `Postgres`, `Redis`, dan `MinIO` pada `docker-compose` dibatasi ke `127.0.0.1`.

### Fixed
- Berbagai konflik layout editor (Quill) yang menimpa tombol aksi form.
- Beberapa ketidaksesuaian menu default halaman role saat pertama dibuka.
- Perbaikan akses dan alur CRUD pada halaman manajemen role.
