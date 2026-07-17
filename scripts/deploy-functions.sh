#!/usr/bin/env bash
# Deploy all KFZ edge functions to linked Supabase project.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

FUNCTIONS=(kfz-capture kfz-queue kfz-lookup kfz-process kfz-delete kfz-stats kfz-search)

for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying ${fn}..."
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "All KFZ edge functions deployed."
