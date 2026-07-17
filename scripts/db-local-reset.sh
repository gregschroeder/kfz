#!/usr/bin/env bash
# Reset local Supabase only — never hosted prod.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

empty=0
if [[ "${1:-}" == "--empty" ]]; then
  empty=1
fi

echo "Resetting local Supabase database (migrations only, no remote/prod)…"

if [[ "$empty" -eq 1 ]]; then
  supabase db reset --local --no-seed
else
  supabase db reset --local --no-seed
  bash "$ROOT_DIR/scripts/restore-local-fixtures.sh"
  bash "$ROOT_DIR/scripts/ensure-local-seed.sh"
fi

echo "Local database reset complete."
