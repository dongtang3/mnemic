#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MNEMIC_ENV:-$ROOT_DIR/.env.mnemic}"
EXAMPLE_ENV_FILE="$ROOT_DIR/.env.mnemic.example"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "$EXAMPLE_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$EXAMPLE_ENV_FILE"
  set +a
  echo "Using defaults from .env.mnemic.example. Create .env.mnemic to override local ports."
fi

export SERVER_PORT="${SERVER_PORT:-${MNEMIC_PORT:-8088}}"
export MNEMIC_MEMORY_FILE="${MNEMIC_MEMORY_FILE:-$ROOT_DIR/target/mnemic-memory.json}"
export MNEMIC_SQLITE_FILE="${MNEMIC_SQLITE_FILE:-$ROOT_DIR/target/mnemic-memory.sqlite}"
if [[ -z "${MNEMIC_POLICY_FILE:-}" && -f "$ROOT_DIR/.mnemic/policy.json" ]]; then
  export MNEMIC_POLICY_FILE="$ROOT_DIR/.mnemic/policy.json"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm to run the Mnemic TypeScript backend." >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/mnemic-server/node_modules" ]]; then
  npm --prefix "$ROOT_DIR/mnemic-server" install
fi

exec npm --prefix "$ROOT_DIR/mnemic-server" run dev
