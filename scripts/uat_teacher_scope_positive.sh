#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSRF_CURL="$ROOT_DIR/scripts/csrf-curl.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
COOKIE_JAR="${COOKIE_JAR:-$ROOT_DIR/.tmp_uat_teacher_scope_cookie.txt}"

GURU_USER="${GURU_USER:-}"
GURU_PASS="${GURU_PASS:-}"

EXAM_CROSS_ID="${EXAM_CROSS_ID:-}"
SCHOOL_B_ID="${SCHOOL_B_ID:-}"
CLASS_B_ID="${CLASS_B_ID:-}"
STUDENT_B_ID="${STUDENT_B_ID:-}"

# Optional guard check: same_school should still deny cross-school assignment.
EXAM_SAME_ID="${EXAM_SAME_ID:-}"

# Optional create cross-school check.
SUBJECT_ID="${SUBJECT_ID:-}"

usage() {
  cat <<'USAGE'
Batch UAT positif lintas sekolah untuk guru profile `cross_school`.

Required env:
  GURU_USER
  GURU_PASS
  EXAM_CROSS_ID
  SCHOOL_B_ID
  CLASS_B_ID
  STUDENT_B_ID

Optional env:
  EXAM_SAME_ID     (aktifkan guard check bahwa same_school tetap menolak lintas sekolah)
  SUBJECT_ID       (aktifkan check create exam cross_school harus berhasil)
  BASE_URL         (default: http://localhost:8080)
  COOKIE_JAR       (default: .tmp_uat_teacher_scope_cookie.txt)

Example:
  BASE_URL=http://localhost:8080 \
  GURU_USER=guru.cross \
  GURU_PASS='Guru123!' \
  EXAM_CROSS_ID=102 \
  SCHOOL_B_ID=2 CLASS_B_ID=5 STUDENT_B_ID=77 \
  EXAM_SAME_ID=101 SUBJECT_ID=1 \
  scripts/uat_teacher_scope_positive.sh
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
  local data="$4"
  local expected="$5"

  local resp
  resp="$(request "$method" "$path" "$data" || true)"
  local code
  code="$(printf '%s\n' "$resp" | status_from_response)"

  if [[ "$code" == "$expected" ]]; then
    printf 'PASS  %-46s => %s\n' "$name" "$code"
    return 0
  fi

  printf 'FAIL  %-46s => got=%s expected=%s\n' "$name" "$code" "$expected"
  return 1
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  require_env "GURU_USER"
  require_env "GURU_PASS"
  require_env "EXAM_CROSS_ID"
  require_env "SCHOOL_B_ID"
  require_env "CLASS_B_ID"
  require_env "STUDENT_B_ID"

  if [[ ! -x "$CSRF_CURL" ]]; then
    echo "required helper not executable: $CSRF_CURL" >&2
    exit 1
  fi

  echo "== login as guru cross_school =="
  local login_resp
  login_resp="$(BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR" "$CSRF_CURL" login "$GURU_USER" "$GURU_PASS" || true)"
  local login_code
  login_code="$(printf '%s\n' "$login_resp" | status_from_response)"
  if [[ "$login_code" != "200" ]]; then
    echo "login failed, got HTTP $login_code" >&2
    exit 1
  fi

  echo "== positive matrix (expect 200/201) =="
  local failed=0

  run_expect_status \
    "append by-class cross_school -> school_b" \
    "POST" \
    "/api/v1/admin/exams/${EXAM_CROSS_ID}/assignments/by-class/append" \
    "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
    "200" || failed=$((failed + 1))

  run_expect_status \
    "replace by-class cross_school -> school_b" \
    "PUT" \
    "/api/v1/admin/exams/${EXAM_CROSS_ID}/assignments/by-class" \
    "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
    "200" || failed=$((failed + 1))

  run_expect_status \
    "manual assign cross_school exam" \
    "PUT" \
    "/api/v1/admin/exams/${EXAM_CROSS_ID}/assignments" \
    "{\"user_ids\":[${STUDENT_B_ID}]}" \
    "200" || failed=$((failed + 1))

  if [[ -n "$SUBJECT_ID" ]]; then
    run_expect_status \
      "create exam cross_school (guru cross)" \
      "POST" \
      "/api/v1/admin/exams" \
      "{\"title\":\"UAT POSITIVE CROSS\",\"subject_id\":${SUBJECT_ID},\"management_scope\":\"cross_school\"}" \
      "201" || failed=$((failed + 1))
  else
    echo "SKIP  create exam cross_school check (set SUBJECT_ID to enable)"
  fi

  if [[ -n "$EXAM_SAME_ID" ]]; then
    run_expect_status \
      "guard: same_school exam still denies school_b" \
      "POST" \
      "/api/v1/admin/exams/${EXAM_SAME_ID}/assignments/by-class/append" \
      "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
      "403" || failed=$((failed + 1))
  else
    echo "SKIP  same_school guard check (set EXAM_SAME_ID to enable)"
  fi

  if [[ "$failed" -gt 0 ]]; then
    echo "== RESULT: FAIL (${failed} scenario gagal) =="
    exit 1
  fi

  echo "== RESULT: PASS (semua skenario positif sesuai ekspektasi) =="
}

main "$@"
