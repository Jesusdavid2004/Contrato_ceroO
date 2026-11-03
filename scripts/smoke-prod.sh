#!/bin/sh
# Smoke test wrapper (Unix). See smoke-prod.mjs for steps.
set -eu
exec node "$(dirname "$0")/smoke-prod.mjs" "$@"
