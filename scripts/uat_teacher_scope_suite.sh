#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NEG_SCRIPT="$ROOT_DIR/scripts/uat_teacher_scope_negative.sh"
POS_SCRIPT="$ROOT_DIR/scripts/uat_teacher_scope_positive.sh"

BASE_URL="${BASE_URL:-http://localhost:8080}"

COOKIE_JAR_NEG="${COOKIE_JAR_NEG:-$ROOT_DIR/.tmp_uat_teacher_scope_neg_cookie.txt}"
COOKIE_JAR_POS="${COOKIE_JAR_POS:-$ROOT_DIR/.tmp_uat_teacher_scope_pos_cookie.txt}"

NEG_GURU_USER="${NEG_GURU_USER:-${GURU_USER:-}}"
NEG_GURU_PASS="${NEG_GURU_PASS:-${GURU_PASS:-}}"
POS_GURU_USER="${POS_GURU_USER:-${GURU_USER:-}}"
POS_GURU_PASS="${POS_GURU_PASS:-${GURU_PASS:-}}"

EXAM_SAME_ID="${EXAM_SAME_ID:-}"
EXAM_CROSS_ID="${EXAM_CROSS_ID:-}"
SCHOOL_B_ID="${SCHOOL_B_ID:-}"
CLASS_B_ID="${CLASS_B_ID:-}"
STUDENT_B_ID="${STUDENT_B_ID:-}"
SUBJECT_ID="${SUBJECT_ID:-}"
EXAM_SAME_CODE="${EXAM_SAME_CODE:-}"
EXAM_SAME_TITLE="${EXAM_SAME_TITLE:-}"

PROMPT_BETWEEN_PHASES="${PROMPT_BETWEEN_PHASES:-1}"

usage() {
  cat <<'USAGE'
Jalankan suite UAT teacher scope: NEGATIVE (guru school) -> POSITIVE (guru cross_school).

Required env (shared):
  EXAM_SAME_ID
  EXAM_CROSS_ID
  SCHOOL_B_ID
  CLASS_B_ID
  STUDENT_B_ID

Required env auth:
  NEG_GURU_USER / NEG_GURU_PASS
  POS_GURU_USER / POS_GURU_PASS

Optional env:
  GURU_USER / GURU_PASS            fallback untuk NEG_* dan POS_*
  SUBJECT_ID                       aktifkan check create exam cross_school pada kedua fase
  EXAM_SAME_CODE / EXAM_SAME_TITLE aktifkan check update same->cross pada fase negatif
  BASE_URL                         default: http://localhost:8080
  COOKIE_JAR_NEG                   cookie jar fase negatif
  COOKIE_JAR_POS                   cookie jar fase positif
  PROMPT_BETWEEN_PHASES            1 (default) / 0

Example:
  BASE_URL=http://localhost:8080 \
  NEG_GURU_USER=guru.school NEG_GURU_PASS='Guru123!' \
  POS_GURU_USER=guru.cross POS_GURU_PASS='Guru123!' \
  EXAM_SAME_ID=101 EXAM_CROSS_ID=102 \
  SCHOOL_B_ID=2 CLASS_B_ID=5 STUDENT_B_ID=77 \
  SUBJECT_ID=1 EXAM_SAME_CODE=EX-101 EXAM_SAME_TITLE='Try Out A' \
  scripts/uat_teacher_scope_suite.sh
USAGE
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: $name" >&2
    exit 1
  fi
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  if [[ ! -x "$NEG_SCRIPT" ]]; then
    echo "required script not executable: $NEG_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -x "$POS_SCRIPT" ]]; then
    echo "required script not executable: $POS_SCRIPT" >&2
    exit 1
  fi

  require_env "NEG_GURU_USER"
  require_env "NEG_GURU_PASS"
  require_env "POS_GURU_USER"
  require_env "POS_GURU_PASS"
  require_env "EXAM_SAME_ID"
  require_env "EXAM_CROSS_ID"
  require_env "SCHOOL_B_ID"
  require_env "CLASS_B_ID"
  require_env "STUDENT_B_ID"

  echo "== PHASE 1: NEGATIVE (guru profile school) =="
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

  echo
  echo "Negative phase finished."
  echo "Lanjutkan dengan memastikan guru untuk fase positif sudah profile cross_school."

  if [[ "$PROMPT_BETWEEN_PHASES" == "1" ]]; then
    read -r -p "Tekan ENTER untuk lanjut ke fase positif..."
  fi

  echo
  echo "== PHASE 2: POSITIVE (guru profile cross_school) =="
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
  echo "== SUITE RESULT: PASS (negative + positive completed) =="
}

main "$@"
