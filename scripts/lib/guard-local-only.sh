#!/usr/bin/env bash
# Refuse destructive DB operations against hosted Supabase (prod).
# Pattern borrowed from flippy test/e2e/helpers/supabase-local.ts
set -euo pipefail

KFZ_PROD_PROJECT_REF="${KFZ_PROD_PROJECT_REF:-wchzccrcqlxgsftjbpgn}"

_kfz_hostname_from_url() {
  local url="$1"
  node -e 'try { const u = new URL(process.argv[1]); process.stdout.write(u.hostname || ""); } catch { process.exit(1); }' "$url" 2>/dev/null || true
}

_kfz_is_local_host() {
  local host="$1"
  [[ "$host" == "127.0.0.1" || "$host" == "localhost" ]]
}

_kfz_is_remote_database_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 1
  [[ "$url" == *"pooler.supabase.com"* ]] && return 0
  [[ "$url" == *"@aws-"*"supabase.com"* ]] && return 0
  return 1
}

_kfz_is_remote_supabase_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 1
  local host
  host="$(_kfz_hostname_from_url "$url")"
  [[ -z "$host" ]] && return 1
  if _kfz_is_local_host "$host"; then
    return 1
  fi
  [[ "$host" == *".supabase.co" ]] && return 0
  return 1
}

# Call before any truncate / db reset / fixture wipe.
guard_local_dev_only() {
  if [[ "${KFZ_ALLOW_PROD_RESET:-}" == "1" ]]; then
    echo "WARNING: KFZ_ALLOW_PROD_RESET=1 — local-only guard disabled" >&2
    return 0
  fi

  if _kfz_is_remote_database_url "${DATABASE_URL:-}"; then
    echo "Refusing: DATABASE_URL points at hosted Supabase. Reset is local/dev only." >&2
    exit 1
  fi

  if _kfz_is_remote_supabase_url "${SUPABASE_URL:-}"; then
    echo "Refusing: SUPABASE_URL points at hosted Supabase. Reset is local/dev only." >&2
    exit 1
  fi
}

# Require local Supabase Docker stack (supabase status API on localhost).
require_local_supabase_running() {
  local root_dir="${1:?root dir required}"

  # shellcheck source=supabase-cli.sh
  source "$root_dir/scripts/lib/supabase-cli.sh"

  if ! supabase status >/dev/null 2>&1; then
    echo "Local Supabase is not running. Start it with: pnpm db:local:start" >&2
    exit 1
  fi

  local status_env api_url host
  status_env="$(supabase status -o env)"
  api_url="$(printf '%s\n' "$status_env" | awk -F= '
    $1 == "API_URL" {
      value = substr($0, length("API_URL") + 2)
      if (value ~ /^".*"$/) value = substr(value, 2, length(value) - 2)
      print value
      exit
    }
  ')"

  if [[ -z "$api_url" ]]; then
    echo "Could not read local Supabase API_URL from 'supabase status -o env'." >&2
    exit 1
  fi

  host="$(_kfz_hostname_from_url "$api_url")"
  if ! _kfz_is_local_host "$host"; then
    echo "Refusing: supabase status API_URL is not local ($api_url)." >&2
    exit 1
  fi
}
