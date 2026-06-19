#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${MNEMIC_PID_FILE:-$ROOT_DIR/target/mnemic-backend.pid}"

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$ROOT_DIR/docker-compose.agent-memory.yml" "$@"
  elif docker compose version >/dev/null 2>&1; then
    docker compose -f "$ROOT_DIR/docker-compose.agent-memory.yml" "$@"
  else
    return 1
  fi
}

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    for _ in {1..30}; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    echo "Stopped Mnemic backend process $pid"
  fi
  rm -f "$PID_FILE"
fi

if [[ "${MNEMIC_STOP_NEO4J:-0}" == "1" ]]; then
  compose down || true
else
  compose stop mnemic-memory-backend || true
fi
