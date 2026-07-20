#!/usr/bin/env bash
# Configure GitHub Pages (Actions source), Actions secrets/variables, custom domain.
# Does NOT change Namecheap DNS — prints the CNAME record to add manually.
#
# Usage:
#   pnpm pages:prod:setup
#   pnpm pages:prod:setup -- --domain other.example.com
#
# Default domain: kfz.schroeder.org
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_DOMAIN="kfz.schroeder.org"
DOMAIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--domain HOSTNAME]"
      echo "  Configures Pages build_type=workflow, Actions secrets/vars, and CNAME."
      echo "  Default domain: ${DEFAULT_DOMAIN}"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install with: brew install gh && gh auth login" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in to GitHub CLI. Run: gh auth login" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env — copy .env.example and set Supabase URLs." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/.env"
set +a

SUPABASE_URL="${SUPABASE_URL:-https://wchzccrcqlxgsftjbpgn.supabase.co}"
VITE_FUNCTIONS_URL="${VITE_FUNCTIONS_URL:-${SUPABASE_URL%/}/functions/v1}"
# Precedence: --domain > PAGES_CNAME in .env > default
DOMAIN="${DOMAIN:-${PAGES_CNAME:-$DEFAULT_DOMAIN}}"

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "→ repo ${REPO}"

# --- Pages: source = GitHub Actions (build_type=workflow) ---
# Existence check must use HTTP success/failure — .status is often JSON null.
echo "Configuring Pages source = GitHub Actions…"
if gh api "repos/${REPO}/pages" >/dev/null 2>&1; then
  gh api "repos/${REPO}/pages" \
    --method PUT \
    -f build_type=workflow \
    >/dev/null
  echo "  updated Pages site (workflow)"
else
  if create_out="$(gh api "repos/${REPO}/pages" --method POST -f build_type=workflow 2>&1)"; then
    echo "  created Pages site (workflow)"
  elif printf '%s' "$create_out" | grep -qi 'already enabled'; then
    gh api "repos/${REPO}/pages" \
      --method PUT \
      -f build_type=workflow \
      >/dev/null
    echo "  Pages already enabled — set workflow"
  else
    printf '%s\n' "$create_out" >&2
    exit 1
  fi
fi

# --- Actions variables (no API key — household key is entered in the PWA) ---
echo "Setting Actions variables…"
gh variable set SUPABASE_URL --repo "$REPO" --body "$SUPABASE_URL"
gh variable set VITE_FUNCTIONS_URL --repo "$REPO" --body "$VITE_FUNCTIONS_URL"
gh variable set PAGES_CNAME --repo "$REPO" --body "$DOMAIN"

echo "Setting Pages custom domain → ${DOMAIN}…"
gh api "repos/${REPO}/pages" \
  --method PUT \
  -f build_type=workflow \
  -f cname="$DOMAIN" \
  >/dev/null

if gh api "repos/${REPO}/pages" \
  --method PUT \
  -F https_enforced=true \
  >/dev/null 2>&1; then
  echo "  https_enforced=true"
else
  echo "  note: https_enforced not set yet — wait for DNS, then re-run this script"
fi

SUBHOST="${DOMAIN%%.*}"
echo
echo "Namecheap DNS (if not already set):"
echo "  Type:  CNAME"
echo "  Host:  ${SUBHOST}"
echo "  Value: gregschroeder.github.io"
echo "  TTL:   Automatic"

echo
PAGES_JSON="$(gh api "repos/${REPO}/pages")"
python3 - "$PAGES_JSON" <<'PY'
import json, sys
p = json.loads(sys.argv[1])
print("Pages configured.")
print(f"  build_type: {p.get('build_type')}")
print(f"  cname:      {p.get('cname')}")
print(f"  url:        {p.get('html_url')}")
print(f"  https:      {p.get('https_enforced')}")
PY

echo
echo "Next: commit/push the workflow if needed, then:"
echo "  git push origin main"
echo "  # or: gh workflow run deploy-pages.yml"
