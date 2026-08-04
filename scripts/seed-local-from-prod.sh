#!/usr/bin/env bash
# Dump kfz schema data from hosted prod and load it into local Docker Supabase.
# Never writes to prod. Requires: linked project (pnpm db:prod:link) + local stack running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_FILE="$ROOT_DIR/tmp/dump-kfz-data.sql"
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

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "Local Supabase DB container $DB_CONTAINER is not running. Run: pnpm db:local:start" >&2
  exit 1
fi

echo "=== 1/3 Dump prod kfz data → tmp/dump-kfz-data.sql ==="
bash "$ROOT_DIR/scripts/db-prod-dump-data.sh"

if [[ ! -s "$DUMP_FILE" ]]; then
  echo "Dump file missing or empty: $DUMP_FILE" >&2
  exit 1
fi

echo "=== 2/3 Reset local DB (empty, no list seed) ==="
bash "$ROOT_DIR/scripts/db-local-reset.sh" --empty

# Migrations may insert rows (e.g. BR). Clear before loading prod data.
echo "=== 3/3 Truncate kfz tables + load prod dump ==="
{
  echo "SET app.kfz_allow_reset = 'true';"
  cat "$ROOT_DIR/test/fixtures/reset-kfz-data.sql"
  cat "$DUMP_FILE"
} | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1

prefixes="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -A -c "select count(*) from kfz.prefixes;")"
queue="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -t -A -c "select count(*) from kfz.queue;")"

echo "=== Local seeded from prod ==="
echo "  prefixes: ${prefixes}"
echo "  queue:    ${queue}"
echo "Back to normal local seed: pnpm db:local:reset"
