# Build/Deploy Server Cebete (VPS)

Dokumen ini untuk update source, jalankan migrasi, lalu restart web di VPS.

## Prasyarat

1) `git pull` di VPS harus bisa akses GitHub.
- Recommended: pakai SSH deploy key (read-only) dan set remote jadi `git@github.com:Gunanto/cebete.git`.
- Kalau remote masih HTTPS, `git pull origin main` bisa gagal karena minta kredensial.

2) Path penting:
- `~/cebete-src` = source code (untuk migrasi + build image jika mode build lokal)
- `~/cebete` = folder production yang berisi `docker-compose.yml` untuk container `cebete_web`, `cebete_postgres`, dll.

## Langkah Eksekusi (Di VPS)

1) Cek tipe deploy yang dipakai (`image:` vs `build:`)
```bash
cd ~/cebete
docker compose config | sed -n '/^  cebete_web:/,/^  [a-zA-Z0-9_-]\\+:/p' | grep -nE '^(  cebete_web:|    image:|    build:)'
```

2) Pastikan database container hidup (dibutuhkan oleh migrasi)
```bash
cd ~/cebete
docker compose up -d cebete_postgres
docker compose ps
```
Jika service DB Anda bukan `cebete_postgres`, sesuaikan dari output `docker compose ps`.

3) Update source code
```bash
cd ~/cebete-src
git pull origin main
```

4) Jalankan migrasi (jika ada file migrasi baru)
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up
```

5) Update web (pilih salah satu sesuai hasil langkah 1)

Mode A: `cebete_web` memakai `image:` lokal, dan Anda build manual di `~/cebete-src`
Catatan: tag `cebete:monitor` harus sama dengan yang dipakai oleh `image:` di compose.
```bash
cd ~/cebete-src
docker build -t cebete:monitor .

cd ~/cebete
docker compose up -d --force-recreate cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

Mode B: `cebete_web` memakai `build:` (build dilakukan dari folder `~/cebete`)
```bash
cd ~/cebete
docker compose build cebete_web
docker compose up -d --force-recreate cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

Mode C: `cebete_web` memakai `image:` dari registry (pull image)
```bash
cd ~/cebete
docker compose pull cebete_web
docker compose up -d --force-recreate cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

6) Validasi HTTP
```bash
curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"
```

## Opsional: Cek Status Migrasi
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh status
```
