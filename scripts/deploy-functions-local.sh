#!/usr/bin/env bash
# Run KFZ edge functions against local Supabase (supabase functions serve).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/guard-local-only.sh
source "$ROOT_DIR/scripts/lib/guard-local-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

require_local_supabase_running "$ROOT_DIR"
echo "→ local edge functions (supabase functions serve)" >&2

exec supabase functions serve --env-file "$ROOT_DIR/.env.functions.local"
