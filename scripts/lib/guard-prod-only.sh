#!/usr/bin/env bash
# Refuse prod CLI operations when the linked project is missing or unexpected.
set -euo pipefail

KFZ_PROD_PROJECT_REF="${KFZ_PROD_PROJECT_REF:-wchzccrcqlxgsftjbpgn}"

guard_prod_only() {
  local root_dir="${1:?root dir required}"
  local ref_file="$root_dir/supabase/.temp/project-ref"
  local linked=""

  if [[ -f "$ref_file" ]]; then
    linked="$(tr -d '[:space:]' < "$ref_file")"
  fi

  if [[ "$linked" != "$KFZ_PROD_PROJECT_REF" ]]; then
    echo "Refusing prod operation: linked project is '${linked:-<none>}', expected ${KFZ_PROD_PROJECT_REF}." >&2
    echo "Run: pnpm db:prod:link" >&2
    exit 1
  fi

  echo "→ prod Supabase (${KFZ_PROD_PROJECT_REF})" >&2
}
