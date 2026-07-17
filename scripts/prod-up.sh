#!/usr/bin/env bash
# Apply pending migrations + deploy edge functions to hosted prod.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== prod:up (migrations + functions) ==="
bash "$ROOT_DIR/scripts/db-prod-push.sh"
bash "$ROOT_DIR/scripts/deploy-functions-prod.sh"
echo "=== prod:up complete ==="
echo "Note: PWA (web/) and data (data:prod:refresh) are separate — see README."
