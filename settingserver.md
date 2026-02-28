## Catatan Lanjut (Server VPS)
Oke, service sudah normal lagi.

Status saat ini:
- App hidup: `cbtlms web listening on :8080`
- `CSRF_ENFORCED=true` sudah aman.
- Masih non-prod karena `sslmode=disable`.

Next hardening yang natural:
1. Setup TLS internal Postgres.
2. Ubah `DB_DSN` ke `sslmode=require`.
3. Baru set `APP_ENV=production`.

Kalau lanjut sekarang, saya kasih perintah exact untuk generate cert Postgres dan update compose/env tanpa downtime panjang.


### Status terakhir
- `cebete_web` sudah jalan di compose `~/cebete` (log: `cbtlms web listening on :8080`).
- DNS `cbt.pakgun.my.id` sudah mengarah ke VPS (`103.103.21.95`).
- Sertifikat Let's Encrypt untuk `cbt.pakgun.my.id` sudah berhasil dibuat:
  - `/home/pakgun/certbot/conf/live/cbt.pakgun.my.id/fullchain.pem`
  - `/home/pakgun/certbot/conf/live/cbt.pakgun.my.id/privkey.pem`
- Nginx `sims_nginx` masih error config:
  - `host not found in upstream "cebete_backend"` di `default.conf:110`

### Akar masalah
- Blok `server_name cbt.pakgun.my.id` dobel.
- Masih ada `proxy_pass http://cebete_backend;` padahal upstream tidak valid/terdefinisi benar.

### Target
- Rapikan `~/sims/docker/nginx/conf.d/default.prod.conf` menjadi bersih:
  1. Satu block HTTPS untuk SIMS (`server_name .mysims.my.id`).
  2. Satu block HTTPS untuk CBT (`server_name cbt.pakgun.my.id`).
  3. Untuk CBT, pakai langsung `proxy_pass http://cebete_web:8080;`.
  4. Hapus duplikasi block CBT dan semua referensi `cebete_backend`.

### Langkah eksekusi
```bash
# 1) Pastikan container saling terlihat di network edge
docker network connect sims_edge cebete_web 2>/dev/null || true
docker network inspect sims_edge | grep -E "sims_nginx|cebete_web"

# 2) Masuk folder SIMS dan backup config nginx sebelum edit
cd ~/sims
cp docker/nginx/conf.d/default.prod.conf docker/nginx/conf.d/default.prod.conf.bak.$(date +%F-%H%M%S)

# 3) Edit file config
nano docker/nginx/conf.d/default.prod.conf

# 4) Recreate service nginx agar baca config terbaru
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d nginx

# 5) Validasi config dari dalam container
docker exec -it sims_nginx nginx -t

# 6) Jika valid, reload nginx
docker exec -it sims_nginx nginx -s reload

# 7) Verifikasi dari luar
curl -I https://cbt.pakgun.my.id
```

### Template final `default.prod.conf` (minimal bersih)
Pastikan hanya ada 2 server block HTTPS berikut (SIMS + CBT) dan tidak ada `proxy_pass http://cebete_backend;`.

```nginx
server {
    listen 8443 ssl;
    server_name .mysims.my.id;

    ssl_certificate     /etc/letsencrypt/live/mysims.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mysims.my.id/privkey.pem;

    location / {
        proxy_pass http://sims_web:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 8443 ssl;
    server_name cbt.pakgun.my.id;

    ssl_certificate     /etc/letsencrypt/live/cbt.pakgun.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cbt.pakgun.my.id/privkey.pem;

    location / {
        proxy_pass http://cebete_web:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Blok CBT final (salin apa adanya)
```nginx
server {
    listen 8443 ssl;
    server_name cbt.pakgun.my.id;

    ssl_certificate     /etc/letsencrypt/live/cbt.pakgun.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cbt.pakgun.my.id/privkey.pem;

    location / {
        proxy_pass http://cebete_web:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Jika `nginx -t` gagal
```bash
cd ~/sims
LAST_BAK=$(ls -1t docker/nginx/conf.d/default.prod.conf.bak.* | head -n1)
cp "$LAST_BAK" docker/nginx/conf.d/default.prod.conf
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d nginx
docker exec -it sims_nginx nginx -t
```

### Sinkron cert setelah renew (wajib)
Karena `sims_nginx` membaca cert dari `/home/pakgun/sims/docker/nginx/ssl/cbt.pakgun.my.id/`, setiap renew Let's Encrypt perlu sinkron ulang.

Script siap pakai (di repo ini): `scripts/renew-sync-cbt-cert.sh`.

Contoh pakai di VPS:
```bash
# sekali saja
chmod +x /path/ke/repo/scripts/renew-sync-cbt-cert.sh

# manual run
/path/ke/repo/scripts/renew-sync-cbt-cert.sh
```

Contoh cron harian (jam 03:17):
```bash
17 3 * * * /path/ke/repo/scripts/renew-sync-cbt-cert.sh >> /var/log/renew-sync-cbt-cert.log 2>&1
```

## Operasional Lanjutan (Praktis di VPS `pakgun@pakgun`)

### 1) Simpan backup `docker-compose.yml` dan `.env` final ke lokasi aman
```bash
cd ~/cebete

# folder backup private
mkdir -p ~/backup-cebete
chmod 700 ~/backup-cebete

# timestamp
TS=$(date +%F-%H%M%S)
DEST=~/backup-cebete/$TS
mkdir -p "$DEST"

# simpan file penting + checksum
cp docker-compose.yml .env "$DEST"/
sha256sum "$DEST/docker-compose.yml" "$DEST/.env" > "$DEST/SHA256SUMS.txt"
chmod 600 "$DEST/.env"

# opsional: arsip terenkripsi password
tar -czf - -C "$DEST" . | openssl enc -aes-256-cbc -pbkdf2 -salt -out ~/backup-cebete-$TS.tar.gz.enc
```

### 2) Tambahkan healthcheck/monitoring sederhana (uptime + log alert)
```bash
cat > ~/cebete/monitor.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /home/pakgun/cebete

TS="$(date '+%F %T')"
LOG="/home/pakgun/cebete/monitor.log"

web_running=$(docker inspect -f '{{.State.Running}}' cebete_web 2>/dev/null || echo false)
pg_running=$(docker inspect -f '{{.State.Running}}' cebete_postgres 2>/dev/null || echo false)

web_http="down"
if curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then web_http="up"; fi

pg_ready="down"
if docker exec cebete_postgres pg_isready -U cebete -d cebete >/dev/null 2>&1; then pg_ready="up"; fi

echo "[$TS] web_running=$web_running web_http=$web_http pg_running=$pg_running pg_ready=$pg_ready" >> "$LOG"

if docker logs --since 5m cebete_web 2>&1 | grep -Eiq 'panic|fatal|database error|security error'; then
  echo "[$TS] ALERT web log error terdeteksi" >> "$LOG"
fi

if docker logs --since 5m cebete_postgres 2>&1 | grep -Eiq 'FATAL|PANIC|ERROR:'; then
  echo "[$TS] ALERT postgres log error terdeteksi" >> "$LOG"
fi
EOF

chmod +x ~/cebete/monitor.sh
```

Pasang cron tiap 5 menit:
```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/pakgun/cebete/monitor.sh") | crontab -
```

Cek hasil:
```bash
tail -n 30 ~/cebete/monitor.log
crontab -l
```

### 3) Versi lanjut: kirim alert ke Telegram saat ada `ALERT`
```bash
cat > ~/cebete/.env.monitor <<'EOF'
TELEGRAM_BOT_TOKEN=isi_token_bot
TELEGRAM_CHAT_ID=isi_chat_id
EOF
chmod 600 ~/cebete/.env.monitor
```

```bash
cat > ~/cebete/monitor.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /home/pakgun/cebete

TS="$(date '+%F %T')"
LOG="/home/pakgun/cebete/monitor.log"
ENVF="/home/pakgun/cebete/.env.monitor"
STATE="/home/pakgun/cebete/.monitor_last_alert"

if [ -f "$ENVF" ]; then
  # shellcheck disable=SC1090
  source "$ENVF"
fi

send_telegram() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=${msg}" >/dev/null || true
  fi
}

web_running=$(docker inspect -f '{{.State.Running}}' cebete_web 2>/dev/null || echo false)
pg_running=$(docker inspect -f '{{.State.Running}}' cebete_postgres 2>/dev/null || echo false)

web_http="down"
if curl -fsS http://127.0.0.1:8080/ >/dev/null 2>&1; then web_http="up"; fi

pg_ready="down"
if docker exec cebete_postgres pg_isready -U cebete -d cebete >/dev/null 2>&1; then pg_ready="up"; fi

echo "[$TS] web_running=$web_running web_http=$web_http pg_running=$pg_running pg_ready=$pg_ready" >> "$LOG"

alert_lines=""
if docker logs --since 5m cebete_web 2>&1 | grep -Eiq 'panic|fatal|database error|security error'; then
  alert_lines="${alert_lines}\n- web log error terdeteksi"
fi
if docker logs --since 5m cebete_postgres 2>&1 | grep -Eiq 'FATAL|PANIC|ERROR:'; then
  alert_lines="${alert_lines}\n- postgres log error terdeteksi"
fi
if [ "$web_running" != "true" ] || [ "$web_http" != "up" ] || [ "$pg_running" != "true" ] || [ "$pg_ready" != "up" ]; then
  alert_lines="${alert_lines}\n- service health tidak normal (web_running=$web_running web_http=$web_http pg_running=$pg_running pg_ready=$pg_ready)"
fi

if [ -n "$alert_lines" ]; then
  msg="ALERT CEBETE [$TS]${alert_lines}"
  echo "[$TS] ${msg}" >> "$LOG"

  # anti-spam: kirim jika berbeda dengan alert sebelumnya
  last=""
  [ -f "$STATE" ] && last="$(cat "$STATE" 2>/dev/null || true)"
  if [ "$msg" != "$last" ]; then
    send_telegram "$msg"
    printf '%s' "$msg" > "$STATE"
  fi
else
  # clear state saat normal supaya alert berikutnya tetap terkirim
  : > "$STATE"
fi
EOF

chmod +x ~/cebete/monitor.sh
```

Test kirim Telegram:
```bash
source ~/cebete/.env.monitor
curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=Test alert CEBETE $(date '+%F %T')"
```

## Catatan Lengkap Bot Telegram Monitoring CEBETE (Final)

### Ringkasan
- Tujuan bot: kirim notifikasi Telegram saat service CEBETE tidak sehat atau log error terdeteksi.
- Nama bot: `@cebete_monitor_bot`.
- Jadwal monitor: setiap 5 menit via cron.
- Host check web final: `https://cbt.pakgun.my.id/` (bukan `127.0.0.1:8080` karena port container tidak dipublish ke host).

### Komponen yang dipakai
- File script monitor: `/home/pakgun/cebete/monitor.sh`
- File kredensial Telegram: `/home/pakgun/cebete/.env.monitor`
- File log monitor: `/home/pakgun/cebete/monitor.log`
- File state anti-spam alert: `/home/pakgun/cebete/.monitor_last_alert`
- Cron entry:
  - `*/5 * * * * /home/pakgun/cebete/monitor.sh`

### Cara kerja monitor
- Cek status container:
  - `cebete_web` harus `running`
  - `cebete_postgres` harus `running`
- Cek health HTTP web:
  - `curl -fsS https://cbt.pakgun.my.id/`
- Cek readiness postgres:
  - `docker exec cebete_postgres pg_isready -U cebete -d cebete`
- Scan log 5 menit terakhir:
  - `cebete_web`: `panic|fatal|database error|security error`
  - `cebete_postgres`: `FATAL|PANIC|ERROR:`
- Jika ada masalah:
  - tulis `ALERT` ke `monitor.log`
  - kirim pesan ke Telegram
  - anti-spam: pesan yang sama tidak dikirim berulang sampai kondisi berubah

### Setup Telegram (ringkas)
1. Buat bot via `@BotFather` (`/newbot`).
2. Chat ke bot, tekan `Start`, kirim pesan.
3. Ambil `chat_id`:
```bash
TOKEN='ISI_TOKEN_BOT'
curl -s "https://api.telegram.org/bot$TOKEN/getUpdates?timeout=60"
```
4. Simpan token dan chat id:
```bash
cat > ~/cebete/.env.monitor <<'EOF'
TELEGRAM_BOT_TOKEN=ISI_TOKEN_BOT
TELEGRAM_CHAT_ID=ISI_CHAT_ID
EOF
chmod 600 ~/cebete/.env.monitor
```

### Script monitor final (yang dipakai saat ini)
```bash
cat > ~/cebete/monitor.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /home/pakgun/cebete

TS="$(date '+%F %T')"
LOG="/home/pakgun/cebete/monitor.log"
ENVF="/home/pakgun/cebete/.env.monitor"
STATE="/home/pakgun/cebete/.monitor_last_alert"

if [ -f "$ENVF" ]; then
  # shellcheck disable=SC1090
  source "$ENVF"
fi

send_telegram() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=${msg}" >/dev/null || true
  fi
}

web_running=$(docker inspect -f '{{.State.Running}}' cebete_web 2>/dev/null || echo false)
pg_running=$(docker inspect -f '{{.State.Running}}' cebete_postgres 2>/dev/null || echo false)

web_http="down"
if curl -fsS https://cbt.pakgun.my.id/ >/dev/null 2>&1; then web_http="up"; fi

pg_ready="down"
if docker exec cebete_postgres pg_isready -U cebete -d cebete >/dev/null 2>&1; then pg_ready="up"; fi

echo "[$TS] web_running=$web_running web_http=$web_http pg_running=$pg_running pg_ready=$pg_ready" >> "$LOG"

alert_lines=""
if docker logs --since 5m cebete_web 2>&1 | grep -Eiq 'panic|fatal|database error|security error'; then
  alert_lines="${alert_lines}\n- web log error terdeteksi"
fi
if docker logs --since 5m cebete_postgres 2>&1 | grep -Eiq 'FATAL|PANIC|ERROR:'; then
  alert_lines="${alert_lines}\n- postgres log error terdeteksi"
fi
if [ "$web_running" != "true" ] || [ "$web_http" != "up" ] || [ "$pg_running" != "true" ] || [ "$pg_ready" != "up" ]; then
  alert_lines="${alert_lines}\n- service health tidak normal (web_running=$web_running web_http=$web_http pg_running=$pg_running pg_ready=$pg_ready)"
fi

if [ -n "$alert_lines" ]; then
  msg="ALERT CEBETE [$TS]${alert_lines}"
  echo "[$TS] ${msg}" >> "$LOG"

  last=""
  [ -f "$STATE" ] && last="$(cat "$STATE" 2>/dev/null || true)"
  if [ "$msg" != "$last" ]; then
    send_telegram "$msg"
    printf '%s' "$msg" > "$STATE"
  fi
else
  : > "$STATE"
fi
EOF

chmod +x ~/cebete/monitor.sh
```

### Aktivasi dan validasi
```bash
# pasang cron
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/pakgun/cebete/monitor.sh") | crontab -

# test manual
/home/pakgun/cebete/monitor.sh
tail -n 30 /home/pakgun/cebete/monitor.log
crontab -l
```

### Troubleshooting cepat
- `web_http=down`:
  - cek `curl -I https://cbt.pakgun.my.id/`
  - jika `405 Method Not Allowed` saat `curl -I`, itu normal (HEAD tidak diizinkan) selama check `curl -fsS https://cbt.pakgun.my.id/` sukses.
- Tidak ada pesan Telegram:
  - cek `.env.monitor` benar dan terbaca
  - test API:
```bash
source ~/cebete/.env.monitor
curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=Manual test $(date '+%F %T')"
```
- Alert spam:
  - mekanisme anti-spam pakai `.monitor_last_alert`; file ini di-reset saat kondisi kembali normal.
