#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$ROOT_DIR/mcp-server"

if [[ ! -d "$MCP_DIR/node_modules" ]]; then
  echo "Missing $MCP_DIR/node_modules. Run: cd $MCP_DIR && npm install" >&2
  exit 1
fi

if [[ ! -f "$MCP_DIR/dist/index.js" ]]; then
  (cd "$MCP_DIR" && npm run build) >&2
fi

exec node "$MCP_DIR/dist/index.js"
