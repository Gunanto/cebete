#!/usr/bin/env bash
set -euo pipefail

umask 077

BASE_DIR="/home/pakgun/cebete-src"
ENV_FILE="${ENV_FILE:-${BASE_DIR}/.env}"
BC_CEBETE_DBASE_ENV_FILE="${BC_CEBETE_DBASE_ENV_FILE:-${BASE_DIR}/.env.bc-cebete-dbase}"
ALT_ENV_FILE="/home/pakgun/cebete/.env"
ALT_BC_CEBETE_DBASE_ENV_FILE="/home/pakgun/cebete/.env.bc-cebete-dbase"
BACKUP_DIR="${BASE_DIR}/backups"
CONTAINER_NAME="cebete_postgres"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${ENV_FILE}" && -f "${ALT_ENV_FILE}" ]]; then
  ENV_FILE="${ALT_ENV_FILE}"
fi

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

if [[ ! -f "${BC_CEBETE_DBASE_ENV_FILE}" && -f "${ALT_BC_CEBETE_DBASE_ENV_FILE}" ]]; then
  BC_CEBETE_DBASE_ENV_FILE="${ALT_BC_CEBETE_DBASE_ENV_FILE}"
fi

if [[ -f "${BC_CEBETE_DBASE_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${BC_CEBETE_DBASE_ENV_FILE}"
  set +a
fi

: "${POSTGRES_DB:?POSTGRES_DB not set}"
: "${POSTGRES_USER:?POSTGRES_USER not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
: "${BACKUP_ZIP_PASSWORD:?BACKUP_ZIP_PASSWORD not set}"
# Optional. If set and rclone exists, the backup will be uploaded.
: "${RCLONE_REMOTE:=}"
if [[ -z "${BOT_TOKEN:-}" && -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
fi
if [[ -z "${CHAT_ID:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
  CHAT_ID="${TELEGRAM_CHAT_ID}"
fi

: "${BOT_TOKEN:?BOT_TOKEN/TELEGRAM_BOT_TOKEN not set}"
: "${CHAT_ID:?CHAT_ID/TELEGRAM_CHAT_ID not set}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DAY_OF_MONTH="$(date +%d)"
DAY_OF_WEEK="$(date +%u)"
SQL_NAME="cebete_pg_${TIMESTAMP}.sql"
ZIP_NAME="${SQL_NAME}.zip"
SQL_PATH="${BACKUP_DIR}/${SQL_NAME}"
ZIP_PATH="${BACKUP_DIR}/${ZIP_NAME}"

docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${CONTAINER_NAME}" \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-privileges \
  > "${SQL_PATH}"

zip -j -P "${BACKUP_ZIP_PASSWORD}" "${ZIP_PATH}" "${SQL_PATH}" >/dev/null
rm -f "${SQL_PATH}"

if [[ -n "${RCLONE_REMOTE}" ]] && command -v rclone >/dev/null 2>&1; then
  RCLONE_TARGET="${RCLONE_REMOTE}/harian"
  if [[ "${DAY_OF_MONTH}" == "01" ]]; then
    RCLONE_TARGET="${RCLONE_REMOTE}/monthly"
  elif [[ "${DAY_OF_WEEK}" == "1" ]]; then
    RCLONE_TARGET="${RCLONE_REMOTE}/mingguan"
  fi
  # rclone failures (e.g. quota exceeded) should not prevent Telegram delivery.
  if ! rclone copy "${ZIP_PATH}" "${RCLONE_TARGET}"; then
    echo "WARN: rclone copy failed; continuing to Telegram send" >&2
  fi
fi

curl -fsS --http1.1 --retry 3 --retry-delay 2 --retry-max-time 60 \
  -F "chat_id=${CHAT_ID}" \
  -F "document=@${ZIP_PATH}" \
  -F "caption=Backup Cebete ${TIMESTAMP}" \
  "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" >/dev/null

# Retensi lokal 7 hari
find "${BACKUP_DIR}" -type f -name "cebete_pg_*.zip" -mtime +7 -delete
