#!/usr/bin/env bash
# Reload committed fixture SQL into local DB without re-running migrations.
# Local/dev only — refuses hosted Supabase.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="$(awk -F'"' '/^project_id = / { print $2; exit }' "$ROOT_DIR/supabase/config.toml")"
DB_CONTAINER="supabase_db_${PROJECT_ID}"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

# shellcheck source=lib/guard-local-only.sh
source "$ROOT_DIR/scripts/lib/guard-local-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

guard_local_dev_only
require_local_supabase_running "$ROOT_DIR"

log() {
  if [[ "${TEST_VERBOSE:-}" == "1" ]]; then
    echo "$@"
  fi
}

db_container() {
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    echo "$DB_CONTAINER"
    return 0
  fi
  echo "Local Supabase DB container $DB_CONTAINER is not running. Run: pnpm db:local:start" >&2
  return 1
}

apply_reset_sql() {
  local file="$1"
  log "Applying test/fixtures/$(basename "$file")…"
  if [[ "${TEST_VERBOSE:-}" == "1" ]]; then
    {
      echo "SET app.kfz_allow_reset = 'true';"
      cat "$file"
    } | docker exec -i "$(db_container)" psql -U postgres -d postgres -v ON_ERROR_STOP=1
  else
    {
      echo "SET app.kfz_allow_reset = 'true';"
      cat "$file"
    } | docker exec -i "$(db_container)" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q >/dev/null
  fi
}

has_kfz_schema() {
  local result
  result="$(supabase db query --local --output csv \
    "select coalesce(to_regclass('kfz.prefixes')::text, '')" 2>/dev/null | tail -1 || true)"
  [[ "$result" == *"prefixes"* ]]
}

if [[ "${DB_FULL_RESET:-}" == "1" ]]; then
  log "DB_FULL_RESET=1 — running guarded local reset…"
  bash "$ROOT_DIR/scripts/db-local-reset.sh" --empty
  exit 0
fi

if ! has_kfz_schema; then
  log "kfz.prefixes not found — running one-time guarded local reset…"
  bash "$ROOT_DIR/scripts/db-local-reset.sh" --empty
  exit 0
fi

apply_reset_sql "$ROOT_DIR/test/fixtures/reset-kfz-data.sql"
log "Local fixture restore complete."
