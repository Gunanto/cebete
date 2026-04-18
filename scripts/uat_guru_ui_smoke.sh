#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSRF_CURL="$ROOT_DIR/scripts/csrf-curl.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
COOKIE_JAR="${COOKIE_JAR:-$ROOT_DIR/.tmp_uat_guru_ui_cookie.txt}"
GURU_USER="${GURU_USER:-}"
GURU_PASS="${GURU_PASS:-}"
EXPECT_ROLE="${EXPECT_ROLE:-guru}"

usage() {
  cat <<'USAGE'
Smoke UAT untuk portal guru (/guru) berbasis API + SSR.

Required env:
  GURU_USER
  GURU_PASS

Optional env:
  BASE_URL     default: http://localhost:8080
  COOKIE_JAR   default: .tmp_uat_guru_ui_cookie.txt
  EXPECT_ROLE  default: guru

Example:
  BASE_URL=http://localhost:8080 \
  GURU_USER=guru \
  GURU_PASS='Guru123!' \
  scripts/uat_guru_ui_smoke.sh
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

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local -a args=()
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR" "$CSRF_CURL" req "$method" "$path" "${args[@]}"
}

run_expect_status() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expected="$4"
  local data="${5:-}"

  local resp
  resp="$(request "$method" "$path" "$data" || true)"
  local code
  code="$(printf '%s\n' "$resp" | status_from_response)"
  if [[ "$code" == "$expected" ]]; then
    printf 'PASS  %-48s => %s\n' "$name" "$code"
    return 0
  fi
  printf 'FAIL  %-48s => got=%s expected=%s\n' "$name" "$code" "$expected"
  return 1
}

run_expect_response_contains() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expected="$4"
  local data="${5:-}"

  local resp
  resp="$(request "$method" "$path" "$data" || true)"
  local code
  code="$(printf '%s\n' "$resp" | status_from_response)"
  if [[ "$code" != "200" ]]; then
    printf 'FAIL  %-48s => got=%s expected=200\n' "$name" "$code"
    return 1
  fi
  if printf '%s\n' "$resp" | rg -q --fixed-strings "$expected"; then
    printf 'PASS  %-48s => contains "%s"\n' "$name" "$expected"
    return 0
  fi
  printf 'FAIL  %-48s => response missing "%s"\n' "$name" "$expected"
  return 1
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

  require_env "GURU_USER"
  require_env "GURU_PASS"

  echo "== login guru =="
  local login_resp
  login_resp="$(BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR" "$CSRF_CURL" login "$GURU_USER" "$GURU_PASS" || true)"
  local login_code
  login_code="$(printf '%s\n' "$login_resp" | status_from_response)"
  if [[ "$login_code" != "200" ]]; then
    echo "login failed, got HTTP $login_code" >&2
    exit 1
  fi
  echo "PASS  login => 200"

  local failed=0

  run_expect_status "GET /api/v1/auth/me" "GET" "/api/v1/auth/me" "200" || failed=$((failed + 1))
  run_expect_response_contains "role check /api/v1/auth/me" "GET" "/api/v1/auth/me" "\"role\":\"${EXPECT_ROLE}\"" || failed=$((failed + 1))

  run_expect_status "SSR route /guru" "GET" "/guru" "200" || failed=$((failed + 1))
  run_expect_status "Static CSS /static/css/app.css" "GET" "/static/css/app.css" "200" || failed=$((failed + 1))
  run_expect_status "Static page script /static/js/pages/guru.js" "GET" "/static/js/pages/guru.js" "200" || failed=$((failed + 1))

  run_expect_status "GET /api/v1/admin/dashboard/stats" "GET" "/api/v1/admin/dashboard/stats" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/subjects" "GET" "/api/v1/subjects" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/levels" "GET" "/api/v1/levels" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/learning-goals" "GET" "/api/v1/learning-goals" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/admin/exams/manage" "GET" "/api/v1/admin/exams/manage" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/admin/exams" "GET" "/api/v1/admin/exams" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/admin/schools" "GET" "/api/v1/admin/schools" "200" || failed=$((failed + 1))
  run_expect_status "GET /api/v1/admin/classes" "GET" "/api/v1/admin/classes" "200" || failed=$((failed + 1))

  if [[ "$failed" -gt 0 ]]; then
    echo "== RESULT: FAIL (${failed} check gagal) =="
    exit 1
  fi

  echo "== RESULT: PASS (guru ui smoke checks lulus) =="
}

main "$@"
