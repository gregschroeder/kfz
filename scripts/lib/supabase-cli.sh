# shellcheck shell=bash
# Resolve Supabase CLI from this repo's devDependencies (no global/npx install).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

supabase() {
  pnpm --dir "$ROOT_DIR" exec supabase "$@"
}
