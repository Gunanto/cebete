# Langkah eksekusi

1. Update image dan restart web
Masuk ke VPS
```bash
cd Gio
ssh -i pakgun.pem pakgun@103.103.21.95
```
Lanjut:
```bash
cd ~/cebete
docker compose pull cebete_web
docker compose stop cebete_web
docker compose up -d cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```
Atau dalam 1 baris:
```bash
docker compose pull cebete_web && docker compose stop cebete_web && docker compose up -d cebete_web
```

2. Jalankan migration
```bash
cd ~/cebete-src
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh up
```

3. Opsional: cek status migration
```bash
DB_CONTAINER=cebete_postgres DB_USER=cebete DB_NAME=cebete \
MIGRATIONS_DIR=internal/db/migrations ./scripts/migrate.sh status
```

4. Restart web setelah migration
```bash
cd ~/cebete
docker compose stop cebete_web
docker compose up -d cebete_web
docker compose ps
docker logs --tail=120 cebete_web
```

5. Validasi hasil
```bash
curl -fsS https://cbt.pakgun.my.id/ >/dev/null && echo "WEB OK" || echo "WEB FAIL"
```
