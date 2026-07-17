#!/usr/bin/env bash
# Push secrets from .env to hosted prod (linked Supabase project).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example and fill in prod values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${KFZ_API_KEY:-}" ]]; then
  echo "KFZ_API_KEY is not set in .env" >&2
  exit 1
fi

# shellcheck source=lib/guard-prod-only.sh
source "$ROOT_DIR/scripts/lib/guard-prod-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

guard_prod_only "$ROOT_DIR"

cd "$ROOT_DIR"
supabase secrets set \
  KFZ_API_KEY="$KFZ_API_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_URL="$SUPABASE_URL"

echo "Secrets pushed to prod."
