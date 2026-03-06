# Debug Transfer Soal - Checklist

## 1. Cek Output Transfer
Di dialog transfer, setelah klik "Transfer", cek output JSON:
```json
{
  "total_items": X,
  "success_items": Y,
  "failed_items": Z,
  "errors": [...],
  "question_ids": [...]
}
```

**Pertanyaan:**
- Berapa nilai `success_items`?
- Apa isi `question_ids`?
- Apakah ada error di array `errors`?

## 2. Cek Database - Soal Hasil Transfer
Jalankan query ini di database:

```sql
-- Ganti 123 dengan user_id guru penerima
SELECT 
    q.id,
    q.subject_id,
    q.created_by,
    q.title,
    s.name as subject_name
FROM questions q
LEFT JOIN subjects s ON s.id = q.subject_id
WHERE q.created_by = 123  -- user_id guru penerima
  AND q.is_active = TRUE
ORDER BY q.created_at DESC
LIMIT 10;
```

**Pertanyaan:**
- Apakah ada soal dengan `created_by = guru_penerima_id`?
- Berapa `subject_id` soal tersebut?

## 3. Cek Subject Guru Penerima
```sql
-- Ganti 123 dengan user_id guru penerima
SELECT id, name, created_by
FROM subjects
WHERE created_by = 123
  AND is_active = TRUE;
```

**Pertanyaan:**
- Apa ID subject yang dimiliki guru penerima?
- Apakah ID ini sama dengan `subject_id` soal hasil transfer?

## 4. Cek API Request di Browser
Buka Developer Tools (F12) → Network tab, lalu:
1. Pilih subject di dropdown "Mapel"
2. Klik tombol "Muat Naskah"
3. Cek apakah ada request ke `/api/v1/questions?subject_id=X`

**Pertanyaan:**
- Apakah ada request yang terkirim?
- Berapa `subject_id` yang digunakan dalam request?
- Apa response dari server? (klik request → Preview/Response tab)

## 5. Test Manual API
Di console browser, jalankan:
```javascript
// Ganti 4 dengan subject_id guru penerima
fetch('/api/v1/questions?subject_id=4', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log('Questions:', data))
.catch(err => console.error('Error:', err));
```

**Pertanyaan:**
- Apakah ada soal yang dikembalikan?
- Berapa jumlah soal?

## Kesimpulan
Berdasarkan hasil di atas, kita bisa identifikasi di mana masalahnya:
- Jika `success_items = 0`: Transfer gagal di backend
- Jika soal tidak ada di database: Transfer tidak tersimpan
- Jika `subject_id` tidak match: Salah pilih subject saat transfer
- Jika API tidak dipanggil: Masalah di frontend
- Jika API dipanggil tapi return kosong: Masalah query/filter
