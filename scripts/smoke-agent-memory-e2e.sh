#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${MNEMIC_E2E_LOG_DIR:-$ROOT_DIR/target/mnemic-e2e}"
BACKEND_PID=""

mkdir -p "$LOG_DIR"

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

pick_port() {
  node -e "const net=require('net'); const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{console.log(s.address().port); s.close();});"
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local log_file="$3"
  for _ in {1..90}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $name at $url" >&2
  echo "Log: $log_file" >&2
  tail -120 "$log_file" >&2 || true
  return 1
}

BACKEND_PORT="${MNEMIC_E2E_BACKEND_PORT:-$(pick_port)}"
BACKEND_LOG="$LOG_DIR/mnemic-backend.log"
MEMORY_FILE="$LOG_DIR/mnemic-memory.json"

echo "Building Mnemic TypeScript backend"
npm --prefix "$ROOT_DIR/mnemic-server" install --package-lock=false
npm --prefix "$ROOT_DIR/mnemic-server" run build

echo "Starting Mnemic backend on http://127.0.0.1:$BACKEND_PORT"
(
  cd "$ROOT_DIR"
  SERVER_PORT="$BACKEND_PORT" MNEMIC_MEMORY_FILE="$MEMORY_FILE" node "$ROOT_DIR/mnemic-server/dist/server.js"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID="$!"

wait_for_http "http://127.0.0.1:$BACKEND_PORT/actuator/health" "Mnemic backend" "$BACKEND_LOG"

echo "Running MCP live E2E smoke"
(
  cd "$ROOT_DIR/mcp-server"
  if [[ ! -d node_modules ]]; then
    npm install --package-lock=false
  fi
  npm run build
  MNEMIC_RUN_LIVE_E2E=1 MNEMIC_API_BASE="http://127.0.0.1:$BACKEND_PORT" node --test test/mcp-live-e2e.mjs
)

echo "Mnemic memory live E2E smoke passed."
