#!/usr/bin/env bash
set -euo pipefail

# Sync Let's Encrypt cert into SIMS nginx-mounted ssl folder, then recreate nginx.
# Default paths follow your current VPS layout but can be overridden via env vars.

DOMAIN="${DOMAIN:-cbt.pakgun.my.id}"
SIMS_DIR="${SIMS_DIR:-/home/pakgun/sims}"
LE_BASE="${LE_BASE:-/home/pakgun/certbot/conf/live}"
TARGET_BASE="${TARGET_BASE:-$SIMS_DIR/docker/nginx/ssl}"
COMPOSE_FILE="${COMPOSE_FILE:-$SIMS_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$SIMS_DIR/.env.prod}"

SRC_CERT="$LE_BASE/$DOMAIN/fullchain.pem"
SRC_KEY="$LE_BASE/$DOMAIN/privkey.pem"
DST_DIR="$TARGET_BASE/$DOMAIN"
DST_CERT="$DST_DIR/fullchain.pem"
DST_KEY="$DST_DIR/privkey.pem"

if [[ ! -f "$SRC_CERT" || ! -f "$SRC_KEY" ]]; then
  echo "ERROR: source cert/key not found for domain: $DOMAIN" >&2
  echo "Checked: $SRC_CERT and $SRC_KEY" >&2
  exit 1
fi

mkdir -p "$DST_DIR"

# -L follows symlink from /live to /archive
cp -Lf "$SRC_CERT" "$DST_CERT"
cp -Lf "$SRC_KEY" "$DST_KEY"

chown root:101 "$DST_CERT" "$DST_KEY"
chmod 640 "$DST_CERT" "$DST_KEY"

cd "$SIMS_DIR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate --no-deps nginx
docker exec -i sims_nginx nginx -t
docker exec -i sims_nginx nginx -s reload

echo "OK: cert synced and nginx reloaded for $DOMAIN"
