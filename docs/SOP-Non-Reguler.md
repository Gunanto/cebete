# SOP Peserta Non-Reguler

Dokumen ini berisi SOP operator dan flowchart alur peserta non-reguler dari pendaftaran sampai mulai ujian.

## 1. Tujuan

Memastikan peserta non-reguler:
- berhasil mendaftar dengan email aktif,
- diverifikasi oleh proktor/admin,
- dapat login setelah akun aktif,
- dan dapat mendaftar ke ujian aktif sebelum mulai ujian.

## 2. Peran

- Peserta non-reguler: mendaftar, verifikasi OTP, login, dan memilih ujian.
- Proktor/admin: memeriksa data pendaftaran dan menyetujui atau menolak.

## 3. SOP Operator

### A. Tahap Pendaftaran Peserta

1. Arahkan peserta membuka halaman `Login`.
2. Minta peserta memilih `Daftar via OTP Email`.
3. Pastikan peserta memasukkan email aktif yang benar.
4. Peserta klik `Kirim OTP ke Email`.
5. Pastikan peserta menerima OTP pendaftaran di email.
6. Minta peserta memasukkan 6 digit OTP pendaftaran.
7. Setelah OTP valid, peserta melanjutkan ke form data.
8. Pastikan peserta mengisi data dengan lengkap:
   - nama lengkap,
   - email,
   - nama sekolah,
   - NPSN,
   - kabupaten,
   - provinsi,
   - kelas,
   - nomor HP bila dipakai.
9. Peserta mengirim pendaftaran.
10. Operator menjelaskan bahwa akun belum aktif sebelum disetujui proktor/admin.

### B. Tahap Verifikasi Oleh Proktor/Admin

1. Buka daftar pendaftaran non-reguler yang statusnya `pending`.
2. Cek kelengkapan dan kewajaran data peserta.
3. Bila data benar, klik `approve` atau ceklis persetujuan.
4. Setelah approve, pastikan sistem:
   - membuat atau mengaktifkan akun peserta,
   - menandai email sebagai terverifikasi,
   - mengubah status akun menjadi `active`,
   - membuat data sekolah/kelas/enrollment bila peserta adalah siswa non-reguler.
5. Sampaikan ke peserta bahwa akun sudah aktif.

### C. Tahap Login Pertama Setelah Disetujui

1. Setelah approve, sistem mengirim email persetujuan ke peserta.
2. Email itu berisi tautan `login pertama`.
3. Minta peserta membuka email persetujuan tersebut.
4. Peserta klik tautan login pertama.
5. Sistem membuat session login otomatis.
6. Peserta langsung diarahkan ke halaman `Ujian`.

Catatan operator:
- OTP pendaftaran hanya dipakai satu kali saat verifikasi email pendaftaran.
- Setelah approve, peserta tidak perlu memasukkan OTP kedua untuk login pertama.
- Tautan login pertama hanya berlaku sekali dan memiliki batas waktu.

### D. Tahap Memilih Ujian

1. Setelah login, peserta masuk ke halaman `Ujian`.
2. Untuk akun non-reguler, pastikan tombol `Daftar Ujian Non-Reguler` muncul.
3. Peserta klik tombol tersebut.
4. Sistem menampilkan daftar ujian yang sedang aktif.
5. Peserta memilih ujian yang ingin diikuti.
6. Peserta klik `Daftar`.
7. Sistem melakukan self-enroll peserta ke ujian itu.

### E. Tahap Mulai Ujian

1. Setelah self-enroll berhasil, peserta kembali ke panel pemilihan ujian.
2. Peserta memilih ujian yang sudah didaftarkan.
3. Bila ujian memakai token, peserta harus meminta token ke proktor.
4. Peserta memasukkan token ujian.
5. Sistem menampilkan konfirmasi data peserta.
6. Bila data benar, peserta lanjut.
7. Sistem menampilkan informasi ujian.
8. Peserta klik mulai.
9. Ujian berjalan.

## 4. Flowchart Panah Per Langkah

### A. Flow Pendaftaran Sampai Approve

`Login`  
-> `Daftar via OTP Email`  
-> `Masukkan email aktif`  
-> `Kirim OTP ke Email`  
-> `Buka email peserta`  
-> `Masukkan OTP pendaftaran`  
-> `Verifikasi OTP pendaftaran`  
-> `Isi form data siswa non-reguler`  
-> `Kirim pendaftaran`  
-> `Status pending`  
-> `Proktor/admin cek data`  
-> `Approve/ceklis`  
-> `Akun aktif`

### B. Flow Login Setelah Approve

`Akun sudah aktif`  
-> `Sistem kirim email persetujuan`  
-> `Peserta buka email persetujuan`  
-> `Klik tautan login pertama`  
-> `Session login dibuat otomatis`  
-> `Masuk ke halaman Ujian`

### C. Flow Memilih dan Memulai Ujian

`Halaman Ujian`  
-> `Klik Daftar Ujian Non-Reguler`  
-> `Lihat daftar ujian aktif`  
-> `Klik Daftar pada ujian yang dipilih`  
-> `Self-enroll berhasil`  
-> `Pilih ujian`  
-> `Masukkan token jika diminta`  
-> `Konfirmasi data peserta`  
-> `Lihat informasi ujian`  
-> `Mulai ujian`

## 5. Checklist Operator

- Email peserta aktif dan benar.
- OTP pendaftaran diterima peserta.
- Form data terisi lengkap.
- Pendaftaran berstatus `pending` sebelum review.
- Proktor/admin sudah approve.
- Akun peserta sudah `active`.
- Peserta sudah menerima email persetujuan berisi tautan login pertama.
- Peserta berhasil masuk ke halaman `Ujian`.
- Tombol `Daftar Ujian Non-Reguler` muncul.
- Peserta berhasil self-enroll ke ujian aktif.

## 6. Troubleshooting Singkat

### Kasus 1. Peserta sudah daftar tetapi tidak bisa login

Periksa:
- apakah pendaftaran sudah di-approve,
- apakah akun sudah `active`,
- apakah email persetujuan berisi tautan login pertama sudah terkirim,
- apakah peserta membuka tautan login pertama sebelum kedaluwarsa.

### Kasus 2. Peserta tidak melihat ujian

Periksa:
- apakah ujian statusnya aktif,
- apakah jadwal ujian sedang berjalan,
- apakah peserta sudah klik `Daftar Ujian Non-Reguler`,
- apakah self-enroll berhasil.

### Kasus 3. Peserta gagal mulai ujian

Periksa:
- apakah peserta sudah terdaftar ke ujian,
- apakah token ujian dibutuhkan,
- apakah token yang dimasukkan masih valid,
- apakah jadwal ujian belum berakhir.
