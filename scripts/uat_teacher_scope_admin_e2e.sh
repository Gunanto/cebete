#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSRF_CURL="$ROOT_DIR/scripts/csrf-curl.sh"
NEG_SCRIPT="$ROOT_DIR/scripts/uat_teacher_scope_negative.sh"
POS_SCRIPT="$ROOT_DIR/scripts/uat_teacher_scope_positive.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
COOKIE_JAR_ADMIN="${COOKIE_JAR_ADMIN:-$ROOT_DIR/.tmp_uat_teacher_scope_admin_cookie.txt}"
COOKIE_JAR_NEG="${COOKIE_JAR_NEG:-$ROOT_DIR/.tmp_uat_teacher_scope_neg_cookie.txt}"
COOKIE_JAR_POS="${COOKIE_JAR_POS:-$ROOT_DIR/.tmp_uat_teacher_scope_pos_cookie.txt}"

ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"

NEG_GURU_USER="${NEG_GURU_USER:-${GURU_USER:-}}"
NEG_GURU_PASS="${NEG_GURU_PASS:-${GURU_PASS:-}}"
POS_GURU_USER="${POS_GURU_USER:-${GURU_USER:-}}"
POS_GURU_PASS="${POS_GURU_PASS:-${GURU_PASS:-}}"

GURU_ID="${GURU_ID:-}"
GURU_FULL_NAME="${GURU_FULL_NAME:-}"
GURU_EMAIL="${GURU_EMAIL:-}"

EXAM_SAME_ID="${EXAM_SAME_ID:-}"
EXAM_CROSS_ID="${EXAM_CROSS_ID:-}"
SCHOOL_B_ID="${SCHOOL_B_ID:-}"
CLASS_B_ID="${CLASS_B_ID:-}"
STUDENT_B_ID="${STUDENT_B_ID:-}"
SUBJECT_ID="${SUBJECT_ID:-}"
EXAM_SAME_CODE="${EXAM_SAME_CODE:-}"
EXAM_SAME_TITLE="${EXAM_SAME_TITLE:-}"

PROMPT_BETWEEN_PHASES="${PROMPT_BETWEEN_PHASES:-0}"

usage() {
  cat <<'USAGE'
Suite E2E API teacher-scope:
1) Admin set guru -> teacher_access_profile=school
2) Jalankan matrix negatif (expect 403)
3) Admin set guru -> teacher_access_profile=cross_school
4) Jalankan matrix positif (expect 200/201)

Required env:
  ADMIN_USER
  ADMIN_PASS
  GURU_ID
  GURU_FULL_NAME
  GURU_EMAIL
  NEG_GURU_USER
  NEG_GURU_PASS
  POS_GURU_USER
  POS_GURU_PASS
  EXAM_SAME_ID
  EXAM_CROSS_ID
  SCHOOL_B_ID
  CLASS_B_ID
  STUDENT_B_ID

Optional env:
  SUBJECT_ID
  EXAM_SAME_CODE
  EXAM_SAME_TITLE
  BASE_URL                  default: http://localhost:8080
  COOKIE_JAR_ADMIN          cookie jar admin
  COOKIE_JAR_NEG            cookie jar fase negatif
  COOKIE_JAR_POS            cookie jar fase positif
  PROMPT_BETWEEN_PHASES     1 (prompt), 0 (langsung lanjut; default)

Example:
  BASE_URL=http://localhost:8080 \
  ADMIN_USER=admin ADMIN_PASS='Admin123!' \
  GURU_ID=6 GURU_FULL_NAME='Guru UAT' GURU_EMAIL='guru@example.com' \
  NEG_GURU_USER=guru NEG_GURU_PASS='Guru12345!' \
  POS_GURU_USER=guru POS_GURU_PASS='Guru12345!' \
  EXAM_SAME_ID=13 EXAM_CROSS_ID=10 \
  SCHOOL_B_ID=7 CLASS_B_ID=24 STUDENT_B_ID=301 \
  SUBJECT_ID=6 EXAM_SAME_CODE=UAT-SAME-002 EXAM_SAME_TITLE='UAT Same School 2' \
  scripts/uat_teacher_scope_admin_e2e.sh
USAGE
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: $name" >&2
    exit 1
  fi
}

status_from_response() {
  awk '/^HTTP/{code=$2} END{print code+0}'
}

json_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

admin_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local -a args=()
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR_ADMIN" "$CSRF_CURL" req "$method" "$path" "${args[@]}"
}

set_teacher_profile() {
  local profile="$1"
  local expected_code="$2"

  local payload
  payload=$(
    printf '{"full_name":"%s","email":"%s","role":"guru","teacher_access_profile":"%s"}' \
      "$(json_escape "$GURU_FULL_NAME")" \
      "$(json_escape "$GURU_EMAIL")" \
      "$(json_escape "$profile")"
  )

  local resp
  resp="$(admin_request "PUT" "/api/v1/admin/users/${GURU_ID}" "$payload" || true)"
  local code
  code="$(printf '%s\n' "$resp" | status_from_response)"
  if [[ "$code" != "$expected_code" ]]; then
    echo "FAIL  set teacher_access_profile=${profile} => got=${code} expected=${expected_code}" >&2
    exit 1
  fi
  echo "PASS  set teacher_access_profile=${profile} => ${code}"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  if [[ ! -x "$CSRF_CURL" ]]; then
    echo "required helper not executable: $CSRF_CURL" >&2
    exit 1
  fi
  if [[ ! -x "$NEG_SCRIPT" ]]; then
    echo "required script not executable: $NEG_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -x "$POS_SCRIPT" ]]; then
    echo "required script not executable: $POS_SCRIPT" >&2
    exit 1
  fi

  require_env "ADMIN_USER"
  require_env "ADMIN_PASS"
  require_env "GURU_ID"
  require_env "GURU_FULL_NAME"
  require_env "GURU_EMAIL"
  require_env "NEG_GURU_USER"
  require_env "NEG_GURU_PASS"
  require_env "POS_GURU_USER"
  require_env "POS_GURU_PASS"
  require_env "EXAM_SAME_ID"
  require_env "EXAM_CROSS_ID"
  require_env "SCHOOL_B_ID"
  require_env "CLASS_B_ID"
  require_env "STUDENT_B_ID"

  echo "== login as admin =="
  local login_resp
  login_resp="$(BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR_ADMIN" "$CSRF_CURL" login "$ADMIN_USER" "$ADMIN_PASS" || true)"
  local login_code
  login_code="$(printf '%s\n' "$login_resp" | status_from_response)"
  if [[ "$login_code" != "200" ]]; then
    echo "admin login failed, got HTTP $login_code" >&2
    exit 1
  fi

  echo "== phase 1: force profile school =="
  set_teacher_profile "school" "200"

  echo
  echo "== phase 2: negative matrix (guru school) =="
  BASE_URL="$BASE_URL" \
  COOKIE_JAR="$COOKIE_JAR_NEG" \
  GURU_USER="$NEG_GURU_USER" \
  GURU_PASS="$NEG_GURU_PASS" \
  EXAM_SAME_ID="$EXAM_SAME_ID" \
  EXAM_CROSS_ID="$EXAM_CROSS_ID" \
  SCHOOL_B_ID="$SCHOOL_B_ID" \
  CLASS_B_ID="$CLASS_B_ID" \
  STUDENT_B_ID="$STUDENT_B_ID" \
  SUBJECT_ID="$SUBJECT_ID" \
  EXAM_SAME_CODE="$EXAM_SAME_CODE" \
  EXAM_SAME_TITLE="$EXAM_SAME_TITLE" \
  "$NEG_SCRIPT"

  if [[ "$PROMPT_BETWEEN_PHASES" == "1" ]]; then
    echo
    read -r -p "Tekan ENTER untuk lanjut set profile cross_school..."
  fi

  echo
  echo "== phase 3: force profile cross_school =="
  set_teacher_profile "cross_school" "200"

  echo
  echo "== phase 4: positive matrix (guru cross_school) =="
  BASE_URL="$BASE_URL" \
  COOKIE_JAR="$COOKIE_JAR_POS" \
  GURU_USER="$POS_GURU_USER" \
  GURU_PASS="$POS_GURU_PASS" \
  EXAM_SAME_ID="$EXAM_SAME_ID" \
  EXAM_CROSS_ID="$EXAM_CROSS_ID" \
  SCHOOL_B_ID="$SCHOOL_B_ID" \
  CLASS_B_ID="$CLASS_B_ID" \
  STUDENT_B_ID="$STUDENT_B_ID" \
  SUBJECT_ID="$SUBJECT_ID" \
  "$POS_SCRIPT"

  echo
  echo "== E2E RESULT: PASS (admin transition + negative + positive) =="
}

main "$@"
