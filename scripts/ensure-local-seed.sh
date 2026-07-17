#!/usr/bin/env bash
# Load data/kfz-list.json into local DB when only test fixtures (or empty) are present.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_PREFIXES="${KFZ_LOCAL_MIN_PREFIXES:-100}"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

# shellcheck source=lib/guard-local-only.sh
source "$ROOT_DIR/scripts/lib/guard-local-only.sh"

guard_local_dev_only

PROJECT_ID="$(awk -F'"' '/^project_id = / { print $2; exit }' "$ROOT_DIR/supabase/config.toml")"
DB_CONTAINER="supabase_db_${PROJECT_ID}"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "Local Supabase DB container $DB_CONTAINER is not running." >&2
  exit 1
fi

count="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -A -c "select count(*) from kfz.prefixes;" 2>/dev/null || echo 0)"

if [[ "${count:-0}" -ge "$MIN_PREFIXES" ]]; then
  exit 0
fi

echo "Local DB has ${count:-0} prefixes — seeding from data/kfz-list.json…"
KFZ_ENV=local node "$ROOT_DIR/scripts/seed-from-list.mjs"
