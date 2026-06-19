# Mnemic MCP Client Configs

These snippets connect Codex, Claude Code, or another MCP client to the local Mnemic memory server.

Run the backend and build the MCP adapter first:

```bash
npm run init
scripts/start-agent-memory-stack.sh

cd mcp-server
npm install
npm run build
```

## Codex

Install the local server entry with:

```bash
scripts/install-codex-mcp.sh
```

The script writes an idempotent server block and keeps a timestamped backup of the previous config.

```toml
[mcp_servers.mnemic_memory]
command = "/path/to/mnemic/scripts/run-agent-memory-mcp.sh"
args = []
startup_timeout_sec = 120

[mcp_servers.mnemic_memory.env]
MNEMIC_API_BASE = "http://localhost:8088"
```

## JSON MCP Clients

```json
{
  "mcpServers": {
    "mnemic-memory": {
      "command": "/bin/bash",
      "args": ["./scripts/run-agent-memory-mcp.sh"],
      "env": {
        "MNEMIC_API_BASE": "http://localhost:8088"
      }
    }
  }
}
```

The repository tests validate that `.mcp.json` can launch the MCP server and expose the `mnemic_*` tools.

## Init Command

The source-workspace quickstart can generate `.mcp.json` and local memory settings:

```bash
npm run init
```

The command creates `.env.mnemic`, `.mnemic/policy.json`, `.mcp.json`, and `AGENTS.mnemic.md` when they do not already exist. Re-run with `--force` through the built CLI if you want to refresh generated files:

```bash
node mnemic-cli/dist/index.js init --force
```

## Smoke Test

```bash
scripts/smoke-agent-memory-e2e.sh
```

The smoke starts the TypeScript backend on a random local port, builds the MCP adapter, writes memories, links memories, recalls them, builds a context pack, reads stats, and checks the append-only memory timeline through `mnemic_memory_timeline`.

The MCP adapter uses `@mnemic/sdk` for its HTTP contract, so SDK and MCP behavior stay aligned.

## Agent Instruction

```text
Before non-trivial work, call mnemic_context_pack with the current task and project.
For a fresh session or broad task, call mnemic_session_briefing first.

Store an Mnemic memory for architecture decisions, reusable bug fixes, release rules,
recurring workflows, and important project-specific constraints.

Use sourceKey when possible so repeated runs update the same memory instead of creating duplicates.
Set confidence below 1.0 when a memory is inferred, temporary, or likely to go stale.
Keep memories factual, searchable, scoped to a project, and free of secrets.
```
