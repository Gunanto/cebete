# Rencana Perubahan Stimulus Bersama dan Multi-Soal per Halaman Ujian

## Latar Belakang

Saat ini alur sistem masih berasumsi bahwa:

- satu nomor soal merepresentasikan satu halaman ujian,
- satu payload API `attempt question` hanya memuat satu soal,
- stimulus melekat pada satu soal,
- penyimpanan jawaban dan status ragu dilakukan per `question_id`, tetapi UI attempt hanya menampilkan satu soal aktif.

Kebutuhan baru adalah mendukung satu stimulus yang dipakai oleh beberapa soal berbeda, lalu saat peserta mengerjakan ujian, semua soal yang berbagi stimulus yang sama dan berurutan di urutan ujian tampil pada satu halaman yang sama.

Contoh kebutuhan:

- soal nomor 7 `MC` dan nomor 8 `MR` memiliki stimulus yang sama, maka keduanya tampil pada satu halaman dengan satu stimulus di atas,
- soal nomor 11 `TF`, 12 `MC`, 13 `MR` memiliki stimulus yang sama, maka ketiganya tampil pada satu halaman,
- jika satu stimulus hanya dipakai satu soal, atau soal tidak punya stimulus, perilakunya tetap seperti sekarang: satu soal per halaman.

Dokumen ini merinci rencana perubahan agar kebutuhan tersebut terpenuhi tanpa merusak fungsi-fungsi lama.

## Tujuan

- Mendukung stimulus bersama untuk beberapa soal lintas tipe soal.
- Mendukung authoring guru dengan alur "buat stimulus lalu tambah beberapa soal di bawah stimulus yang sama".
- Mengubah player ujian agar satu halaman dapat memuat beberapa soal yang berbagi stimulus.
- Mempertahankan penyimpanan jawaban, penilaian, dan hasil tetap per `question_id`.
- Menjaga kompatibilitas terhadap data lama dan flow lama selama masa transisi.

## Non-Tujuan

- Tidak mengubah logika scoring inti menjadi berbasis halaman. Scoring tetap berbasis soal.
- Tidak mengubah struktur hasil akhir dari per soal menjadi per halaman.
- Tidak mewajibkan semua soal memiliki stimulus bersama.
- Tidak mengubah seluruh authoring flow sekaligus tanpa fase transisi.

## Kondisi Saat Ini

### Authoring Soal

Saat ini stimulus secara praktis diperlakukan sebagai bagian dari soal atau versi soal. Artinya satu stimulus terikat ke satu butir soal. Ini cukup untuk kasus satu soal satu stimulus, tetapi tidak cukup untuk satu stimulus banyak soal.

### Attempt Peserta

Saat ini flow attempt mengasumsikan:

- summary hanya mengenal `total_questions`,
- frontend mengambil data dengan endpoint berbasis nomor soal,
- satu pemanggilan endpoint hanya memuat satu soal,
- template attempt hanya menyediakan satu area stimulus, satu area stem, dan satu area opsi.

Akibatnya, untuk menampilkan dua atau tiga soal pada satu halaman, backend dan frontend sama-sama perlu diperluas.

## Prinsip Desain

- Penyimpanan jawaban tetap per `question_id`.
- Status `is_doubt` tetap per `question_id`.
- Grouping ke satu halaman hanya terjadi pada layer presentasi attempt, bukan pada layer scoring.
- Grouping hanya berlaku untuk soal-soal yang:
  - memiliki stimulus group yang sama,
  - berada berurutan dalam urutan ujian final.
- Soal tanpa stimulus atau dengan stimulus unik tetap berjalan seperti flow lama.
- Perubahan dilakukan bertahap dan kompatibel terhadap data lama.

## Rancangan Konsep Baru

### 1. Konsep Stimulus Group

Tambahkan konsep `stimulus group` sebagai entitas terpisah dari soal.

Satu `stimulus group` merepresentasikan satu stimulus yang dapat dipakai banyak soal.

Isi utamanya:

- `id`
- `subject_id`
- `title` opsional
- `stimulus_type`
- `stimulus_content`
- `stimulus_html`
- `created_by`
- `created_at`
- `updated_at`
- `is_active`

Alasan:

- stimulus adalah konteks bersama,
- soal adalah turunan dari konteks itu,
- pemisahan ini membuat reuse dan grouping di attempt menjadi eksplisit.

### 2. Relasi Soal ke Stimulus Group

Setiap soal atau versi soal memiliki relasi opsional ke `stimulus_group`.

Pilihan lokasi relasi:

- `questions.stimulus_group_id`
- `question_versions.stimulus_group_id`

Rekomendasi:

- letakkan relasi pada `question_versions`.

Alasan:

- stimulus merupakan bagian dari konten versi,
- perubahan stimulus semestinya membentuk versi baru bila soal sudah memakai versioning,
- lebih aman terhadap histori dan review workflow yang sudah ada.

Konsekuensinya:

- satu question version menunjuk nol atau satu stimulus group,
- satu stimulus group dapat dipakai banyak question version.

### 3. Attempt Page

Tambahkan abstraksi baru di layer ujian: `attempt page`.

`attempt page` bukan entitas database permanen pada tahap awal. Ia dapat dibentuk secara dinamis dari urutan soal final dalam suatu attempt.

Struktur yang diusulkan:

- `page_no`
- `question_nos`
- `stimulus_group_id` opsional
- `stimulus_html`
- `items[]`

Setiap `item` di dalam halaman berisi data soal individual:

- `question_id`
- `seq_no`
- `question_type`
- `stem_html`
- `question_content`
- `answer_key`
- `answer_payload`
- `is_doubt`
- `options`

Dengan model ini:

- halaman attempt bisa berisi 1 soal atau banyak soal,
- penyimpanan dan scoring tetap dilakukan per soal,
- navigasi peserta berpindah per halaman, bukan memaksa satu halaman satu soal.

## Perubahan Data dan Database

## Tabel Baru yang Diusulkan

### `stimulus_groups`

Kolom awal yang diusulkan:

- `id BIGSERIAL PRIMARY KEY`
- `subject_id BIGINT NOT NULL`
- `title VARCHAR(...) NULL`
- `stimulus_type VARCHAR(30) NULL`
- `stimulus_content JSONB NULL`
- `stimulus_html TEXT NULL`
- `created_by BIGINT NOT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMP NOT NULL DEFAULT now()`
- `updated_at TIMESTAMP NOT NULL DEFAULT now()`

Catatan:

- `stimulus_type`, `stimulus_content`, dan `stimulus_html` perlu tetap mendukung format existing agar renderer lama tidak pecah.
- jika sistem sekarang sudah memiliki helper untuk membentuk `stimulus_html` dari structured stimulus, helper itu harus direuse.

### Penambahan kolom pada `question_versions`

Tambahkan:

- `stimulus_group_id BIGINT NULL REFERENCES stimulus_groups(id)`

Catatan kompatibilitas:

- kolom lama `stimulus_type`, `stimulus_content`, `stimulus_html` pada `question_versions` jangan langsung dihapus,
- pada fase awal, field lama tetap dibaca sebagai fallback,
- write path baru perlahan dipindah ke `stimulus_group_id`.

## Strategi Migrasi Data

### Fase 1: Skema Baru

- tambah tabel `stimulus_groups`,
- tambah kolom `question_versions.stimulus_group_id`,
- tambah index yang diperlukan.

### Fase 2: Backfill

Backfill data existing:

- setiap question version lama yang memiliki stimulus sendiri dibuatkan satu `stimulus_group` tersendiri,
- lalu `question_versions.stimulus_group_id` diisi dengan group hasil backfill tersebut,
- question version tanpa stimulus tetap `NULL`.

Keuntungan:

- data lama tetap valid,
- flow baru langsung bisa mengenali soal lama sebagai "group beranggotakan satu soal",
- tampilan attempt lama dan baru dapat hidup berdampingan selama transisi.

### Fase 3: Dual Read

Saat membaca stimulus:

- pertama baca dari `question_versions.stimulus_group_id`,
- bila null, fallback ke field stimulus lama.

### Fase 4: Dual Write Sementara

Saat membuat atau mengedit soal dari UI baru:

- write utama ke `stimulus_group_id`,
- untuk keamanan transisi, masih boleh mirror `stimulus_html` ke field lama jika diperlukan oleh flow lama yang belum dimigrasikan.

### Fase 5: Cleanup

Setelah semua flow authoring, preview, attempt, result, dan import/export sudah stabil:

- evaluasi apakah field lama tetap dipertahankan untuk backward compatibility,
- atau dihapus lewat migrasi terpisah yang aman.

## Perubahan Authoring untuk Guru

## Tujuan UX

Guru seharusnya bisa membuat soal dengan urutan mental berikut:

1. buat stimulus,
2. simpan stimulus,
3. tambahkan beberapa soal di bawah stimulus itu,
4. pilih tipe soal untuk setiap butir,
5. atur urutan soal dalam stimulus,
6. gunakan butir-butir itu ke ujian.

## Rancangan UI Baru

### A. Entry Point Authoring

Tambahkan dua mode pembuatan:

- `Buat Soal Tanpa Stimulus`
- `Buat Stimulus + Soal`

Mode kedua menjadi flow baru utama untuk kebutuhan stimulus bersama.

### B. Editor Stimulus Group

Di mode `Buat Stimulus + Soal`, guru melihat:

- panel stimulus di atas,
- daftar soal di bawah stimulus,
- tombol tambah soal per tipe.

Komponen yang diusulkan:

- `Judul Stimulus` opsional
- `Tipe Stimulus`
- editor stimulus
- tombol:
  - `Tambah Soal MC`
  - `Tambah Soal MR`
  - `Tambah Soal TF`
  - tipe lain bila relevan di masa depan

### C. Subform Soal di Dalam Stimulus

Setelah guru menambah soal, munculkan card per soal berisi:

- label urutan item dalam stimulus,
- tipe soal,
- editor stem,
- editor opsi/jawaban sesuai tipe,
- aksi edit/hapus,
- aksi pindah urutan naik/turun.

### D. Penyimpanan

Pilihan implementasi:

- simpan stimulus dulu baru soal ditambahkan satu per satu,
- atau simpan satu paket stimulus dan semua soal sekaligus.

Rekomendasi tahap awal:

- simpan stimulus group terlebih dahulu,
- lalu setiap penambahan soal menyimpan question version yang mereferensikan `stimulus_group_id`.

Alasan:

- lebih sederhana untuk konsistensi,
- lebih aman bila editor autosave atau koneksi tidak stabil,
- tidak perlu transaksi besar yang menampung banyak subform sekaligus.

### E. Editing Flow

Saat guru membuka stimulus group:

- guru dapat mengedit isi stimulus,
- daftar semua soal yang memakai stimulus itu muncul di bawahnya,
- guru dapat menambah soal baru ke group yang sama,
- guru dapat menghapus atau memindahkan urutan soal di dalam konteks group authoring.

### F. Preview

Tambahkan preview grouped:

- stimulus tampil sekali di atas,
- semua butir yang terkait tampil di bawahnya,
- masing-masing memakai renderer sesuai tipe soal.

Ini penting agar guru bisa memverifikasi hasil authoring sebelum memasukkan ke ujian.

## Kompatibilitas Flow Authoring Lama

Flow lama tidak boleh langsung rusak.

Strategi:

- form lama "buat satu soal dengan stimulus" tetap bisa dipakai,
- saat flow lama dipakai dan soal memiliki stimulus, backend diam-diam membuat `stimulus_group` khusus untuk soal itu,
- sehingga data konsisten dengan model baru,
- UI baru dapat tetap membaca data hasil flow lama.

Dengan cara ini:

- guru yang belum memakai flow baru tidak terdampak,
- implementasi bisa bertahap,
- migrasi user experience menjadi lebih aman.

## Perubahan pada Penyusunan Ujian

## Prinsip

Urutan soal pada ujian tetap dikendalikan oleh `exam_questions.seq_no` atau mekanisme equivalent yang saat ini dipakai.

Grouping ke halaman attempt hanya terjadi bila:

- soal-soal berada berurutan dalam urutan ujian final,
- dan soal-soal tersebut menunjuk `stimulus_group_id` yang sama.

## Aturan Grouping

Misal urutan final setelah randomization:

- 1 no stimulus
- 2 stimulus A
- 3 stimulus A
- 4 stimulus B
- 5 stimulus A

Maka halaman menjadi:

- halaman 1: soal 1
- halaman 2: soal 2 dan 3
- halaman 3: soal 4
- halaman 4: soal 5

Soal 5 tidak boleh digabung ke halaman 2 karena tidak berurutan.

## Pengaruh Randomisasi

Ini area yang paling sensitif terhadap kompatibilitas.

### Jika `randomize_questions = false`

Tidak ada masalah berarti. Grouping tinggal mengikuti `seq_no`.

### Jika `randomize_questions = true`

Ada dua opsi desain:

- shuffle semua soal individual seperti sekarang, lalu group berdasarkan urutan hasil shuffle,
- perlakukan stimulus group sebagai blok, lalu shuffle per blok.

Rekomendasi:

- stimulus group diperlakukan sebagai blok saat randomisasi question order.

Alasan:

- lebih konsisten secara pedagogis,
- mencegah anggota group tercerai berai,
- lebih sesuai dengan ekspektasi guru saat membuat beberapa soal dari satu stimulus.

Konsekuensinya:

- soal tanpa stimulus dianggap blok berukuran satu,
- soal dengan stimulus bersama dianggap satu blok,
- randomizer perlu diubah dari `questionRefs` menjadi `page blocks`.

Catatan:

- ini adalah perubahan perilaku dibanding randomisasi lama,
- perlu disebutkan di release notes dan diuji khusus.

## Perubahan API

## Endpoint Existing yang Perlu Dipertahankan

Endpoint lama jangan langsung dihapus:

- summary attempt lama,
- get attempt question lama,
- save answer per question,
- result endpoints.

Strategi aman:

- pertahankan endpoint lama selama transisi,
- tambahkan endpoint baru untuk model halaman.

## Endpoint Baru yang Diusulkan

### 1. `GET /api/v1/attempts/:id/pages`

Mengembalikan daftar halaman attempt.

Isi minimal:

- `total_pages`
- `pages[]`

Setiap page:

- `page_no`
- `question_nos`
- `question_ids`
- `stimulus_group_id`

Tujuan:

- frontend dapat membangun navigasi halaman dan daftar nomor soal.

### 2. `GET /api/v1/attempts/:id/pages/:pageNo`

Mengembalikan payload lengkap satu halaman attempt.

Isi:

- `page_no`
- `question_nos`
- `stimulus_html`
- `items[]`

Setiap item:

- `question_id`
- `seq_no`
- `question_type`
- `stem_html`
- `question_content`
- `answer_key`
- `answer_payload`
- `is_doubt`
- `options`

### 3. `PUT /api/v1/attempts/:id/pages/:pageNo/answers`

Opsional, untuk save semua jawaban dalam satu halaman sekaligus.

Payload:

- `items[]`

Setiap item:

- `question_id`
- `answer_payload`
- `is_doubt`

Rekomendasi:

- endpoint ini ditambahkan untuk efisiensi frontend,
- namun backend tetap mempertahankan endpoint save answer per question agar kompatibilitas tidak pecah.

## Strategi Implementasi API

Tahap awal:

- tambahkan page builder internal,
- frontend baru memakai endpoint pages,
- endpoint save individual tetap dipakai jika itu lebih aman untuk implementasi awal.

Tahap lanjutan:

- jika diperlukan, tambahkan bulk save per halaman.

## Perubahan Frontend Attempt

## Struktur Tampilan Baru

Ubah area `attempt question flow` agar bisa merender:

- satu stimulus,
- lalu satu atau banyak card soal.

Struktur konseptual:

- `stimulus-box`
- `question-items-container`
  - `question-card item 1`
  - `question-card item 2`
  - `question-card item 3`

## Navigasi

Ada dua opsi:

- navigasi per halaman,
- navigasi per nomor soal tapi beberapa nomor menunjuk halaman yang sama.

Rekomendasi:

- navigasi utama per halaman,
- namun daftar soal tetap menampilkan nomor soal individual.

Contoh tampilan:

- judul halaman: `Halaman 4 | Soal 11-13`
- daftar soal:
  - 11
  - 12
  - 13

Klik nomor 12 tetap membuka halaman yang memuat 11-13 dan meng-scroll ke card soal 12 jika perlu.

Ini menjaga ekspektasi lama pengguna tanpa kehilangan konsep halaman.

## Status Jawaban

Status answered tetap dihitung per soal:

- soal 11 answered
- soal 12 unanswered
- soal 13 answered

Daftar soal tetap menandai status berdasarkan tiap nomor soal, bukan per halaman.

## Status Ragu

Checkbox ragu global harus dihapus atau diubah.

Rekomendasi:

- setiap card soal memiliki toggle `Ragu-ragu` sendiri.

Alasan:

- satu halaman bisa berisi beberapa soal,
- status ragu harus tetap presisi per `question_id`.

## Penyimpanan Jawaban

Saat user:

- pindah halaman,
- klik nomor soal lain,
- submit final,

frontend menyimpan semua item di halaman aktif.

Strategi awal paling aman:

- loop semua item dalam page aktif,
- panggil endpoint save answer existing per `question_id`.

Keuntungan:

- tidak perlu ubah terlalu banyak logic backend save,
- risiko regresi lebih rendah.

Optimisasi berikutnya:

- pindah ke bulk page save jika sudah tersedia.

## Submit Final

Submit final tetap bekerja seperti sekarang:

- semua jawaban sudah tersimpan per question,
- submit hanya menutup attempt dan menjalankan scoring.

Tidak perlu mengubah kontrak submit secara besar.

## Scoring, Result, dan Review

## Scoring

Tidak perlu perubahan arsitektural besar.

Karena:

- jawaban tetap per `question_id`,
- answer key tetap per `question_id`,
- earned score tetap per `question_id`.

Yang perlu diuji:

- soal grouped tetap ikut dinilai satu per satu,
- tidak ada duplikasi atau soal yang terlewat saat page builder aktif.

## Hasil Ujian

Tahap awal:

- hasil boleh tetap tampil per nomor soal seperti sekarang.

Tahap lanjutan opsional:

- jika dua atau tiga soal punya stimulus sama, result page dapat menampilkan stimulus sekali lalu daftar soal di bawahnya.

Ini enhancement, bukan keharusan tahap pertama.

## Review Guru / Preview Ujian

View detail ujian guru sebaiknya juga mendukung preview grouped agar konsisten dengan experience peserta.

Namun untuk menjaga ruang lingkup:

- tahap pertama fokus ke authoring dan attempt,
- preview grouped di modul guru bisa menyusul jika timebox terbatas.

## Backward Compatibility

Ini syarat utama dokumen ini.

## Prinsip Kompatibilitas

- endpoint lama tetap tersedia selama transisi,
- data lama tetap dapat dibaca,
- soal lama tetap valid tanpa migrasi manual dari pengguna,
- flow lama guru tetap bisa dipakai,
- scoring lama tetap dipertahankan.

## Area yang Harus Dijaga

### 1. Import / Export Soal

Jika ada import/export yang saat ini membaca `stimulus_html` langsung dari question version:

- perlu ditambah mapping ke `stimulus_group`,
- tetapi fallback ke field lama harus tetap ada.

### 2. Preview Soal Guru

Komponen yang sekarang menampilkan detail satu soal:

- tetap bisa membaca stimulus dari relasi group,
- bila tidak ada group, fallback ke field lama.

### 3. Bank Soal Existing

Semua soal lama harus tetap:

- bisa diedit,
- bisa dimasukkan ke ujian,
- bisa dikerjakan,
- bisa dinilai,
- bisa ditampilkan hasilnya.

### 4. Randomisasi Soal

Perubahan randomisasi harus berhati-hati agar:

- attempt lama yang sudah berjalan tidak berubah perilakunya,
- hanya attempt baru setelah release yang memakai block grouping baru,
- deterministic ordering per attempt tetap terjaga.

Rekomendasi:

- builder urutan final soal/halaman harus menggunakan seed deterministik yang sama seperti sekarang,
- namun unit pengacakan berubah menjadi blok bila soal punya stimulus group bersama.

### 5. Anti-Cheat dan Event Logging

Flow event logging attempt tidak boleh pecah hanya karena satu halaman berisi banyak soal.

Karena event logging saat ini bersifat attempt-level, kemungkinan besar aman, tetapi:

- navigasi nomor soal mungkin berubah menjadi navigasi halaman,
- payload event jika memuat nomor soal aktif perlu diperbarui agar bisa memuat `page_no` dan `visible_question_nos`.

## Tahapan Implementasi yang Direkomendasikan

## Tahap 1: Fondasi Data

- tambah tabel `stimulus_groups`,
- tambah kolom `question_versions.stimulus_group_id`,
- tambah helper service untuk load stimulus dari group atau fallback lama,
- tambah migrasi backfill.

Output tahap ini:

- model data baru tersedia,
- tidak ada perubahan UI besar dulu,
- sistem existing tetap jalan.

## Tahap 2: Authoring Backend

- tambah CRUD stimulus group,
- tambah create question version yang mereferensikan stimulus group,
- pertahankan flow create/update lama dengan adapter compatibility.

Output tahap ini:

- backend siap melayani UI guru baru,
- flow lama masih jalan.

## Tahap 3: UI Guru Baru

- tambahkan mode `Buat Stimulus + Soal`,
- render daftar soal di bawah stimulus,
- tambah tombol `Tambah Soal MC/MR/TF`,
- tambah urutan item dalam stimulus group,
- tambah preview grouped.

Output tahap ini:

- guru sudah bisa membuat beberapa soal dari satu stimulus.

## Tahap 4: Attempt Page Builder Backend

- buat builder halaman dari urutan soal final,
- dukung grouping berdasarkan `stimulus_group_id`,
- pertahankan endpoint question lama,
- tambahkan endpoint pages baru.

Output tahap ini:

- backend siap untuk UI attempt grouped.

## Tahap 5: Frontend Attempt Baru

- ubah halaman attempt untuk render banyak soal pada satu halaman,
- ubah navigasi ke page-aware,
- ubah save current menjadi save semua item di halaman,
- ubah UI ragu menjadi per soal.

Output tahap ini:

- peserta dapat melihat beberapa soal dalam satu halaman dengan stimulus bersama.

## Tahap 6: Hardening dan Cleanup

- tambah test regresi,
- evaluasi endpoint lama,
- evaluasi field stimulus lama,
- rapikan preview dan result grouped jika diperlukan.

## Risiko dan Mitigasi

## Risiko 1: Regresi Flow Attempt Lama

Risiko:

- peserta gagal memuat soal,
- daftar soal/navigasi tidak sinkron,
- submit final tidak menyimpan semua jawaban.

Mitigasi:

- endpoint lama tetap hidup sampai frontend baru stabil,
- simpan jawaban tetap per `question_id`,
- tambahkan integration test attempt grouped dan non-grouped.

## Risiko 2: Randomisasi Memecah Group

Risiko:

- soal yang seharusnya satu stimulus terpisah halaman.

Mitigasi:

- ubah randomizer agar bekerja pada blok, bukan per soal individual, untuk stimulus group yang sama.

## Risiko 3: Editing Soal Lama Menjadi Tidak Konsisten

Risiko:

- soal lama yang punya field stimulus lama tetapi belum punya group tidak tampil benar di editor baru.

Mitigasi:

- lakukan backfill,
- tetap siapkan fallback read logic.

## Risiko 4: Checkbox Ragu Menjadi Ambigu

Risiko:

- satu halaman banyak soal tetapi hanya ada satu state ragu.

Mitigasi:

- ubah state ragu menjadi per card soal di UI.

## Risiko 5: Import / Export Tidak Sinkron

Risiko:

- stimulus group hilang saat export/import.

Mitigasi:

- perluasan skema import/export dengan fallback ke stimulus inline.

## Kebutuhan Testing

## Unit Test

- builder stimulus resolution dari group dan fallback lama,
- page builder dari urutan soal normal,
- page builder dengan stimulus group bersama,
- page builder dengan soal tanpa stimulus,
- randomizer berbasis blok.

## Integration Test

- attempt dengan 2 soal `MC + MR` satu stimulus menjadi satu halaman,
- attempt dengan 3 soal `TF + MC + MR` satu stimulus menjadi satu halaman,
- attempt dengan satu soal satu stimulus tetap satu halaman,
- attempt dengan soal tanpa stimulus tetap satu halaman,
- soal dengan stimulus sama tetapi tidak berurutan tidak digabung,
- save jawaban untuk halaman berisi beberapa soal,
- submit final setelah ada jawaban campuran di satu halaman.

## UI / Smoke Test

- guru membuat stimulus lalu menambah beberapa soal di bawahnya,
- guru edit stimulus bersama dan semua turunan tetap tampil,
- peserta navigasi dari halaman grouped ke halaman non-grouped,
- daftar soal tetap menunjukkan status answered/doubt per nomor,
- review hasil tidak rusak.

## Keputusan Desain yang Direkomendasikan

Untuk implementasi awal, keputusan berikut direkomendasikan:

- Gunakan entitas baru `stimulus_groups`.
- Simpan relasi pada `question_versions.stimulus_group_id`.
- Pertahankan field stimulus lama selama masa transisi.
- Grouping halaman attempt hanya untuk soal berurutan dengan `stimulus_group_id` yang sama.
- Randomisasi soal untuk stimulus group dilakukan per blok.
- Save jawaban tetap per `question_id`.
- Status ragu di UI menjadi per soal.
- Endpoint lama dipertahankan sementara endpoint baru berbasis halaman ditambahkan.

## Ringkasan Eksekusi

Perubahan ini layak dilakukan, tetapi menyentuh beberapa lapisan inti:

- data model,
- authoring guru,
- randomisasi urutan ujian,
- player attempt,
- kompatibilitas data dan endpoint lama.

Agar fungsi lama tidak rusak, implementasi harus bertahap dengan prinsip:

- dual read,
- dual write sementara,
- endpoint lama tetap tersedia,
- scoring tetap per soal,
- data lama dibackfill, bukan dipaksa migrasi manual oleh pengguna.

Dengan pendekatan tersebut, kebutuhan baru dapat dipenuhi tanpa membongkar total fondasi scoring dan attempt yang sudah ada.
