#!/usr/bin/env bash
echo "Refusing: database reset against hosted Supabase is not supported." >&2
echo "Use local dev only: pnpm db:local:reset" >&2
exit 1
