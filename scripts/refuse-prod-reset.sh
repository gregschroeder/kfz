#!/usr/bin/env bash
echo "Refusing: db:prod:reset is not allowed. Prod data is never reset from this repo." >&2
exit 1
