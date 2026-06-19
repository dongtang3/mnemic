# Mnemic Memory MCP

This MCP server is a thin adapter for Codex, Claude Code, Cursor, and other MCP clients.
It does not store its own state. It calls the Mnemic TypeScript backend and stores long-term LLM/agent memories.

## Tools

- `mnemic_remember` stores or updates a memory. Use `sourceKey` for idempotent writes.
- `mnemic_preview_memory` dry-runs a memory write and returns the would-be diff, relation changes, policy findings, warnings, and state counts.
- `mnemic_recall` searches memories by query, project, type, or tag.
- `mnemic_explain_recall` explains recall ranking with matched fields, score parts, stale flags, and relation paths.
- `mnemic_get_memory` fetches one memory by entity UID.
- `mnemic_context_pack` builds a compact prompt-ready context pack.
- `mnemic_session_briefing` builds a session-start briefing from recent, important, and problem/risk memories.
- `mnemic_memory_stats` reports memory coverage and maintenance stats.
- `mnemic_policy` inspects the active governance policy and policy source.
- `mnemic_audit` audits memory hygiene and policy risks.
- `mnemic_memory_timeline` reads append-only memory events, including diff subjects and changed fields.
- `mnemic_export_jsonl` exports event logs for audit and handoff.
- `mnemic_import_jsonl` previews or imports reviewed event-log JSONL.
- `mnemic_rollback_preview` previews an event rollback without writing.
- `mnemic_rollback` applies a confirmed latest-event rollback.
- `mnemic_link_memories` links two memories.

The adapter uses `@mnemic/sdk` for shared contracts and HTTP calls.

## Build

```bash
cd mcp-server
npm install
npm run build
npm test
```

## Claude Code / Codex Style Config

Start the Mnemic backend first from the repository root:

```bash
cp .env.mnemic.example .env.mnemic
scripts/run-agent-memory-backend.sh
```

Then point your MCP client at the built adapter:

```json
{
  "mcpServers": {
    "mnemic-memory": {
      "command": "node",
      "args": ["/path/to/mnemic/mcp-server/dist/index.js"],
      "env": {
        "MNEMIC_API_BASE": "http://localhost:8088"
      }
    }
  }
}
```

For local development you can run:

```bash
cd mcp-server
MNEMIC_API_BASE=http://localhost:8088 npm run dev
```
