# FRONTEND_STEP.md

Dokumen ini adalah peta kerja frontend CBT LMS yang selaras dengan `BACKEND_STEP.md`. Fokus utama: ringan, cepat, stabil, dan aman untuk skenario ujian nyata.

## Cara membaca dokumen ini
- Urutan pengerjaan: dari `Step 1` ke `Step 12`.
- Tiap step berisi:
  - Tujuan
  - Ruang lingkup
  - Implementasi teknis
  - Endpoint yang dipakai
  - Checklist selesai
  - Risiko umum

---

## Step 1 - Fondasi UI, layout, dan design token

## Tujuan
Menetapkan pondasi visual konsisten agar semua halaman CBT mudah dikembangkan dan tetap ringan.

## Ruang lingkup
- Layout dasar: topbar, container, card, grid.
- Design tokens CSS (warna, spacing, radius, font scale).
- Struktur template SSR.

## Implementasi teknis
- Gunakan template utama `web/templates/layout/base.html`.
- Definisikan variabel CSS di `:root` pada `web/static/css/app.css`.
- Pertahankan ukuran bundle kecil:
  - tanpa framework frontend berat
  - minim library eksternal

## Endpoint yang dipakai
- Tidak ada endpoint khusus (setup sisi presentasi).

## Checklist selesai
- Semua halaman memakai layout konsisten.
- Tidak ada inline style yang berulang.
- Tampilan tetap rapi di desktop dan mobile.

## Risiko umum
- CSS tumbuh tanpa struktur.
- Komponen antar halaman tidak konsisten.

---

## Step 2 - Halaman login + session awareness

## Tujuan
Memberikan alur login yang jelas, cepat, dan tidak membingungkan user.

## Ruang lingkup
- Halaman `/login`.
- Redirect otomatis jika sudah login.
- Status user pada navbar + tombol logout.

## Implementasi teknis
- Form login kirim ke `POST /api/v1/auth/login-password`.
- Cek sesi aktif via `GET /api/v1/auth/me`.
- Logout via `POST /api/v1/auth/logout`.
- Tampilkan error ramah user tanpa bocor detail teknis.

## Endpoint yang dipakai
- `POST /api/v1/auth/login-password`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

## Checklist selesai
- User belum login diarahkan ke `/login` untuk halaman privat.
- User sudah login tidak perlu login ulang.
- Tombol logout benar-benar menghapus sesi.

## Risiko umum
- Redirect loop karena pengecekan auth tidak konsisten.
- State auth di UI tidak sinkron dengan backend.

---

## Step 3 - Halaman simulasi (pilih jenjang, tipe, mapel, exam)

## Tujuan
Membuat entry point ujian yang simpel dan minim error input.

## Ruang lingkup
- Dropdown berantai: level -> type -> subject -> exam.
- Tombol `Mulai Simulasi` aktif hanya saat pilihan valid.

## Implementasi teknis
- Load subject dari `GET /api/v1/subjects`.
- Load exam dari `GET /api/v1/exams?subject_id=...`.
- Start ujian via `POST /api/v1/attempts/start`.
- Disable control saat data belum siap.

## Endpoint yang dipakai
- `GET /api/v1/subjects`
- `GET /api/v1/exams`
- `POST /api/v1/attempts/start`

## Checklist selesai
- Tidak bisa submit jika exam belum dipilih.
- Error API tampil jelas di area pesan.
- Start attempt berhasil langsung redirect ke halaman ujian.

## Risiko umum
- Data stale saat user ganti dropdown cepat.
- Tombol start aktif padahal data belum valid.

---

## Step 4 - Halaman pengerjaan ujian dua panel

## Tujuan
Meniru UX referensi CBT: kiri stimulus, kanan soal+jawaban, dengan navigasi cepat.

## Ruang lingkup
- Header status ujian dan timer.
- Panel stimulus + panel pertanyaan/opsi.
- Aksi `sebelumnya`, `berikutnya`, `ragu-ragu`, `submit`.

## Implementasi teknis
- Render soal per nomor dari backend.
- Simpan jawaban otomatis saat berubah (autosave).
- Simpan status ragu-ragu terpisah.
- Gunakan server remaining time sebagai sumber utama.

## Endpoint yang dipakai
- `GET /api/v1/attempts/{id}`
- `GET /api/v1/attempts/{id}/questions/{no}`
- `PUT /api/v1/attempts/{id}/answers/{question_id}`
- `POST /api/v1/attempts/{id}/submit`

## Checklist selesai
- User bisa pindah nomor tanpa kehilangan jawaban.
- Timer tampil stabil.
- Submit final berhasil dan redirect ke hasil.

## Risiko umum
- Autosave terlalu sering membebani server.
- Perpindahan soal gagal saat jaringan lambat.

---

## Step 5 - Render per tipe soal (pg tunggal, multi, benar/salah pernyataan)

## Tujuan
Menyatukan standar render agar format jawaban selalu sesuai kontrak backend.

## Ruang lingkup
- `pg_tunggal`
- `multi_jawaban`
- `benar_salah_pernyataan`

## Implementasi teknis
- `pg_tunggal`: radio.
- `multi_jawaban`: checkbox (exact match policy di backend).
- `benar_salah_pernyataan`: radio benar/salah per statement id.
- Payload harus sesuai spesifikasi backend.

## Endpoint yang dipakai
- `PUT /api/v1/attempts/{id}/answers/{question_id}`

## Checklist selesai
- Format payload per tipe selalu valid.
- Kondisi kosong/malformed ditangani tanpa crash UI.

## Risiko umum
- Mapping `statement.id` salah.
- Perubahan tipe soal tidak ikut update renderer.

---

## Step 6 - Halaman hasil/review sesuai review policy

## Tujuan
Menyajikan hasil dengan aturan yang benar (termasuk pembatasan `review_policy`).

## Ruang lingkup
- Ringkasan nilai.
- Tabel detail per nomor.
- Pesan jika review belum diizinkan.

## Implementasi teknis
- Ambil data dari `GET /api/v1/attempts/{id}/result`.
- Jika backend mengembalikan forbidden/policy block, tampilkan alasan yang human-readable.
- Hindari menampilkan kunci bila policy melarang.

## Endpoint yang dipakai
- `GET /api/v1/attempts/{id}/result`

## Checklist selesai
- Hasil tampil lengkap jika diizinkan.
- UI tetap informatif saat akses review dibatasi.

## Risiko umum
- Frontend bocorkan data review yang seharusnya ditutup policy.

---

## Step 7 - Halaman authoring (MVP internal)

## Tujuan
Menyediakan antarmuka minimum untuk guru/admin menyusun konten soal.

## Ruang lingkup
- Stimulus create/list.
- Version create/finalize/list.
- Parallel create/list.

## Implementasi teknis
- Tetap SSR + JS ringan.
- Tampilkan output API terstruktur agar mudah debug.
- Batasi akses untuk role `admin/proktor/guru`.

## Endpoint yang dipakai
- `POST /api/v1/stimuli`
- `GET /api/v1/stimuli`
- `POST /api/v1/questions/{id}/versions`
- `POST /api/v1/questions/{id}/versions/{version}/finalize`
- `GET /api/v1/questions/{id}/versions`
- `POST /api/v1/exams/{id}/parallels`
- `GET /api/v1/exams/{id}/parallels`

## Checklist selesai
- Semua form authoring bisa submit sukses.
- Error validasi backend tampil jelas.

## Risiko umum
- UX terlalu teknis untuk pengguna non-teknis.

---

## Step 8 - Workflow review/telaah di frontend

## Tujuan
Memfasilitasi reviewer melakukan approve/revisi secara terstruktur.

## Ruang lingkup
- Daftar review task.
- Form keputusan: `disetujui` / `perlu_revisi`.
- Komentar alasan revisi.

## Implementasi teknis
- Filter task by status/reviewer.
- Wajibkan alasan saat status `perlu_revisi`.
- Tampilkan riwayat komentar per soal.

## Endpoint yang dipakai
- `POST /api/v1/reviews/tasks`
- `POST /api/v1/reviews/tasks/{id}/decision`
- `GET /api/v1/reviews/tasks`
- `GET /api/v1/questions/{id}/reviews`

## Checklist selesai
- Reviewer hanya melihat task yang relevan.
- Alasan revisi mudah dilacak.

## Risiko umum
- Keputusan review tidak jelas akibat UI yang ambigu.

---

## Step 9 - Anti-cheat event hooks di client

## Tujuan
Mendukung mitigasi kecurangan praktis tanpa mengganggu UX berlebihan.

## Ruang lingkup
- Deteksi blur/focus/tab switch.
- Deteksi reconnect.
- (Opsional) deteksi fullscreen exit.

## Implementasi teknis
- Gunakan event browser (`visibilitychange`, `blur`, `focus`, `online`, `offline`).
- Kirim event secara throttled.
- Jangan hard-fail ujian hanya karena 1 event.

## Endpoint yang dipakai
- Endpoint event anti-cheat (sesuai implementasi backend Step 7).

## Checklist selesai
- Event utama tercatat per attempt.
- UI memberi notifikasi ringan, bukan blocking agresif.

## Risiko umum
- False positive tinggi.
- Logging terlalu verbose.

---

## Step 10 - Konsistensi error, loading state, dan aksesibilitas

## Tujuan
Meningkatkan kualitas UX operasional saat trafik tinggi dan koneksi tidak stabil.

## Ruang lingkup
- Error model konsisten.
- Loading state di semua aksi async.
- Accessibility dasar.

## Implementasi teknis
- Buat helper UI untuk status `loading/success/error`.
- Pastikan kontras, focus state, label form, dan keyboard navigation minimal.
- Gunakan pesan yang singkat dan kontekstual.

## Endpoint yang dipakai
- Semua endpoint yang sudah ada.

## Checklist selesai
- Tidak ada aksi async yang tanpa feedback.
- Form bisa dipakai keyboard-only.

## Risiko umum
- User bingung karena pesan error terlalu teknis.

---

## Step 11 - Performance frontend dan hardening asset

## Tujuan
Menjaga UI tetap cepat di perangkat lab sekolah dengan spesifikasi rendah.

## Ruang lingkup
- Optimasi JS/CSS.
- Optimasi asset gambar.
- Cache strategy.

## Implementasi teknis
- Hindari library besar.
- Kompres gambar dan gunakan dimensi tepat.
- Atur cache static asset via reverse proxy.

## Endpoint yang dipakai
- `GET /static/*`

## Checklist selesai
- Waktu render awal cepat pada koneksi standar sekolah.
- Interaksi inti tidak lag.

## Risiko umum
- CSS/JS membesar tanpa kontrol.

---

## Step 12 - Testing frontend + release checklist

## Tujuan
Memastikan frontend aman dipakai ujian live.

## Ruang lingkup
- Test manual terstruktur + smoke test otomatis minimal.
- Dokumentasi runbook frontend.

## Implementasi teknis
- Buat checklist UAT:
  - login
  - simulasi
  - attempt
  - autosave
  - submit
  - result
  - authoring/review internal
- Tambahkan smoke test sederhana untuk route kritikal.

## Endpoint yang dipakai
- Semua endpoint utama CBT.

## Checklist selesai
- Alur end-to-end lulus dari sisi UI.
- Ada daftar known issues dan mitigasi sementara.

## Risiko umum
- Bug kecil UI muncul saat load puncak karena kurang uji skenario nyata.

---

## Prioritas eksekusi praktis

1. Step 1-4: fondasi UI + login + simulasi + halaman ujian.
2. Step 5-6: renderer tipe soal + hasil/review policy.
3. Step 7-8: authoring + review workflow.
4. Step 9-12: anti-cheat client, kualitas UX, performa, testing release.

---

## Deliverables per milestone

## Milestone A (Frontend Core)
- Login/logout UI stabil.
- Halaman simulasi dan ujian utama jalan.
- Submit dan hasil dapat diakses.

## Milestone B (Authoring + Review UI)
- Authoring stimulus/versi/paralel dapat dipakai.
- Reviewer bisa memutuskan approve/revisi.

## Milestone C (Hardening Produksi)
- UX error/loading konsisten.
- Performa dan cache static membaik.
- UAT checklist lulus untuk go-live.

