#!/usr/bin/env bash
# Local dev: Docker Supabase + edge functions + PWA. Never touches hosted prod.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

started_supabase=0
functions_pid=""

if ! supabase status >/dev/null 2>&1; then
  started_supabase=1
  echo "Starting local Supabase…"
  supabase start
fi

node "$ROOT_DIR/scripts/write-local-env.mjs"
bash "$ROOT_DIR/scripts/ensure-local-seed.sh"
node "$ROOT_DIR/scripts/sync-web-assets.mjs"

echo "Starting edge functions (hot reload)…"
supabase functions serve --env-file "$ROOT_DIR/.env.functions.local" >/dev/null 2>&1 &
functions_pid=$!

cleanup() {
  if [[ -n "$functions_pid" ]]; then
    kill "$functions_pid" 2>/dev/null || true
    wait "$functions_pid" 2>/dev/null || true
  fi
  if [[ "$started_supabase" -eq 1 ]]; then
    supabase stop >/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Give functions serve a moment to bind.
sleep 1

echo "PWA dev server → http://localhost:5173"
pnpm --dir "$ROOT_DIR/web" dev
