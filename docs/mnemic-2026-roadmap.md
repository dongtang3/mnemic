# Mnemic 2026 Roadmap

Mnemic should grow into a GitHub-hot-worthy memory kernel for coding agents: local-first, TypeScript-native, MCP-native, inspectable, benchmarked, and graph-backed.

## Market Read

Last checked: 2026-06-18.

The 2026 memory space is moving in a clear direction:

- GitHub Copilot memory is repository-specific and spans coding agent, code review, and CLI workflows. That makes shared repo memory a mainstream developer expectation, not a side feature: https://github.blog/changelog/2026-01-15-agentic-memory-for-github-copilot-is-in-public-preview/
- The Model Context Protocol remains the distribution surface for local agent tools and data connectors, so Mnemic should keep the MCP adapter as a first-class runtime path: https://modelcontextprotocol.io/examples
- OpenAI Agents session memory and LangGraph long-term memory docs make the split clear: session history helps one run or thread, while durable long-term memory needs external storage and retrieval policy. Mnemic should focus on that durable, cross-client layer: https://openai.github.io/openai-agents-python/sessions/ and https://docs.langchain.com/oss/python/concepts/memory
- Graphiti and Zep frame agent memory as a temporal knowledge graph with low-latency context assembly: https://github.com/getzep/graphiti
- Mem0 frames LoCoMo, LongMemEval, and BEAM as the benchmark set people use to compare memory systems in 2026: https://mem0.ai/blog/state-of-ai-agent-memory-2026
- LongMemEval-V2, published in May 2026, moves agent-memory evaluation toward specialized web environments and tests whether a memory system helps an agent become an experienced operator, not just a better chat-history retriever: https://arxiv.org/abs/2605.12493
- MemGym pushes evaluation toward long-horizon agent tasks across coding, deep research, web/computer use, and tool-use dialogue: https://arxiv.org/html/2605.20833v1
- AMemGym pushes conversational memory evaluation toward interactive, on-policy state evolution instead of static replay-only benchmarks: https://arxiv.org/abs/2603.01966
- The brand should stay short, direct, and memory-native across packages, CLI commands, docs, MCP tools, and SDK imports.

## Product Thesis

Most agent-memory repos stop at one of three shapes: a vector store wrapper, a chat history summarizer, or a single-agent MCP plugin.

Mnemic should be more opinionated:

- It is the memory plane between many agents and one repository.
- It stores memories as auditable records, not hidden embeddings.
- It treats time, source, confidence, and validity as first-class fields.
- It makes graph relationships visible and queryable.
- It ships with evaluations so quality claims are reproducible.

## What Makes It Hot

The repo should be useful in the first five minutes and ambitious by the fifth hour.

The first-five-minutes demo:

1. Run one command.
2. Connect Codex, Claude Code, Cursor, or another MCP client.
3. Store a decision with `mnemic_remember`.
4. Start a new session and call `mnemic_session_briefing`.
5. See the old decision come back with source, confidence, validity, and related memories.

The fifth-hour payoff:

1. Inspect the memory graph in Studio.
2. See why a memory was retrieved.
3. Replay or roll back memory writes.
4. Run a benchmark task.
5. Compare local JSON, SQLite, Neo4j, and Postgres storage adapters.

## Architecture Direction

```text
MCP clients / SDKs / HTTP API
        |
        v
Mnemic memory kernel
        |
        +-- write policy
        +-- consolidation policy
        +-- temporal graph recall
        +-- citation and provenance scoring
        +-- benchmark harness
        |
        v
Inspectable stores
        +-- JSON for zero-setup demos
        +-- SQLite for local production
        +-- Neo4j for graph-heavy workloads
        +-- Postgres for hosted teams
```

## Implementation Roadmap

### 0. TypeScript Foundation

Status: current slice.

- `mnemic-server` exposes the memory HTTP contract.
- `mnemic-sdk` owns shared TypeScript contracts and the HTTP client.
- `mnemic-cli` exposes the first-five-minutes command-line workflow.
- `mcp-server` exposes `mnemic_*` tools.
- `studio` points at the Mnemic backend and displays memory state.
- `POST /api/agent-memory/memories/preview`, `MnemicClient.previewMemory()`, `mnemic preview`, and `mnemic_preview_memory` dry-run memory writes without mutating memory. Previews show create/update intent, the would-be event UID, memory diff fields, relation link previews, warnings, and before/after state counts.
- Studio now exposes the same write-preview contract in the Memories workflow, including changed fields, relation previews, warnings, and before/after state counts before the user saves.
- Studio also has a Graph workflow that renders project memory neighborhoods, highlights selected-node edges, and lists direct plus two-hop relation paths from stored `relatedMemoryUids` and timeline relation labels.
- `mnemic link` creates explicit graph edges from the CLI, so demo and local workflows can show `memory-linked` timeline events without dropping to raw HTTP.
- `GET /api/agent-memory/explain`, `MnemicClient.explainRecall()`, `mnemic explain`, and `mnemic_explain_recall` expose recall ranking explanations with matched fields, matched terms, score parts, stale flags, and scored relation paths. Studio shows the same explanation next to context-pack output.
- `asOf` temporal recall is available across HTTP, SDK, CLI, MCP, and Studio. Memory recall/explain/context pack filter by `validFrom` / `validTo`, while timeline/export use `asOf` as an event-time cutoff.
- `GET /api/agent-memory/timeline` and `mnemic_memory_timeline` expose append-only memory events.
- `GET /api/agent-memory/export`, `mnemic export`, and `mnemic_export_jsonl` export memory events as JSONL for audit and handoff.
- `GET /api/agent-memory/snapshot`, `mnemic snapshot`, and `mnemic_snapshot` replay the append-only event log into a historical memory graph snapshot.
- `POST /api/agent-memory/import`, `mnemic import`, and `mnemic_import_jsonl` preview or import reviewed event-log JSONL. Imports are dry-run by default, skip identical duplicate event UIDs, and reject conflicting event UIDs.
- `AgentMemoryEvent.diff` stores first-class before/after summaries and changed fields for memory writes, relation links, and rollback state changes. JSON, SQLite, JSONL export/import, CLI timeline, and MCP timeline preserve the diff.
- `GET /api/agent-memory/rollback-preview`, `mnemic rollback-preview`, and `mnemic_rollback_preview` preview rollback effects without mutating memory.
- `POST /api/agent-memory/rollback`, `mnemic rollback --confirm`, and `mnemic_rollback` apply confirmed latest-event rollback while appending a `memory-rolled-back` audit event.
- `MNEMIC_STORE=sqlite` enables a local SQLite memory store with normalized memory, tag, relation, and event tables. Recall, single-memory reads, briefing, timeline, and stats use those SQL tables directly without changing HTTP, SDK, CLI, or MCP contracts.
- `mnemic eval`, `mnemic eval --markdown`, `scripts/run-memory-eval.sh`, and `npm run benchmark` seed a deterministic coding-agent fixture, link memories, call recall explanations, and report recall@k, mean hit rank, stale false positives, relation-path coverage, and latency without requiring a model provider. The benchmark wrapper writes `target/mnemic-benchmark/mnemic-eval-report.md`, and `docs/benchmark-baseline.md` records the latest local baseline and scope.
- `docs/benchmark-landscape.md` maps Mnemic's local benchmark to LoCoMo, LongMemEval, BEAM, LongMemEval-V2, and MemGym while explicitly marking external benchmark scores as not claimed until adapters exist. `npm run benchmark:landscape:check` guards this public positioning.
- `mnemic doctor` and `npm run doctor` expose local readiness checks for Node version, workspace manifests, open-source metadata, launch assets, Docker quickstart files, build artifacts, MCP manifest, policy example, benchmark report, backend health, policy, and memory audit. CI smoke runs doctor after build as an offline release-artifact check.
- `mnemic init` and `npm run init` generate first-run source-workspace config: `.env.mnemic`, `.mnemic/policy.json`, `.mcp.json`, and `AGENTS.mnemic.md`. The command is idempotent and uses `--force` for explicit refreshes.
- The repository now includes MIT license, contributing guide, security policy, changelog, release checklist, pull request template, and bug/feature issue templates for public GitHub launch readiness.
- `npm run package:check` builds the workspace and runs package-readiness checks for `@mnemic/sdk`, `@mnemic/cli`, `@mnemic/server`, and `@mnemic/memory-mcp`, including package metadata, package README files, dist entrypoints, and npm pack dry-run contents. Packages remain `private: true` until npm scope ownership is confirmed.
- `docs/openapi.json` defines the OpenAPI 3.1 HTTP contract, and `npm run openapi:check` guards required paths, methods, schemas, operation IDs, and server route markers.
- Memory governance now emits `policyFindings` in write previews, blocks likely secrets, requires `sourceKey` for release/security/incident/migration/rollback/production memories, and warns on low-confidence or already-expired writes. Teams can override this through `MNEMIC_POLICY_FILE` or `.mnemic/policy.json`, including custom secret regex patterns and confidence/stale thresholds.
- `GET /api/agent-memory/policy`, `MnemicClient.policy()`, `mnemic policy`, `mnemic_policy`, and Studio Runtime expose the active resolved governance policy and whether it came from defaults, constructor config, or a policy file.
- `GET /api/agent-memory/audit`, `MnemicClient.audit()`, `mnemic audit`, `mnemic_audit`, and Studio Overview expose deterministic memory-hygiene findings and a health score for source keys, policy risks, confidence, stale records, orphan nodes, and duplicate titles.
- `.github/workflows/ci.yml` runs `npm run ci:smoke`, which covers workspace tests, production build, MCP live E2E, model-free eval, and configurable policy checks. `docs/github-actions.md` documents PR memory-review and release-memory recipes.
- `npm run demo` runs `scripts/launch-demo.sh`, which starts an isolated backend, writes a source-keyed coding-agent memory graph, previews an idempotent update, explains recall, builds context, prints a briefing, audits memory hygiene, shows the timeline, replays a snapshot from the event log, and writes `target/mnemic-launch-demo/mnemic-launch-report.md`. The walkthrough is documented in `examples/coding-agent-memory/`.
- `npm run studio:capture` starts an isolated backend plus Studio, seeds a small memory graph, and captures `docs/assets/mnemic-studio-preview.png` through Playwright so the README can show the real product surface.
- `npm run launch:check` guards GitHub launch readiness by checking the README visual card, first-run demo path, benchmark/readiness commands, temporal snapshot messaging, release checklist, and package keywords.
- `npm run docker:check` guards the Docker quickstart without requiring Docker in CI. It verifies the compose service, Dockerfile healthcheck/start command, persistence volume, source-workspace start/stop scripts, README link, and Docker quickstart docs. `node scripts/check-docker-readiness.mjs --compose-config --live` adds the Docker-host proof by building the image, booting the backend, checking health, waiting for container health, and stopping the container.
- `npm run release:notes` generates launch-candidate notes under `docs/releases/`, and `npm run release:check` keeps npm publishing guardrails explicit while packages remain private until scope ownership and registry dependency ranges are reviewed.
- Root workspace builds and tests the TypeScript path.
- `npm run rewrite:check` verifies the active public runtime is the TypeScript workspace, required TS source files exist, and non-TypeScript runtime roots are absent from the public product tree.

### 1. Local-First Memory Kernel

- Add consolidation history over the event log.
- Add pull-request examples that review exported JSONL and import approved memory events.

### 2. Temporal Graph Recall

- Promote relations into typed graph edges with validity windows.
- Extend historical snapshots into richer diffable state comparisons between two `asOf` timestamps.
- Add temporal/weighted retrieval scoring that accounts for validity windows and relation types.
- Add a graph-store adapter for Neo4j or Postgres without changing MCP tool names.

### 3. Memory Governance

- Add policy approvals on top of dry-run write previews.
- Add confidence decay beyond current stale-memory flags.
- Add optional redaction workflows and review queues on top of the current configurable blocking rules.
- Extend rollback from latest-event safety into reviewed multi-event undo.

### 4. Benchmarks

- Extend the built-in coding-agent eval fixture with larger task suites.
- Add adapters for LoCoMo, LongMemEval, LongMemEval-V2, BEAM, and MemGym-style tasks.
- Report recall precision, stale-memory false positives, token cost, latency, and write quality.
- Publish benchmark recipes that can run locally without a hosted service.

### 5. Developer Distribution

- Publish CLI package: `mnemic`.
- Publish MCP package: `@mnemic/memory-mcp`.
- Publish SDK package: `@mnemic/sdk` from the current workspace package.
- Add one-command installers for Codex, Claude Code, Cursor, and generic MCP JSON.
- Turn the current GitHub Action recipes into reusable actions for recording release decisions, PR review learnings, and failed-CI fixes.

## Non-Goals

- Do not become a generic note-taking app.
- Do not hide memory inside embeddings as the only source of truth.
- Do not require a cloud service for the default demo.
- Do not optimize for a single agent client.
- Do not claim benchmark quality without reproducible eval scripts.

## Repo Pitch

Mnemic is the local-first memory kernel for coding agents. It gives every MCP-compatible agent a shared, auditable, temporal memory graph with source-keyed writes, context packs, session briefings, and reproducible benchmarks.
