#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BENCHMARK_DIR="${MNEMIC_BENCHMARK_DIR:-$ROOT_DIR/target/mnemic-benchmark}"
PROJECT="${MNEMIC_BENCHMARK_PROJECT:-mnemic-benchmark}"
LIMIT="${MNEMIC_BENCHMARK_LIMIT:-5}"
REPORT_FILE="${MNEMIC_BENCHMARK_REPORT:-$BENCHMARK_DIR/mnemic-eval-report.md}"
BACKEND_PID=""

mkdir -p "$BENCHMARK_DIR"

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found. Install it and run this benchmark again." >&2
    exit 1
  fi
}

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

require_command node
require_command npm
require_command curl

PORT="${MNEMIC_BENCHMARK_PORT:-$(pick_port)}"
API_BASE="http://127.0.0.1:$PORT"
MEMORY_FILE="$BENCHMARK_DIR/mnemic-benchmark-memory.json"
BACKEND_LOG="$BENCHMARK_DIR/mnemic-benchmark-backend.log"

rm -f "$MEMORY_FILE" "$REPORT_FILE"

echo "==> Building Mnemic benchmark runtime"
npm --prefix "$ROOT_DIR/mnemic-server" run build >/dev/null
npm --prefix "$ROOT_DIR/mnemic-cli" run build >/dev/null

echo "==> Starting isolated benchmark backend on $API_BASE"
(
  cd "$ROOT_DIR"
  SERVER_PORT="$PORT" MNEMIC_MEMORY_FILE="$MEMORY_FILE" node "$ROOT_DIR/mnemic-server/dist/server.js"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID="$!"

wait_for_http "$API_BASE/actuator/health" "Mnemic benchmark backend" "$BACKEND_LOG"

echo "==> Running deterministic coding-agent memory eval"
node "$ROOT_DIR/mnemic-cli/dist/index.js" eval \
  --base-url "$API_BASE" \
  --fixture coding-agent \
  --project "$PROJECT" \
  --limit "$LIMIT" \
  --markdown \
  | tee "$REPORT_FILE"

echo
echo "Benchmark report written to $REPORT_FILE"
