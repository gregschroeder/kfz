#!/usr/bin/env bash
# Apply pending migrations to local Docker + refresh local env files.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/guard-local-only.sh
source "$ROOT_DIR/scripts/lib/guard-local-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

require_local_supabase_running "$ROOT_DIR"

echo "=== local:up (migrations + env) ==="
supabase db push --local
node "$ROOT_DIR/scripts/write-local-env.mjs"
bash "$ROOT_DIR/scripts/ensure-local-seed.sh"
echo "=== local:up complete ==="
echo "Start dev with: pnpm dev:local  (functions hot-reload while running)"
