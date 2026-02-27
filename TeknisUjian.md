# Teknis Ujian: Kelola Soal Berbasis Kode

Dokumen ini adalah panduan uji fitur `Kode Soal` dan enroll soal ke ujian berbasis kode pada halaman `/guru`.

## Tujuan
- Memastikan CRUD `Kode Soal` berjalan baik.
- Memastikan pembuatan naskah bisa mengikat `question_code_id`.
- Memastikan enroll soal ke ujian via rule kode berjalan akurat.
- Memastikan penghapusan rule memengaruhi hasil sinkronisasi berikutnya.

## Prasyarat
- Sudah login sebagai `guru`.
- Sudah ada data `Mapel` dan `Tujuan Pembelajaran`.
- Aplikasi berjalan normal (`go run ./cmd/web`).
- Migrasi terbaru sudah diterapkan (`./scripts/migrate.sh up`).

## Skenario A: CRUD Kode Soal
1. Buka menu `Naskah Soal`.
2. Di blok `Kode Soal`, pilih `Mapel`.
3. Isi:
   - `Kode Soal`: `Math-001`
   - `Nama Kode`: bebas (contoh: `Paket Dasar Aljabar`)
4. Klik `Simpan Kode Soal`.
5. Verifikasi data muncul pada tabel `Kode Soal`.
6. Lakukan `Edit` pada data yang baru dibuat, lalu simpan.
7. Lakukan `Hapus` pada salah satu data untuk verifikasi delete.

### Expected Result
- Proses simpan/edit/hapus berhasil tanpa error.
- Tabel `Kode Soal` ter-update sesuai aksi terakhir.
- Jika diuji dengan akun guru lain, kode milik guru lain tidak tampil.

## Skenario B: Buat Naskah Dengan Kode Soal
1. Masih di menu `Naskah Soal`, pada form naskah isi:
   - `Mapel`
   - `Tujuan Pembelajaran`
   - `Kode Soal` (`Math-001`)
   - konten `Stem`, opsi jawaban, dan kunci jawaban.
2. Klik `Simpan Draft Naskah`.

### Expected Result
- Jika `Soal` belum dipilih, sistem membuat question baru otomatis.
- Question baru tersimpan dengan `question_code_id` sesuai pilihan.
- Pada dropdown `Soal`, label menampilkan kode, contoh: `[Math-001]`.
- Draft naskah tersimpan normal.

## Skenario C: Enroll Ujian Via Kode Soal
1. Buka menu `Kelola Ujian`.
2. Pilih ujian dari tabel (aksi `Pilih Ujian`).
3. Pada blok `Enroll Soal via Kode`:
   - Pastikan `Exam ID` terisi otomatis.
   - Pilih `Kode Soal` (`Math-001`).
   - Pilih strategi:
     - `all`, atau
     - `random` + isi `pick_count`.
   - Isi `Bobot`.
4. Klik `Simpan Rule Kode`.
5. Klik `Sinkronkan Soal dari Rule Kode`.
6. Klik `Muat Soal Ujian Terpilih`.

### Expected Result
- Rule tampil pada tabel rule kode soal ujian.
- Hasil sync memasukkan soal sesuai rule.
- Untuk strategi `random`, jumlah soal sesuai `pick_count`.
- Untuk strategi `all`, semua soal berkode terkait masuk ke ujian.

## Skenario D: Hapus Rule Kode Soal
1. Hapus salah satu rule pada tabel rule kode soal ujian.
2. Jalankan lagi `Sinkronkan Soal dari Rule Kode`.

### Expected Result
- Rule berhasil terhapus dari tabel.
- Hasil sinkronisasi berikutnya mengikuti rule yang tersisa.

## Catatan Validasi Tambahan
- Pastikan semua aksi menampilkan feedback sukses/gagal yang jelas di UI.
- Jika terjadi error, catat pesan error UI dan log terminal untuk analisis.
- Uji minimal 2 kode soal berbeda agar skenario `all` dan `random` mudah diverifikasi.

## Monitoring Event Ujian (`/proktor`)

Menu `Monitoring Event` dipakai untuk pengawasan teknis sesi ujian per peserta (`Attempt ID`), bukan untuk mengerjakan ujian.

### Fungsi Dalam Ujian
- Mendeteksi indikasi perilaku tidak normal saat ujian.
- Membantu investigasi insiden per attempt.
- Menyediakan jejak audit (timestamp server + payload event) untuk tindak lanjut proktor/guru.

### Cara Kerja
1. Proktor mengisi `Attempt ID`.
2. Proktor mengisi `Limit Event` (jumlah event yang ingin ditarik).
3. Klik `Muat Event`.
4. Sistem memanggil endpoint:
   - `GET /api/v1/attempts/{attempt_id}/events?limit={limit}`
5. Data diambil dari tabel `attempt_events`, urutan terbaru ke terlama (`server_ts DESC`).

### Arti Kolom Tabel
- `Waktu Server`: waktu event diterima server.
- `Event`: tipe event.
- `Actor`: user id pengirim event (umumnya siswa pemilik attempt).
- `Payload`: detail event dalam format JSON.

### Jenis Event Yang Umum Tercatat
- `tab_blur`
- `reconnect`
- `rapid_refresh`
- `fullscreen_exit`

### Catatan Penting
- Panel ini tidak auto-refresh live. Data baru muncul setelah klik `Muat Event` lagi.
- Jika `Attempt ID` valid tapi belum ada event, tabel bisa kosong.
- Jika `Attempt ID` tidak ditemukan, sistem mengembalikan error `attempt not found`.
- Jika `limit` di luar batas, backend menormalkan ke nilai aman internal (maksimum 500, default internal 200).

### Skenario Uji Cepat Monitoring Event
1. Buka menu `Monitoring Event` di `/proktor`.
2. Isi `Attempt ID` yang aktif.
3. Isi `Limit Event` (contoh: `100`).
4. Klik `Muat Event`.

#### Expected Result
- Tabel menampilkan event attempt sesuai data terbaru.
- Urutan dari event paling baru ke paling lama.
- Jika tidak ada data event, tampil pesan data kosong.

## Manajemen Attempt Ujian

Bagian ini menjelaskan pengaturan jumlah attempt per ujian dan reset attempt peserta.

### Konsep Attempt
- `Attempt` adalah satu sesi pengerjaan ujian oleh satu peserta pada satu exam.
- Attempt aktif berstatus `in_progress`.
- Jika peserta masih punya attempt `in_progress`, sistem melanjutkan attempt tersebut (tidak membuat attempt baru).

### Pengaturan Maksimal Attempt
- Setiap ujian memiliki `max_attempts` (minimal `1`).
- Field `Maks Attempt` tersedia di form `Kelola Ujian` (`/guru` dan `/proktor`).
- Saat start ujian:
  - jika jumlah attempt peserta pada exam masih di bawah `max_attempts`, attempt baru bisa dibuat;
  - jika sudah mencapai batas, start ditolak (`jumlah attempt ujian sudah mencapai batas`).

### Reset Attempt Per Peserta
- Tujuan reset: menghapus attempt terbaru peserta pada exam tertentu agar peserta bisa mengulang sesuai kebijakan.
- Endpoint:
  - `POST /api/v1/admin/exams/{id}/attempts/reset`
  - body: `{ "student_id": <id> }`
- UI tersedia di `/proktor` > `Hasil Ujian`:
  - form `Exam ID` + `Student ID`
  - tombol `Reset Attempt Peserta`

### Hak Akses
- Atur `max_attempts`: `admin`, `proktor`, `guru` (sesuai hak kelola ujian).
- Reset attempt peserta: `admin` dan `proktor`.

### Catatan Operasional
- Reset menghapus attempt terbaru peserta pada exam tersebut.
- Setelah reset, peserta dapat start lagi jika total attempt yang tersisa masih memenuhi aturan `max_attempts`.
- Simpan data investigasi terlebih dahulu (nilai/event) sebelum reset bila diperlukan audit.

### Skenario Uji Attempt
1. Buat/ubah ujian dengan `Maks Attempt = 2`.
2. Peserta mulai ujian, submit attempt pertama.
3. Peserta mulai lagi, submit attempt kedua.
4. Coba mulai ketiga kali.

#### Expected Result
- Attempt ke-1 dan ke-2 berhasil.
- Attempt ke-3 ditolak karena melewati batas.

### Skenario Uji Reset Attempt
1. Di `/proktor` > `Hasil Ujian`, isi `Exam ID` dan `Student ID`.
2. Klik `Reset Attempt Peserta`.
3. Minta peserta start ulang ujian.

#### Expected Result
- Reset berhasil dengan feedback `Attempt ID` yang dihapus.
- Peserta dapat start lagi sesuai batas attempt yang berlaku.
