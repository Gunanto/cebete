#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSRF_CURL="$ROOT_DIR/scripts/csrf-curl.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"
COOKIE_JAR="${COOKIE_JAR:-$ROOT_DIR/.tmp_uat_teacher_scope_cookie.txt}"

GURU_USER="${GURU_USER:-}"
GURU_PASS="${GURU_PASS:-}"

EXAM_SAME_ID="${EXAM_SAME_ID:-}"
EXAM_CROSS_ID="${EXAM_CROSS_ID:-}"
SCHOOL_B_ID="${SCHOOL_B_ID:-}"
CLASS_B_ID="${CLASS_B_ID:-}"
STUDENT_B_ID="${STUDENT_B_ID:-}"

# Optional checks (create/update scope)
SUBJECT_ID="${SUBJECT_ID:-}"
EXAM_SAME_CODE="${EXAM_SAME_CODE:-}"
EXAM_SAME_TITLE="${EXAM_SAME_TITLE:-}"

usage() {
  cat <<'USAGE'
Batch UAT negatif lintas sekolah untuk guru profile `school`.

Required env:
  GURU_USER
  GURU_PASS
  EXAM_SAME_ID
  EXAM_CROSS_ID
  SCHOOL_B_ID
  CLASS_B_ID
  STUDENT_B_ID

Optional env:
  BASE_URL        (default: http://localhost:8080)
  COOKIE_JAR      (default: .tmp_uat_teacher_scope_cookie.txt)
  SUBJECT_ID      (aktifkan check create exam cross_school)
  EXAM_SAME_CODE  (aktifkan check update exam->cross_school)
  EXAM_SAME_TITLE (aktifkan check update exam->cross_school)

Example:
  BASE_URL=http://localhost:8080 \
  GURU_USER=guru.scope \
  GURU_PASS='Guru123!' \
  EXAM_SAME_ID=101 EXAM_CROSS_ID=102 \
  SCHOOL_B_ID=2 CLASS_B_ID=5 STUDENT_B_ID=77 \
  SUBJECT_ID=1 EXAM_SAME_CODE=EX-101 EXAM_SAME_TITLE='Try Out A' \
  scripts/uat_teacher_scope_negative.sh
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
  require_env "EXAM_SAME_ID"
  require_env "EXAM_CROSS_ID"
  require_env "SCHOOL_B_ID"
  require_env "CLASS_B_ID"
  require_env "STUDENT_B_ID"

  if [[ ! -x "$CSRF_CURL" ]]; then
    echo "required helper not executable: $CSRF_CURL" >&2
    exit 1
  fi

  echo "== login as guru =="
  local login_resp
  login_resp="$(BASE_URL="$BASE_URL" COOKIE_JAR="$COOKIE_JAR" "$CSRF_CURL" login "$GURU_USER" "$GURU_PASS" || true)"
  local login_code
  login_code="$(printf '%s\n' "$login_resp" | status_from_response)"
  if [[ "$login_code" != "200" ]]; then
    echo "login failed, got HTTP $login_code" >&2
    exit 1
  fi

  echo "== negative matrix (expect 403) =="
  local failed=0

  run_expect_status \
    "append by-class same_school -> school_b" \
    "POST" \
    "/api/v1/admin/exams/${EXAM_SAME_ID}/assignments/by-class/append" \
    "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
    "403" || failed=$((failed + 1))

  run_expect_status \
    "replace by-class same_school -> school_b" \
    "PUT" \
    "/api/v1/admin/exams/${EXAM_SAME_ID}/assignments/by-class" \
    "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
    "403" || failed=$((failed + 1))

  run_expect_status \
    "append by-class cross_school exam (guru school)" \
    "POST" \
    "/api/v1/admin/exams/${EXAM_CROSS_ID}/assignments/by-class/append" \
    "{\"school_id\":${SCHOOL_B_ID},\"class_id\":${CLASS_B_ID}}" \
    "403" || failed=$((failed + 1))

  run_expect_status \
    "manual assign cross_school exam (guru school)" \
    "PUT" \
    "/api/v1/admin/exams/${EXAM_CROSS_ID}/assignments" \
    "{\"user_ids\":[${STUDENT_B_ID}]}" \
    "403" || failed=$((failed + 1))

  if [[ -n "$SUBJECT_ID" ]]; then
    run_expect_status \
      "create exam cross_school (guru school)" \
      "POST" \
      "/api/v1/admin/exams" \
      "{\"title\":\"UAT NEGATIVE CROSS\",\"subject_id\":${SUBJECT_ID},\"management_scope\":\"cross_school\"}" \
      "403" || failed=$((failed + 1))
  else
    echo "SKIP  create exam cross_school check (set SUBJECT_ID to enable)"
  fi

  if [[ -n "$EXAM_SAME_CODE" && -n "$EXAM_SAME_TITLE" && -n "$SUBJECT_ID" ]]; then
    run_expect_status \
      "update same_school -> cross_school (guru school)" \
      "PUT" \
      "/api/v1/admin/exams/${EXAM_SAME_ID}" \
      "{\"code\":\"${EXAM_SAME_CODE}\",\"title\":\"${EXAM_SAME_TITLE}\",\"subject_id\":${SUBJECT_ID},\"management_scope\":\"cross_school\"}" \
      "403" || failed=$((failed + 1))
  else
    echo "SKIP  update exam->cross_school check (set EXAM_SAME_CODE, EXAM_SAME_TITLE, SUBJECT_ID to enable)"
  fi

  if [[ "$failed" -gt 0 ]]; then
    echo "== RESULT: FAIL (${failed} scenario gagal) =="
    exit 1
  fi

  echo "== RESULT: PASS (semua skenario negatif sesuai ekspektasi) =="
}

main "$@"
