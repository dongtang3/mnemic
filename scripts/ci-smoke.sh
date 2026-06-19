#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${MNEMIC_CI_LOG_DIR:-$ROOT_DIR/target/mnemic-ci}"
POLICY_BACKEND_PID=""

mkdir -p "$LOG_DIR"

cleanup() {
  if [[ -n "$POLICY_BACKEND_PID" ]] && kill -0 "$POLICY_BACKEND_PID" >/dev/null 2>&1; then
    kill "$POLICY_BACKEND_PID" >/dev/null 2>&1 || true
    wait "$POLICY_BACKEND_PID" >/dev/null 2>&1 || true
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

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -E "$pattern" "$file" >/dev/null 2>&1; then
    echo "Expected $file to contain: $pattern" >&2
    cat "$file" >&2 || true
    return 1
  fi
}

echo "==> Running workspace tests"
(cd "$ROOT_DIR" && npm test)

echo "==> Building workspace"
(cd "$ROOT_DIR" && npm run build)

echo "==> Checking launch demo script"
bash -n "$ROOT_DIR/scripts/launch-demo.sh"
bash -n "$ROOT_DIR/scripts/run-benchmark-report.sh"

echo "==> Checking launch readiness"
node "$ROOT_DIR/scripts/check-launch-readiness.mjs"

echo "==> Checking docs integrity"
node "$ROOT_DIR/scripts/check-docs-integrity.mjs"

echo "==> Checking TypeScript rewrite boundary"
node "$ROOT_DIR/scripts/check-typescript-rewrite.mjs"

echo "==> Checking completion audit"
node "$ROOT_DIR/scripts/check-completion-audit.mjs"

echo "==> Checking repository identity metadata"
node "$ROOT_DIR/scripts/check-repository-migration.mjs"

echo "==> Checking public launch readiness"
node "$ROOT_DIR/scripts/check-publication-readiness.mjs"

echo "==> Checking supply-chain readiness"
node "$ROOT_DIR/scripts/check-supply-chain.mjs"

echo "==> Checking community health"
node "$ROOT_DIR/scripts/check-community-health.mjs"

echo "==> Checking security hardening"
node "$ROOT_DIR/scripts/check-security-hardening.mjs"

echo "==> Checking GitHub launch copy"
node "$ROOT_DIR/scripts/check-github-launch.mjs"

echo "==> Checking Docker readiness"
node "$ROOT_DIR/scripts/check-docker-readiness.mjs"

echo "==> Checking benchmark landscape"
node "$ROOT_DIR/scripts/check-benchmark-landscape.mjs"

echo "==> Checking market readiness"
node "$ROOT_DIR/scripts/check-market-readiness.mjs"

echo "==> Checking release readiness"
node "$ROOT_DIR/scripts/check-release-readiness.mjs"

echo "==> Checking package readiness"
node "$ROOT_DIR/scripts/check-package-readiness.mjs"

echo "==> Checking OpenAPI contract"
node "$ROOT_DIR/scripts/check-openapi.mjs"

echo "==> Running offline doctor"
(cd "$ROOT_DIR" && npm run doctor)

echo "==> Running MCP live smoke"
"$ROOT_DIR/scripts/smoke-agent-memory-e2e.sh"

POLICY_PORT="${MNEMIC_CI_POLICY_PORT:-$(pick_port)}"
POLICY_LOG="$LOG_DIR/policy-backend.log"
POLICY_MEMORY_FILE="$LOG_DIR/policy-memory.json"
POLICY_FILE="$ROOT_DIR/.mnemic/policy.example.json"

echo "==> Starting policy-configured backend on http://127.0.0.1:$POLICY_PORT"
(
  cd "$ROOT_DIR"
  SERVER_PORT="$POLICY_PORT" \
    MNEMIC_MEMORY_FILE="$POLICY_MEMORY_FILE" \
    MNEMIC_POLICY_FILE="$POLICY_FILE" \
    node "$ROOT_DIR/mnemic-server/dist/server.js"
) >"$POLICY_LOG" 2>&1 &
POLICY_BACKEND_PID="$!"

wait_for_http "http://127.0.0.1:$POLICY_PORT/actuator/health" "policy-configured Mnemic backend" "$POLICY_LOG"

echo "==> Running model-free memory eval"
MNEMIC_API_BASE="http://127.0.0.1:$POLICY_PORT" \
  "$ROOT_DIR/scripts/run-memory-eval.sh" --project mnemic-ci-eval --limit 5 --fail-below 1

echo "==> Checking policy status CLI"
POLICY_STATUS_FILE="$LOG_DIR/policy-status.txt"
node "$ROOT_DIR/mnemic-cli/dist/index.js" policy --base-url "http://127.0.0.1:$POLICY_PORT" >"$POLICY_STATUS_FILE"
assert_file_contains "$POLICY_STATUS_FILE" 'Mnemic Policy Status'
assert_file_contains "$POLICY_STATUS_FILE" 'secret-company-token'

echo "==> Checking memory audit CLI"
AUDIT_STATUS_FILE="$LOG_DIR/audit-status.txt"
node "$ROOT_DIR/mnemic-cli/dist/index.js" audit --base-url "http://127.0.0.1:$POLICY_PORT" --project mnemic-ci-eval --max-blocks 0 >"$AUDIT_STATUS_FILE"
assert_file_contains "$AUDIT_STATUS_FILE" 'Mnemic Memory Audit'
assert_file_contains "$AUDIT_STATUS_FILE" 'healthScore'

echo "==> Checking configurable policy preview"
POLICY_PREVIEW_FILE="$LOG_DIR/policy-preview.json"
curl -fsS "http://127.0.0.1:$POLICY_PORT/api/agent-memory/memories/preview" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Company token smoke","content":"company_live_12345678901234567890","project":"mnemic","sourceKey":"ci/company-token"}' \
  >"$POLICY_PREVIEW_FILE"
assert_file_contains "$POLICY_PREVIEW_FILE" 'secret-company-token'
assert_file_contains "$POLICY_PREVIEW_FILE" 'Potential company token detected'

echo "==> Checking configurable policy block"
POLICY_BLOCK_FILE="$LOG_DIR/policy-block.json"
POLICY_BLOCK_STATUS="$(curl -sS -o "$POLICY_BLOCK_FILE" -w '%{http_code}' \
  "http://127.0.0.1:$POLICY_PORT/api/agent-memory/memories" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Company token blocked","content":"company_live_12345678901234567890","project":"mnemic","sourceKey":"ci/company-token-block"}')"
if [[ "$POLICY_BLOCK_STATUS" != "400" ]]; then
  echo "Expected policy block HTTP 400, got $POLICY_BLOCK_STATUS" >&2
  cat "$POLICY_BLOCK_FILE" >&2 || true
  exit 1
fi
assert_file_contains "$POLICY_BLOCK_FILE" 'secret-company-token'

echo "Mnemic CI smoke passed."
