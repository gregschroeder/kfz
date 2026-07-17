#!/usr/bin/env bash
# Push secrets from .env to linked Supabase project (no dashboard).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example and fill in values." >&2
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

cd "$ROOT_DIR"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"

supabase secrets set \
  KFZ_API_KEY="$KFZ_API_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_URL="$SUPABASE_URL"

echo "Secrets pushed to linked Supabase project."
