# Mnemic Usage

This page keeps the operational details out of the README while preserving the complete local workflow.

## Agent Memory API

Base path: `/api/agent-memory`

The machine-readable OpenAPI 3.1 contract is [openapi.json](openapi.json).

- `POST /memories` stores or updates a memory. `sourceKey` makes writes idempotent.
- `POST /memories/preview` dry-runs a memory write and returns the would-be record, diff, relation changes, policy findings, warnings, and state counts without mutating memory.
- `GET /memories?query=&project=&memoryType=&tag=&asOf=&limit=` searches memories. `asOf` filters by the memory validity window (`validFrom` / `validTo`).
- `GET /explain?query=&project=&memoryType=&tag=&asOf=&limit=` explains recall ranking with matched fields, score parts, staleness, and relation paths.
- `GET /memories/{memoryUid}` fetches one memory.
- `POST /memories/{memoryUid}/relations` links memories.
- `GET /context-pack?query=&project=&asOf=&limit=` returns prompt-ready context.
- `GET /briefing?project=&limit=` returns recent, important, and problem/risk memories.
- `GET /stats` returns coverage and maintenance stats.
- `GET /policy` returns the active resolved governance policy and its source.
- `GET /audit?project=` returns memory hygiene findings and a health score.
- `GET /timeline?project=&memoryType=&tag=&asOf=&limit=` returns recent append-only memory events. `asOf` returns events at or before that timestamp.
- `GET /export?project=&memoryType=&tag=&asOf=&limit=` returns memory events as JSONL for audit and handoff.
- `GET /snapshot?project=&memoryType=&tag=&asOf=&limit=` replays the append-only event log into a memory graph snapshot at that point in time.
- `POST /import` previews or imports memory-event JSONL. It defaults to dry-run unless `confirm: true`.
- `GET /rollback-preview?eventUid=` previews the state effect of rolling back one event without mutating memory.
- `POST /rollback` applies a policy-gated rollback for the latest event with `confirm: true`.
- `GET /actuator/health` returns backend health.

Run the API contract drift check:

```bash
npm run openapi:check
```

## Memory Governance

Mnemic evaluates write policy before durable writes:

- Potential secrets in title, content, source, sourceKey, tags, or metadata are blocked.
- Release, security, incident, migration, rollback, and production memories require `sourceKey`.
- Low-confidence or already-expired memories return policy warnings.
- Preview calls show the same `policyFindings` without mutating state; blocked actual writes return HTTP 400 with structured findings.

Teams can customize the policy without changing code:

```bash
mkdir -p .mnemic
cp .mnemic/policy.example.json .mnemic/policy.json
MNEMIC_POLICY_FILE=.mnemic/policy.json scripts/run-agent-memory-backend.sh
```

The policy file can change source-key requirements, secret-detection severity, custom regex patterns, confidence thresholds, and stale-memory severity.

## MCP Tools

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

Generic MCP JSON snippets are in [mcp-client-configs.md](mcp-client-configs.md).

## Local Development

Run the backend:

```bash
cp .env.mnemic.example .env.mnemic
scripts/run-agent-memory-backend.sh
```

In another terminal:

```bash
npm run sdk:build
npm run mcp:build
```

Run the full backend plus MCP smoke:

```bash
scripts/smoke-agent-memory-e2e.sh
```

Run the same CI smoke used by GitHub Actions:

```bash
npm run ci:smoke
```

Run the built-in coding-agent memory eval:

```bash
scripts/run-memory-eval.sh --project mnemic-eval
npm run benchmark
```

Run Studio:

```bash
npm run studio:dev
```

Run the TypeScript workspace from the repo root:

```bash
npm install
npm test
npm run build
npm run package:check
```

## CLI Examples

```bash
npm run cli:build
node mnemic-cli/dist/index.js health
node mnemic-cli/dist/index.js init --project mnemic
node mnemic-cli/dist/index.js remember --title "Use source keys" --content "Mnemic updates repeated writes when sourceKey matches." --type decision --project mnemic --source-key demo/source-keys
node mnemic-cli/dist/index.js preview --title "Use source keys" --content "Mnemic updates repeated writes when sourceKey matches." --type decision --project mnemic --source-key demo/source-keys
node mnemic-cli/dist/index.js explain "source keys" --project mnemic --as-of 2026-06-18T00:00:00Z
node mnemic-cli/dist/index.js briefing --project mnemic
node mnemic-cli/dist/index.js policy
node mnemic-cli/dist/index.js audit --project mnemic --max-blocks 0
node mnemic-cli/dist/index.js doctor --project mnemic
node mnemic-cli/dist/index.js export --project mnemic
node mnemic-cli/dist/index.js snapshot --project mnemic --as-of 2026-06-18T00:00:00Z
node mnemic-cli/dist/index.js import reviewed-events.jsonl --confirm
node mnemic-cli/dist/index.js eval --project mnemic-eval --limit 5
node mnemic-cli/dist/index.js rollback-preview MemoryEvent-1
node mnemic-cli/dist/index.js rollback MemoryEvent-1 --confirm --reason "bad memory"
```

## SDK Example

```ts
import { MnemicClient } from '@mnemic/sdk'

const mnemic = new MnemicClient({ baseUrl: 'http://localhost:8088' })
const preview = await mnemic.previewMemory({
  title: 'Use source keys',
  content: 'Mnemic updates repeated writes when sourceKey matches.',
  sourceKey: 'demo/source-keys',
})
const explanation = await mnemic.explainRecall({ query: 'source keys', project: 'mnemic' })
const briefing = await mnemic.sessionBriefing('mnemic', 8)
```

## Storage

Mnemic defaults to an inspectable JSON graph/event store through `MNEMIC_MEMORY_FILE`.

Use SQLite for a more durable local store:

```bash
MNEMIC_STORE=sqlite MNEMIC_SQLITE_FILE=target/mnemic-memory.sqlite scripts/run-agent-memory-backend.sh
```

Both stores preserve the same HTTP, SDK, CLI, and MCP contracts. The SQLite adapter keeps a full-state snapshot for compatibility and normalized tables for memories, tags, relations, and append-only events. Recall, single-memory reads, briefing, timeline, and stats use those SQL tables directly, so local data is inspectable and queryable without changing client APIs.
