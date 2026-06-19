#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${MNEMIC_CODEX_CONFIG_PATH:-$HOME/.codex/config.toml}"
SERVER_NAME="${MNEMIC_CODEX_MCP_SERVER_NAME:-mnemic_memory}"
API_BASE="${MNEMIC_API_BASE:-http://localhost:8088}"
RUNNER="$ROOT_DIR/scripts/run-agent-memory-mcp.sh"
TMP_PATH="$(mktemp)"

mkdir -p "$(dirname "$CONFIG_PATH")"
touch "$CONFIG_PATH"

awk -v server="$SERVER_NAME" '
  $0 == "[mcp_servers." server "]" { skip = 1; next }
  $0 == "[mcp_servers." server ".env]" { skip = 1; next }
  /^\[/ && skip { skip = 0 }
  !skip { print }
' "$CONFIG_PATH" > "$TMP_PATH"

{
  printf '\n[mcp_servers.%s]\n' "$SERVER_NAME"
  printf 'command = "%s"\n' "$RUNNER"
  printf 'args = []\n'
  printf 'startup_timeout_sec = 120\n'
  printf '\n[mcp_servers.%s.env]\n' "$SERVER_NAME"
  printf 'MNEMIC_API_BASE = "%s"\n' "$API_BASE"
} >> "$TMP_PATH"

cp "$CONFIG_PATH" "$CONFIG_PATH.bak.$(date +%Y%m%d%H%M%S)"
mv "$TMP_PATH" "$CONFIG_PATH"

echo "Installed Codex MCP server '$SERVER_NAME' in $CONFIG_PATH"
echo "Mnemic backend expected at $API_BASE"
