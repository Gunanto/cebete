# Cara Menjalankan Server Cebete (CBT LMS)

Panduan ini untuk project di folder `/home/pgun/dev/cebete`.

## Prasyarat
- Go terpasang (`go version`).
- Docker + Docker Compose terpasang (`docker --version`, `docker compose version`).

## 1) Masuk ke folder project
```bash
cd /home/pgun/dev/cebete
```

## 2) Siapkan environment
Jika belum ada file env lokal:
```bash
cp .env.example .env.local
```

Pastikan minimal:
- `DB_DSN` sesuai password Postgres container lokal Anda (lihat `deployments/docker-compose.yml`, default password: `cbtlms_local_only_change_me`).
- `BOOTSTRAP_TOKEN` terisi.

Load env ke shell saat menjalankan server:
```bash
set -a
source .env.local
set +a
```

## 3) Nyalakan dependency lokal
Jalankan semua dependency (`postgres`, `redis`, `minio`):
```bash
docker compose -f deployments/docker-compose.yml up -d
```

Cek status:
```bash
docker compose -f deployments/docker-compose.yml ps
```

## 4) Jalankan migration
```bash
./scripts/migrate.sh up
```
Catatan: `scripts/migrate.sh` menjalankan `psql` lewat `docker exec` ke container Postgres (default: `cbtlms-postgres`).

## 5) Jalankan web server

Opsi A (disarankan, satu perintah):
```bash
make dev
```
`make dev` akan load `.env.local`, menjalankan migration, lalu start server.

Opsi B (manual):
```bash
set -a; source .env.local; set +a
go run ./cmd/web
```

Opsi C (tanpa build Go, pakai binary yang sudah ada):
```bash
set -a; source .env.local; set +a
./bin/cbtlms
```

Server aktif di `http://localhost:8080`.

Mode background (manual):
```bash
nohup bash -lc 'set -a; source .env.local; set +a; go run ./cmd/web' > /tmp/cebete-web.log 2>&1 &
```

## 6) Verifikasi server berjalan
```bash
curl -s http://localhost:8080/healthz
```
Respons normal:
```json
{"ok":true}
```

Atau cek port:
```bash
ss -ltnp | grep ':8080'
```

## 7) Cara mematikan server
Jika jalan di foreground: tekan `Ctrl+C`.

Jika jalan di background:
```bash
pkill -f 'go run ./cmd/web'
```
atau
```bash
docker compose -f deployments/docker-compose.yml down
```

## 8) Troubleshooting cepat
- Error `password authentication failed` ke Postgres: `DB_DSN` di `.env.local` tidak cocok dengan password container.
- Error `connection refused 127.0.0.1:5432`: container Postgres belum hidup.
- Error migration: pastikan `cbtlms-postgres` status `healthy`.
- Error `bind: address already in use` di `:8080`: ada proses lain di port 8080.
  Cek:
  ```bash
  ss -ltnp | grep ':8080'
  ```

## 9) Perintah harian
- `make compose-up`
- `make compose-down`
- `make dev`
- `./scripts/migrate.sh status`
- `./scripts/migrate.sh up`
- `./scripts/migrate.sh down 1`
- `./scripts/migrate.sh reset`
