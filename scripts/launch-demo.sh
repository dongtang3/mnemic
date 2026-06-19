#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="${MNEMIC_DEMO_DIR:-$ROOT_DIR/target/mnemic-launch-demo}"
PROJECT="${MNEMIC_DEMO_PROJECT:-mnemic-demo}"
KEEPALIVE="${MNEMIC_DEMO_KEEPALIVE:-0}"
OBSERVED_AT="${MNEMIC_DEMO_OBSERVED_AT:-2026-06-18T00:00:00.000Z}"
BACKEND_PID=""

mkdir -p "$DEMO_DIR"

cleanup() {
  if [[ "$KEEPALIVE" == "1" ]]; then
    return
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 was not found. Install it and run this demo again." >&2
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

section() {
  printf '\n==> %s\n' "$1"
}

run_cli() {
  node "$ROOT_DIR/mnemic-cli/dist/index.js" "$@" --base-url "$API_BASE"
}

memory_uid_for() {
  local query="$1"
  curl -fsS --get "$API_BASE/api/agent-memory/memories" \
    --data-urlencode "project=$PROJECT" \
    --data-urlencode "query=$query" \
    --data-urlencode "limit=1" \
    | node -e 'const fs=require("fs"); const items=JSON.parse(fs.readFileSync(0,"utf8")); if (!items[0]) { process.exit(1) } console.log(items[0].entityUid)'
}

require_command node
require_command npm
require_command curl

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  section "Installing workspace dependencies"
  (cd "$ROOT_DIR" && npm install)
fi

section "Building the demo runtime"
npm --prefix "$ROOT_DIR/mnemic-server" run build >/dev/null
npm --prefix "$ROOT_DIR/mnemic-cli" run build >/dev/null

PORT="${MNEMIC_DEMO_PORT:-$(pick_port)}"
API_BASE="http://127.0.0.1:$PORT"
MEMORY_FILE="$DEMO_DIR/mnemic-demo-memory.json"
BACKEND_LOG="$DEMO_DIR/mnemic-demo-backend.log"

rm -f "$MEMORY_FILE"

section "Starting isolated Mnemic backend"
(
  cd "$ROOT_DIR"
  SERVER_PORT="$PORT" MNEMIC_MEMORY_FILE="$MEMORY_FILE" node "$ROOT_DIR/mnemic-server/dist/server.js"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID="$!"

wait_for_http "$API_BASE/actuator/health" "Mnemic backend" "$BACKEND_LOG"
echo "Backend: $API_BASE"
echo "Memory file: $MEMORY_FILE"

section "1. Health check"
run_cli health | tee "$DEMO_DIR/01-health.txt"

section "2. Write source-keyed memories"
run_cli remember \
  --project "$PROJECT" \
  --type decision \
  --title "Shared agent memory is a project primitive" \
  --content "Mnemic treats long-term memory as an auditable project resource shared by Codex, Claude Code, Cursor, and custom MCP clients." \
  --tag mcp \
  --tag typescript \
  --tag local-first \
  --source demo \
  --source-key "$PROJECT/shared-agent-memory" \
  --importance 0.95 \
  --confidence 0.94 \
  --observed-at "$OBSERVED_AT" \
  | tee "$DEMO_DIR/02-memory-primary.txt"

PRIMARY_UID="$(memory_uid_for "Shared agent memory")"

run_cli remember \
  --project "$PROJECT" \
  --type workflow \
  --title "Preview before durable memory writes" \
  --content "Agents should call preview before saving durable memory so policy findings, changed fields, and relation changes are inspectable." \
  --tag governance \
  --tag preview \
  --source demo \
  --source-key "$PROJECT/preview-before-write" \
  --importance 0.9 \
  --confidence 0.92 \
  --observed-at "$OBSERVED_AT" \
  | tee "$DEMO_DIR/03-memory-preview-workflow.txt"

PREVIEW_UID="$(memory_uid_for "Preview before durable memory writes")"

run_cli remember \
  --project "$PROJECT" \
  --type release \
  --title "Audit memory before release" \
  --content "Run mnemic audit before publishing so missing source keys, stale records, low-confidence decisions, and orphan graph nodes are visible." \
  --tag release \
  --tag audit \
  --source demo \
  --source-key "$PROJECT/audit-before-release" \
  --importance 0.88 \
  --confidence 0.91 \
  --observed-at "$OBSERVED_AT" \
  | tee "$DEMO_DIR/04-memory-release-audit.txt"

AUDIT_UID="$(memory_uid_for "Audit memory before release")"

section "3. Link memories into a graph"
run_cli link "$PREVIEW_UID" "$PRIMARY_UID" \
  --relationship-type supports \
  --reason "The preview workflow supports safe shared agent memory." \
  | tee "$DEMO_DIR/05-link-preview-to-primary.txt"

run_cli link "$AUDIT_UID" "$PREVIEW_UID" \
  --relationship-type depends_on \
  --reason "Release hygiene depends on previewing memory writes." \
  | tee "$DEMO_DIR/06-link-audit-to-preview.txt"

section "4. Preview an idempotent update without mutating state"
run_cli preview \
  --project "$PROJECT" \
  --type decision \
  --title "Shared agent memory is a project primitive" \
  --content "Mnemic keeps source-keyed memories auditable and idempotent across agents, sessions, and MCP clients." \
  --tag mcp \
  --tag typescript \
  --tag local-first \
  --source demo \
  --source-key "$PROJECT/shared-agent-memory" \
  --importance 0.96 \
  --confidence 0.95 \
  --observed-at "$OBSERVED_AT" \
  | tee "$DEMO_DIR/07-preview-update.txt"

section "5. Explain recall"
run_cli explain "source-keyed preview audit" \
  --project "$PROJECT" \
  --limit 5 \
  | tee "$DEMO_DIR/08-explain.txt"

section "6. Build a prompt-ready context pack"
run_cli context "release memory hygiene" \
  --project "$PROJECT" \
  --limit 5 \
  | tee "$DEMO_DIR/09-context-pack.txt"

section "7. Start-of-session briefing"
run_cli briefing \
  --project "$PROJECT" \
  --limit 5 \
  | tee "$DEMO_DIR/10-briefing.txt"

section "8. Audit memory hygiene"
run_cli audit \
  --project "$PROJECT" \
  --max-blocks 0 \
  --max-warnings 0 \
  | tee "$DEMO_DIR/11-audit.txt"

section "9. Inspect append-only timeline"
run_cli timeline \
  --project "$PROJECT" \
  --limit 8 \
  | tee "$DEMO_DIR/12-timeline.txt"

section "10. Replay the event log into a graph snapshot"
run_cli snapshot \
  --project "$PROJECT" \
  --limit 8 \
  | tee "$DEMO_DIR/13-snapshot.txt"

section "11. Write launch report"
cat >"$DEMO_DIR/mnemic-launch-report.md" <<REPORT
# Mnemic Launch Demo

Project: \`$PROJECT\`
Backend: \`$API_BASE\`
Memory file: \`$MEMORY_FILE\`

This isolated demo proved the public first-run path:

- health check reached the TypeScript backend
- source-keyed memories were created
- explicit graph relations were linked
- idempotent write preview showed changed fields without mutation
- recall explanation exposed matched fields and relation paths
- context pack and session briefing produced prompt-ready memory
- audit passed with zero blocks and zero warnings
- timeline showed append-only memory events
- snapshot replay reconstructed the current memory graph from the event log

Key artifacts:

- \`07-preview-update.txt\`
- \`08-explain.txt\`
- \`09-context-pack.txt\`
- \`11-audit.txt\`
- \`12-timeline.txt\`
- \`13-snapshot.txt\`

Run again with:

\`\`\`bash
npm run demo
\`\`\`
REPORT
echo "Launch report: $DEMO_DIR/mnemic-launch-report.md"

section "Demo complete"
echo "Artifacts: $DEMO_DIR"
if [[ "$KEEPALIVE" == "1" ]]; then
  echo "Backend is still running at $API_BASE"
  echo "Stop it with: kill $BACKEND_PID"
else
  echo "Backend will stop automatically. Set MNEMIC_DEMO_KEEPALIVE=1 to keep it running."
fi
