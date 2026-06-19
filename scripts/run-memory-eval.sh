#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MNEMIC_API_BASE:-http://localhost:8088}"

npm --prefix mnemic-cli run build >/dev/null
node mnemic-cli/dist/index.js eval --base-url "$BASE_URL" "$@"
