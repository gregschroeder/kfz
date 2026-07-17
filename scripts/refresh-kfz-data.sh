#!/usr/bin/env bash
# Scrape kennzeichenking.de → data/kfz-list.json → upsert into kfz.prefixes
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -x venv/bin/python ]]; then
  echo "Python venv not found. Create it with:" >&2
  echo "  python3 -m venv venv && venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

echo "Scraping prefix list…"
venv/bin/python scripts/kfz.py

echo "Seeding database from data/kfz-list.json…"
pnpm run data:seed

echo "refresh-kfz-data complete."
