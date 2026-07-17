#!/usr/bin/env bash
# Deploy all KFZ edge functions to hosted prod (linked Supabase project).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/guard-prod-only.sh
source "$ROOT_DIR/scripts/lib/guard-prod-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

guard_prod_only "$ROOT_DIR"

FUNCTIONS=(kfz-capture kfz-queue kfz-lookup kfz-process kfz-delete kfz-stats kfz-search)

for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying ${fn} to prod…"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "All KFZ edge functions deployed to prod."
