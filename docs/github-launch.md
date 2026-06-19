# Mnemic GitHub Launch Playbook

Last updated: 2026-06-18.

Use this page when making the repository public, writing a release post, or asking early users for feedback. It keeps the launch message specific, repeatable, and aligned with the checks in this repo.

## Repository About

GitHub description:

```text
Local-first memory kernel for coding agents: MCP-native, temporal, auditable, source-keyed, and benchmarked.
```

Target repository:

```text
https://github.com/dongtang3/mnemic
```

Topics:

```text
agent-memory
mcp
model-context-protocol
llm
long-term-memory
temporal-memory
memory-graph
coding-agents
typescript
local-first
knowledge-graph
```

Short tagline:

```text
Mnemic gives every coding agent a shared, auditable memory graph outside the context window.
```

## First-Screen Promise

Lead with the thing a developer can verify in five minutes:

```bash
npm install
npm run demo
```

The demo must show source-keyed writes, write preview, recall explanation, context pack, briefing, audit, timeline, and `mnemic snapshot`. Do not lead with roadmap items, hosted deployment, or external benchmark claims.

## Launch Proof

Before posting publicly, run:

```bash
npm run launch:check
npm run rewrite:check
npm run completion:check
npm run fresh:check -- --full
npm run github:launch:check
npm run repository:check
npm run public:check
npm run supply:check
npm run community:check
npm run security:check
npm run market:check
npm run demo
npm run benchmark
npm run doctor
npm run docs:check
npm run ci:smoke
```

Expected proof points:

- `npm run demo` writes `target/mnemic-launch-demo/mnemic-launch-report.md`.
- `npm run completion:check` proves the original rename, TypeScript rewrite, 2026 direction, and remaining release blockers are explicitly audited.
- `npm run fresh:check -- --full` validates a temporary clone without local build artifacts, then runs demo, benchmark, and package readiness.
- `npm run repository:check` validates package metadata and launch docs for the final repository target. Run `node scripts/check-repository-migration.mjs --require-renamed-origin` before posting publicly.
- `npm run public:check` summarizes remaining external launch state. After push, repository About metadata update, and hosted Actions run, use `node scripts/check-publication-readiness.mjs --strict` before posting publicly.
- `npm run supply:check` verifies lockfile shape, high-threshold npm audit, npm token boundaries, private package state, and trusted-publishing/provenance docs.
- `npm run community:check` validates code of conduct, support policy, Dependabot config, and community-health links.
- `npm run security:check` validates CodeQL, Dependabot, security docs, and sensitive-data release boundaries. Hosted CodeQL status requires a remote GitHub Actions run after the repo rename.
- `npm run benchmark` writes `target/mnemic-benchmark/mnemic-eval-report.md`.
- `npm run doctor` reports zero failures.
- `npm run docs:check` validates README Docs Map coverage plus local Markdown links and image targets.
- `npm run ci:smoke` passes workspace tests, build, package readiness, MCP live smoke, eval, policy, audit, and release checks.

Docker proof should include the static gate, Compose syntax, and live backend boot on a Docker host:

```bash
npm run docker:check
node scripts/check-docker-readiness.mjs --compose-config --live
```

## GitHub Release Copy

Title:

```text
Mnemic v0.1.0: local-first memory for coding agents
```

Body:

```text
Mnemic is a TypeScript memory kernel for coding agents. It gives Codex, Claude Code, Cursor, Copilot-style agents, and MCP clients one shared local memory graph with source-keyed writes, temporal recall, explainable retrieval, policy checks, JSONL handoff, rollback preview, and a Studio graph workbench.

Run `npm run demo` to see the first five minutes: write memories, preview an idempotent update, explain recall, build a context pack, generate a session briefing, audit memory hygiene, inspect the timeline, and replay a snapshot from the event log.

This is a launch candidate, not a hosted service. Packages stay private until npm scope ownership and registry dependency ranges are reviewed.
```

## Hacker News Draft

Title:

```text
Show HN: Mnemic - local-first memory for coding agents
```

Body:

```text
Mnemic is a TypeScript memory kernel for coding agents. It is MCP-native and local-first, with source-keyed writes, write previews, temporal recall, explainable retrieval, event-log replay, JSONL export/import, rollback preview, and a small Studio graph UI.

The goal is to make repo memory inspectable and shared across tools instead of hidden inside one chat session or one vector-store wrapper.

Try it with:

npm install
npm run demo

The benchmark included today is intentionally modest and reproducible: a model-free coding-agent fixture for recall@5, stale false positives, relation-path coverage, and latency. External benchmark scores for LoCoMo, LongMemEval, BEAM, LongMemEval-V2, and MemGym are not claimed yet.
```

## Social Draft

```text
I built Mnemic: a local-first memory kernel for coding agents.

It gives MCP-compatible tools one shared memory graph with source-keyed writes, temporal recall, recall explanations, write policy, audit, JSONL handoff, rollback preview, and a Studio graph view.

Try:
npm install
npm run demo
```

## Do Not Claim

- Do not claim state-of-the-art memory benchmark scores.
- Do not claim LoCoMo, LongMemEval, BEAM, LongMemEval-V2, or MemGym results until adapter commands exist and reports are committed.
- Do not claim npm installability while packages are still `private: true`.
- Do not claim hosted sync, multi-user auth, or cloud deployment.
- Do not imply external benchmark scores, hosted sync, or npm availability before those release gates exist.

## FAQ Hooks

Why not just use a vector database?

Mnemic treats memory as records plus graph relations, policy findings, event diffs, temporal validity, and replayable audit history. Vectors can become an adapter later; they are not the only source of truth.

Why MCP?

MCP is the distribution surface for local agent tools. Mnemic keeps MCP first-class so multiple coding agents can share one memory plane.

Why local-first?

Project memory often includes implementation details, operational decisions, and private repo context. The default path should run locally before teams decide whether to host anything.

What should ship next?

External benchmark adapters, typed relation validity windows, graph-store adapters, and richer approval workflows over policy-gated writes.
