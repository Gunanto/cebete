# Catatan Refactor (lanjut besok)

## Status saat ini
- **Selesai dipisah ke modul**:
  - `import_parser.js`
  - `question_codes.js`
  - `manuscript_import.js`
  - `manuscript_table.js`
  - `blueprints.js`
  - `learning_goals.js`
  - `guru_exams.js`
  - `proktor_exams.js`
  - `proktor_cards.js`
  - `proktor_attendance.js`
  - `proktor_token.js`
  - `proktor_events.js`
  - `proktor_registrations.js`
  - `proktor_master.js`
  - `proktor_placement.js`
  - `proktor_dashboard.js`
  - `proktor_quick.js`
  - `admin_users.js`
  - `admin_master.js`
- **app.js** sekarang memanggil modul-modul di atas lewat wrapper minimal dan `init*Module`.
- **manuscript_table.js** sudah aktif di layout, menyediakan `init`, `render`, `reloadByCurrentScope`, `getCount`, `setPage`.
- **Ujian proktor, kartu, daftar hadir, token, event, registrasi, master, placement, dashboard** sudah dipisah ke modul.
- **Admin users + admin master** sudah dipisah ke modul.

## Fokus refactor berikutnya (pilih salah satu)
1. **Admin dashboard**: stats + ringkasan + menu jump.
2. **Admin registrations**: filter + approve/reject.
3. **Guru**: sisa bagian selain learning goals & exams.
4. **Proktor**: tinggal panel/menu kecil yang belum dipisah (kalau ada).

## Catatan teknis penting
- Script baru harus ditambahkan ke `web/templates/layout/base.html` sebelum `app.js`.
- Gunakan pola modul yang sama seperti `question_codes.js` dan `manuscript_table.js`:
  - IIFE + `window.ModuleName = { init, ... }`
  - `init` menerima `deps` dari `app.js`.
  - Hindari dependency silang langsung ke global, lewat `deps` saja.
- Di `app.js`, batasi perubahan ke:
  - wrapper fungsi yang memanggil modul
  - `initXModule()`
  - penggantian penggunaan state lokal ke modul (misalnya `getCount()`)
- Tetap jaga behavior: jangan ubah endpoint API, payload, atau UI text.

## Tempat yang perlu disentuh jika melanjutkan
- `web/static/js/app.js`:
  - Cari blok besar sesuai area (Admin Dashboard/Registrations/Guru/Proktor).
  - Pindahkan fungsi render + event listener ke modul baru.
- `web/templates/layout/base.html`:
  - Tambahkan `<script src="/static/js/<module>.js?v={{.AssetVersion}}" defer></script>`.

## Saran urutan paling aman
1. **Admin registrations** (blok jelas, kecil).
2. **Admin dashboard** (data read-only).
3. **Guru** (lebih besar dan banyak dependency).

## Hasil test terakhir
- `go test ./internal/app -run TestFrontendSmokePublicRoutes -v` (PASS, 2026-03-03 06:21 Asia/Jakarta).

## Next step options
1. Manual admin flow checklist (users + master).
2. Continue refactor admin dashboard or registrations.
3. Review current changes for risks.
