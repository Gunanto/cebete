# Build/Deploy Server Cebete (VPS)

Dokumen ini untuk update source, jalankan migrasi, lalu restart web di VPS.

## Prasyarat

1) `git pull` di VPS harus bisa akses GitHub.
- Recommended: pakai SSH deploy key (read-only) dan set remote jadi `git@github.com:Gunanto/cebete.git`.
- Kalau remote masih HTTPS, `git pull origin main` bisa gagal karena minta kredensial.

2) Path penting:
- `~/cebete-src` = source code (untuk migrasi + build image jika mode build lokal)
- `~/cebete` = folder production yang berisi `docker-compose.yml` untuk container `cebete_web`, `cebete_postgres`, dll.

## Langkah Eksekusi (Default: Build Image Lokal di VPS)

1) Update source
```bash
cd ~/cebete-src
git pull origin main
```

2) Jalankan migrasi (jika ada file migrasi baru)
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up
```

3) Build image web dari source terbaru (tag lokal contoh: `cebete:monitor`)
```bash
cd ~/cebete-src
docker build -t cebete:monitor .
```

4) Restart web (production compose ada di `~/cebete`)
```bash
cd ~/cebete
docker compose up -d --force-recreate cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

5) Validasi
```bash
curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"
```

## Alternatif: Pull Image dari Registry

Pakai mode ini hanya jika `~/cebete/docker-compose.yml` untuk `cebete_web` memakai image dari registry (mis. `ghcr.io/gunanto/cebete:latest`), bukan image lokal `cebete:monitor`.

```bash
cd ~/cebete-src
git pull origin main

cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up

cd ~/cebete
docker compose pull cebete_web
docker compose up -d --force-recreate cebete_web
docker compose ps
docker logs --tail=120 cebete_web

curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"
```

## Opsional: Cek Status Migrasi
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh status
```
