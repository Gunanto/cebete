#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GURU_HTML="$ROOT_DIR/web/templates/pages/guru.html"
BASE_HTML="$ROOT_DIR/web/templates/layout/base.html"
GURU_PAGE_JS="$ROOT_DIR/web/static/js/pages/guru.js"
GURU_DASHBOARD_JS="$ROOT_DIR/web/static/js/guru_dashboard.js"

EXPECT_ID_COUNT="${EXPECT_ID_COUNT:-268}"
EXPECT_MENU_COUNT="${EXPECT_MENU_COUNT:-10}"
EXPECT_JUMP_COUNT="${EXPECT_JUMP_COUNT:-4}"
EXPECT_DIALOG_COUNT="${EXPECT_DIALOG_COUNT:-10}"
EXPECT_FORM_COUNT="${EXPECT_FORM_COUNT:-13}"

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

pass() {
  echo "[PASS] $*"
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "missing file: $file"
}

count_pattern() {
  local pattern="$1"
  local file="$2"
  rg -o "$pattern" "$file" | wc -l | tr -d ' '
}

require_count() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  [[ "$actual" == "$expected" ]] || fail "$label mismatch: got=$actual expected=$expected"
  pass "$label = $actual"
}

require_contains() {
  local needle="$1"
  local file="$2"
  rg -q --fixed-strings "$needle" "$file" || fail "missing '$needle' in $file"
}

main() {
  require_file "$GURU_HTML"
  require_file "$BASE_HTML"
  require_file "$GURU_PAGE_JS"
  require_file "$GURU_DASHBOARD_JS"

  local id_count
  local menu_count
  local jump_count
  local dialog_count
  local form_count
  id_count="$(count_pattern 'id="[^"]+"' "$GURU_HTML")"
  menu_count="$(count_pattern 'data-guru-menu="[^"]+"' "$GURU_HTML")"
  jump_count="$(count_pattern 'data-guru-jump="[^"]+"' "$GURU_HTML")"
  dialog_count="$(count_pattern '<dialog[[:space:]]+id="[^"]+"' "$GURU_HTML")"
  form_count="$(count_pattern '<form id="guru-[^"]+"' "$GURU_HTML")"

  require_count "id count" "$id_count" "$EXPECT_ID_COUNT"
  require_count "data-guru-menu count" "$menu_count" "$EXPECT_MENU_COUNT"
  require_count "data-guru-jump count" "$jump_count" "$EXPECT_JUMP_COUNT"
  require_count "dialog count" "$dialog_count" "$EXPECT_DIALOG_COUNT"
  require_count "form count" "$form_count" "$EXPECT_FORM_COUNT"

  local duplicate_ids
  duplicate_ids="$(
    rg -o 'id="[^"]+"' "$GURU_HTML" \
      | sed -E 's/^id="([^"]+)"$/\1/' \
      | sort \
      | uniq -d
  )"
  [[ -z "$duplicate_ids" ]] || fail "duplicate id detected in guru.html:
$duplicate_ids"
  pass "no duplicate id in guru.html"

  local expected_menu_keys=(
    "dashboard"
    "subjects"
    "exams"
    "token"
    "enroll"
    "learning-goals"
    "manuscripts"
    "results"
    "score-recap"
    "guide"
  )
  local actual_menu_keys
  actual_menu_keys="$(
    rg -o 'data-guru-menu="[^"]+"' "$GURU_HTML" \
      | sed -E 's/^data-guru-menu="([^"]+)"$/\1/' \
      | sort -u
  )"
  for key in "${expected_menu_keys[@]}"; do
    printf '%s\n' "$actual_menu_keys" | rg -qx --fixed-strings "$key" || fail "missing menu key: $key"
  done
  pass "all expected menu keys exist"

  local critical_ids=(
    "guru-page-title"
    "guru-page-desc"
    "guru-dashboard-panel"
    "guru-learning-goals-panel"
    "guru-manuscripts-panel"
    "guru-subjects-panel"
    "guru-exams-panel"
    "guru-token-panel"
    "guru-enroll-panel"
    "guru-results-panel"
    "guru-guide-panel"
    "guru-message"
    "guru-dashboard-monitor-body"
  )
  local id_name
  for id_name in "${critical_ids[@]}"; do
    require_contains "id=\"$id_name\"" "$GURU_HTML"
  done
  pass "critical panel/message IDs exist"

  local required_api_paths=(
    "/api/v1/admin/dashboard/stats"
    "/api/v1/admin/exams/manage"
    "/api/v1/admin/exams"
    "/api/v1/questions"
    "/api/v1/question-codes"
    "/api/v1/learning-goals"
    "/api/v1/subjects"
    "/api/v1/levels"
    "/api/v1/admin/schools"
    "/api/v1/admin/classes"
  )
  local api_path
  for api_path in "${required_api_paths[@]}"; do
    rg -q --fixed-strings "$api_path" "$ROOT_DIR/web/static/js/pages/guru.js" "$ROOT_DIR/web/static/js/guru_"*.js \
      || fail "API path not found in guru frontend modules: $api_path"
  done
  pass "required API paths are present in guru frontend modules"

  require_contains '/static/js/guru_dashboard.js' "$BASE_HTML"
  require_contains '/static/js/pages/guru.js' "$BASE_HTML"
  pass "base.html still includes guru scripts"

  echo
  echo "Guru UI guard passed."
}

main "$@"
