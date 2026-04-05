# Langkah eksekusi

1. Update source code untuk migration
```bash
cd ~/cebete-src
git pull
```

2. Update image dan restart web
Masuk ke VPS
```bash
ke-vps
```
Jika ada tabel baru, lakukan
```
cd ~/cebete-src
git pull
ls internal/db/migrations/000040*
```
Kemudian lanjutkan
```
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up
```

Lanjut:
```bash
cd ~/cebete-src
git pull origin main




docker compose ps
docker logs --tail=120 cebete_web

curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"

```
Kalau ada migrasi database, sisipkan sebelum restart container:
```bash
cd ~/cebete-src
git pull origin main

DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up

cd ~/cebete
docker compose pull cebete_web
docker compose stop cebete_web
docker compose up -d --force-recreate cebete_web

docker compose ps
docker logs --tail=120 cebete_web

curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"

```

3. Jalankan migration
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up
```

4. Opsional: cek status migration
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh status
```

5. Restart web setelah migration
```bash
cd ~/cebete
docker compose stop cebete_web
docker compose up -d cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

6. Validasi hasil
```bash
curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"
```
