#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MNEMIC_ENV:-$ROOT_DIR/.env.mnemic}"
EXAMPLE_ENV_FILE="$ROOT_DIR/.env.mnemic.example"
PID_FILE="${MNEMIC_PID_FILE:-$ROOT_DIR/target/mnemic-backend.pid}"
LOG_FILE="${MNEMIC_LOG_FILE:-$ROOT_DIR/target/mnemic-backend.log}"

mkdir -p "$ROOT_DIR/target"

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
fi

export SERVER_PORT="${SERVER_PORT:-${MNEMIC_PORT:-8088}}"
export MNEMIC_MEMORY_FILE="${MNEMIC_MEMORY_FILE:-$ROOT_DIR/target/mnemic-memory.json}"
export MNEMIC_SQLITE_FILE="${MNEMIC_SQLITE_FILE:-$ROOT_DIR/target/mnemic-memory.sqlite}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm to run the Mnemic TypeScript backend." >&2
  exit 1
fi

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$ROOT_DIR/docker-compose.agent-memory.yml" "$@"
  elif docker compose version >/dev/null 2>&1; then
    docker compose -f "$ROOT_DIR/docker-compose.agent-memory.yml" "$@"
  else
    echo "Docker Compose is not available. Set MNEMIC_SKIP_DOCKER=1 to run the local TypeScript backend." >&2
    exit 1
  fi
}

health_url="http://127.0.0.1:$SERVER_PORT/actuator/health"

if [[ "${MNEMIC_SKIP_DOCKER:-0}" != "1" ]]; then
  if [[ "${MNEMIC_BACKEND_IN_DOCKER:-1}" != "0" ]]; then
    compose up -d --build mnemic-memory-backend
    for _ in {1..180}; do
      if curl -fsS "$health_url" >/dev/null 2>&1; then
        echo "Mnemic backend is healthy at http://127.0.0.1:$SERVER_PORT"
        echo "Backend container: mnemic-memory-backend"
        exit 0
      fi
      sleep 1
    done
    echo "Timed out waiting for Mnemic backend health at $health_url" >&2
    compose logs --tail=160 mnemic-memory-backend >&2 || true
    exit 1
  fi
  if [[ "${MNEMIC_START_NEO4J:-0}" == "1" ]]; then
    compose up -d mnemic-memory-neo4j
  fi
fi

if curl -fsS "$health_url" >/dev/null 2>&1; then
  echo "Mnemic backend is already healthy at http://127.0.0.1:$SERVER_PORT"
  exit 0
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
  echo "Backend process $(cat "$PID_FILE") is running, but health check failed: $health_url" >&2
  echo "Log: $LOG_FILE" >&2
  exit 1
fi

echo "Starting Mnemic backend on http://127.0.0.1:$SERVER_PORT"
(
  npm --prefix "$ROOT_DIR/mnemic-server" install --package-lock=false
  npm --prefix "$ROOT_DIR/mnemic-server" run build
) >>"$LOG_FILE" 2>&1

(
  cd "$ROOT_DIR"
  nohup node "$ROOT_DIR/mnemic-server/dist/server.js" >>"$LOG_FILE" 2>&1 < /dev/null &
  echo "$!" > "$PID_FILE"
)

for _ in {1..120}; do
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "Mnemic backend is healthy at http://127.0.0.1:$SERVER_PORT"
    echo "PID: $(cat "$PID_FILE")"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for Mnemic backend health at $health_url" >&2
tail -120 "$LOG_FILE" >&2 || true
exit 1
