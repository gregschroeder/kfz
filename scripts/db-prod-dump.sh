#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# shellcheck source=lib/guard-prod-only.sh
source "$ROOT_DIR/scripts/lib/guard-prod-only.sh"
# shellcheck source=lib/supabase-cli.sh
source "$ROOT_DIR/scripts/lib/supabase-cli.sh"
guard_prod_only "$ROOT_DIR"
supabase db dump -s kfz -f tmp/dump-kfz.sql
