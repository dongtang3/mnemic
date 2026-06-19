# Mnemic Memory Architecture

Mnemic is being rewritten as a TypeScript-first memory substrate for LLM applications and coding agents.

The core product surface is not another chat UI. It is a durable memory graph that agents can inspect, search, link, and convert into prompt-ready context before doing work.

## Runtime Shape

```text
CLI / Codex / Claude Code / Cursor / MCP client
        |
        v
@mnemic/sdk shared contracts and HTTP client
        |
        v
mnemic-cli/ or mcp-server/ TypeScript clients
        |
        v
mnemic-server/ TypeScript HTTP API
        |
        v
JSON or SQLite local store today
Neo4j or Postgres graph store next
```

## Memory Model

`AgentMemory` fields:

- `entityUid`
- `title`
- `content`
- `memoryType`
- `project`
- `tags`
- `source`
- `sourceKey`
- `actor`
- `importance`
- `confidence`
- `observedAt`
- `validFrom`
- `validTo`
- `metadata`
- `relatedMemoryUids`
- `policyFindings` on write responses when policy warnings were produced

`sourceKey` is the idempotency key. Use commit SHAs, issue IDs, ticket IDs, session IDs, or stable workflow names when available.

`validFrom` and `validTo` are the temporal validity window. Recall, explain, and context-pack endpoints accept `asOf` to return only memories valid at that timestamp. Timeline and JSONL export use `asOf` as an event-time cutoff.

Memory writes also append immutable `AgentMemoryEvent` records. Each event carries a first-class `diff` payload with `subject`, `before`, `after`, and `changedFields`, so exported JSONL can be reviewed without reconstructing every state transition manually. The same event log can be replayed through `/api/agent-memory/snapshot` to reconstruct the memory graph at a point in time. The current stores keep memory records, explicit graph relations, and the event log together:

- JSON stores the full graph/event state in one inspectable file.
- SQLite stores a full-state compatibility snapshot plus normalized tables for memories, tags, relations, and append-only events, including `diff_json` for event diffs. SQLite recall, single-memory reads, briefing, timeline, and stats use the normalized tables directly.

## API

Base path: `/api/agent-memory`

The machine-readable OpenAPI 3.1 contract is `docs/openapi.json`. `npm run openapi:check` validates required paths, methods, schemas, operation IDs, and route markers in `mnemic-server/src/server.ts`.

- `POST /memories`
- `POST /memories/preview`
- `GET /memories` with optional `asOf`
- `GET /explain` with optional `asOf`
- `GET /memories/{memoryUid}`
- `POST /memories/{memoryUid}/relations`
- `GET /context-pack` with optional `asOf`
- `GET /briefing`
- `GET /stats`
- `GET /policy`
- `GET /audit`
- `GET /timeline` with optional event-time `asOf`
- `GET /export` with optional event-time `asOf`
- `GET /snapshot` for event-log historical state reconstruction
- `POST /import`
- `GET /rollback-preview`
- `POST /rollback`

`POST /memories/preview` returns `policyFindings` next to diff and relation previews. `POST /memories` evaluates the same rules before mutating state and returns HTTP 400 with structured findings for blocked writes.
`GET /policy` returns the active resolved governance policy, including whether it came from defaults, constructor config, or a policy file.
`GET /audit` returns deterministic memory-hygiene findings for missing source keys, policy risks, low confidence, stale records, orphan nodes, and duplicate titles.

## Governance

The current policy layer is local and deterministic:

- block likely secrets before they enter durable memory
- require `sourceKey` for release, security, incident, migration, rollback, and production memories
- warn on very low confidence, high-importance low-confidence writes, and memories whose `validTo` is already expired

This is intentionally part of the memory kernel instead of Studio-only validation, so SDK, CLI, MCP, and direct HTTP callers share the same behavior.

Policy configuration:

- `MNEMIC_POLICY_FILE` points at a JSON policy file.
- If no env var is set, the server auto-discovers `.mnemic/policy.json` from the current directory or parent directory.
- `.mnemic/policy.example.json` documents source-key requirements, secret settings, custom regex patterns, confidence thresholds, and stale-memory severity.
- Built-in defaults remain active when no policy file exists.

## MCP

The MCP adapter exposes:

- `mnemic_remember`
- `mnemic_preview_memory`
- `mnemic_recall`
- `mnemic_explain_recall`
- `mnemic_get_memory`
- `mnemic_context_pack`
- `mnemic_session_briefing`
- `mnemic_memory_stats`
- `mnemic_policy`
- `mnemic_audit`
- `mnemic_memory_timeline`
- `mnemic_export_jsonl`
- `mnemic_snapshot`
- `mnemic_import_jsonl`
- `mnemic_rollback_preview`
- `mnemic_rollback`
- `mnemic_link_memories`

The adapter stores nothing itself. If the Mnemic backend is down, MCP calls fail fast with a clear backend connection error.

## SDK

`mnemic-sdk/` is the shared TypeScript package for:

- request/response contracts
- memory event contracts
- same-origin or absolute-base-url HTTP client usage
- SDK-backed MCP and Studio integration
- Studio write previews that use the same `previewMemory` contract as CLI and MCP
- Temporal `asOf` filters for validity-window recall and event-time audit reads
- Studio graph views that derive visible neighborhoods and two-hop paths from memory relations plus timeline relation labels
- Recall explanations that expose matched fields, matched terms, score parts, stale flags, and scored relation paths
- Governance findings shared across HTTP, CLI, MCP, and Studio write-preview flows

## CLI

`mnemic-cli/` provides the first-five-minutes command line:

- `mnemic health`
- `mnemic init`
- `mnemic remember`
- `mnemic preview`
- `mnemic link`
- `mnemic recall`
- `mnemic explain`
- `mnemic context`
- `mnemic briefing`
- `mnemic stats`
- `mnemic policy`
- `mnemic audit`
- `mnemic doctor`
- `mnemic timeline`
- `mnemic export`
- `mnemic snapshot`
- `mnemic import`
- `mnemic eval`
- `mnemic rollback-preview`
- `mnemic rollback`

`mnemic eval` seeds a deterministic coding-agent memory fixture, links the memories, calls recall explanations, and reports recall@k, mean hit rank, stale false positives, relation-path coverage, and latency. It is intentionally model-free so it can run in local demos and CI before larger LoCoMo, LongMemEval, or MemGym adapters exist.

`mnemic recall`, `mnemic explain`, `mnemic context`, `mnemic timeline`, and `mnemic export` accept `--as-of <ISO timestamp>` for temporal recall and audit views. `mnemic snapshot --as-of <ISO timestamp>` replays the event log and prints the reconstructed graph state.

`mnemic eval --markdown` emits the same result as a paste-ready report. `npm run benchmark` wraps that output with an isolated local backend and writes `target/mnemic-benchmark/mnemic-eval-report.md`; [docs/benchmark-baseline.md](benchmark-baseline.md) records the latest local baseline and scope.

`mnemic doctor` checks local readiness: Node runtime, workspace manifests, build artifacts, `.mcp.json`, policy example, benchmark report, backend health, policy, and audit when a backend is reachable. `--require-backend` turns backend availability into a hard failure for strict release checks.

`mnemic init` generates source-workspace local config for first-run setup: `.env.mnemic`, `.mnemic/policy.json`, `.mcp.json`, and `AGENTS.mnemic.md`. It is idempotent and only overwrites existing files with `--force`.

## Storage

Storage is selected by environment:

- default: JSON file at `MNEMIC_MEMORY_FILE`
- SQLite: `MNEMIC_STORE=sqlite` and `MNEMIC_SQLITE_FILE=target/mnemic-memory.sqlite`

The store boundary is intentionally behind `MemoryStore.load()` and `MemoryStore.save()` so HTTP, MCP, CLI, SDK, and Studio behavior stay stable while storage evolves.

SQLite tables:

- `memory_records`
- `memory_tags`
- `memory_relations`
- `memory_events`
- `memory_state` for snapshot compatibility and older-store migration

## Next Rewrite Slices

- Add a graph-store adapter behind the current service layer.
- Add consolidation history over the event log.
- Add external benchmark adapters behind the current model-free eval harness.
- Add policy approval workflows on top of the configurable policy file.
- Keep the active runtime TypeScript-first; any future adapter should land as a new Mnemic module with tests and public documentation.
