# Mnemic Completion Audit

Last audited: 2026-06-18.
Status: TypeScript GitHub launch candidate verified; npm publication remains gated.

This audit maps the original product request to current repository evidence. It is intentionally narrower than an npm release announcement: it proves the TypeScript GitHub launch-candidate state and records the remaining package-publication work that cannot be completed by source edits alone.

## Original User Scope

1. Rewrite the project in TypeScript.
2. Publish under a clean Mnemic product identity.
3. Choose a good name based on the intended large-model memory product.
4. Turn the project toward a 2026, GitHub-hot-worthy open-source repository.
5. Let the implementation direction follow what makes the product strongest.

## Completion Position

Mnemic is complete as a TypeScript GitHub launch candidate for the requested direction. It is not a guarantee of future ranking on GitHub trending, npm adoption, or benchmark leadership. The repo now has the product shape, proof commands, hosted checks, and launch assets needed to make that outcome plausible without making unsupported claims.

## Evidence Matrix

| Requirement | Status | Evidence |
| --- | --- | --- |
| TypeScript rewrite | Verified | Active workspaces are `mnemic-sdk`, `mnemic-cli`, `mnemic-server`, `mcp-server`, and `studio`. Required TypeScript and TSX sources exist. `npm run rewrite:check` verifies old Java/Scala/Maven runtime paths stay out of the active product tree. Result: pass. |
| New name | Verified | Root package is `@mnemic/platform`, package names use `@mnemic/*`, README title is `Mnemic`, public docs and package READMEs use the Mnemic brand. |
| LLM and coding-agent memory direction | Verified | README positions Mnemic as a local-first memory kernel for coding agents and LLM applications. The runtime exposes source-keyed memory writes, previews, temporal recall, recall explanations, context packs, session briefings, audit, JSONL handoff, rollback, SDK, CLI, MCP, HTTP API, and Studio. |
| 2026 market direction | Verified as positioning | `docs/mnemic-2026-roadmap.md` has a market read checked on 2026-06-18 and links the current memory landscape: GitHub Copilot memory, Model Context Protocol examples, OpenAI Agents sessions, LangGraph long-term memory, Graphiti temporal context graphs, Mem0's 2026 memory landscape, LongMemEval-V2, MemGym, and AMemGym. |
| GitHub-hot-worthy packaging | Verified as launch candidate | README has first-screen product positioning, visual assets, five-minute demo, Docker path, capability table, docs map, open-source metadata, GitHub launch playbook, release notes, issue templates, PR template, CI workflow, benchmark guardrails, and launch checks. The public GitHub repository has the launch description and discovery topics from `docs/github-launch.md`. This is a launch surface, not a guarantee of future ranking. |
| Docs integrity | Verified | `npm run docs:check` verifies README Docs Map coverage and local Markdown/image links across the public documentation surface. |
| Fresh-clone usability | Verified | `npm run fresh:check -- --full` ran from a temporary clone on 2026-06-18. It installed dependencies, initialized local config, ran rewrite/build/test/launch/GitHub/market/OpenAPI/release checks, then ran demo, benchmark, and package readiness. Result: pass. |
| Demo proof | Verified | `npm run demo` starts an isolated backend, writes a source-keyed memory graph, links memories, previews an update, explains recall, builds a context pack, prints a session briefing, audits memory hygiene, shows timeline events, replays a snapshot, and writes `target/mnemic-launch-demo/mnemic-launch-report.md`. Result: pass inside full fresh-clone check. |
| Benchmark proof | Verified with scoped claims | `npm run benchmark` reports deterministic local metrics for the coding-agent fixture: recall@5, mean hit rank, stale false positives, relation path coverage, and latency. External LoCoMo, LongMemEval, BEAM, LongMemEval-V2, and MemGym scores are explicitly not claimed. Result: pass inside full fresh-clone check. |
| Package readiness | Verified but not publish-ready | `npm run package:check` verifies package metadata, repository links, READMEs, dist entrypoints, and npm pack dry-run contents for SDK, CLI, server, and MCP packages. Packages intentionally remain `private: true`. Result: pass inside full fresh-clone check. |
| Docker runtime path | Verified | Docker Desktop daemon `29.5.2` and Docker Compose `v5.1.3` built `mnemic-server/Dockerfile.agent-memory`, started `mnemic-memory-backend` on host port `49888`, returned `{"status":"UP","service":"mnemic-server"}`, reached Docker health `healthy`, then stopped the container on 2026-06-18. The reproducible gate is `node scripts/check-docker-readiness.mjs --compose-config --live --live-port 49888`. |
| Repository identity | Verified | GitHub repository `https://github.com/dongtang3/mnemic` is the public target, local `origin` points at the Mnemic target, and `node scripts/check-repository-migration.mjs --require-renamed-origin` verifies package metadata plus public-tree old-identity guardrails. |
| Public launch state | Strict proof verified | `node scripts/check-publication-readiness.mjs --strict` verifies the pushed `main` branch, clean worktree, public Mnemic repository, GitHub About description, discovery topics, hosted Mnemic CI success, and hosted Mnemic CodeQL success. npm package publication remains intentionally gated. |
| Supply-chain readiness | Verified locally and on hosted Linux build, publish provenance pending | `npm run supply:check` verifies lockfile version, npm audit at the high threshold, package-manager pinning, npm token boundaries, private package status, Linux native optional build bindings, and trusted-publishing/provenance docs. A Linux Docker `npm ci && npm run build` check passed after locking Rolldown, esbuild, and lightningcss bindings. Provenance cannot be claimed until npm trusted publishing is configured and a hosted publish workflow runs. |
| Release guardrails | Verified | `npm run release:check`, `npm run github:launch:check`, `npm run market:check`, `npm run openapi:check`, and `npm run launch:check` passed inside the full fresh-clone check. Result: pass. |

## Remaining Work

These are not hidden failures, but they are still required before npm package publication can be called done:

- npm scope ownership is unconfirmed. Keep packages `private: true` until the `@mnemic` scope or an alternate scope is owned, `file:../mnemic-sdk` dependencies are rewritten to registry ranges, and package dry-runs are repeated.

## Commands For Final Release Proof

```bash
npm install
npm run build
npm test
npm run doctor
npm run launch:check
npm run docs:check
npm run rewrite:check
npm run completion:check
npm run fresh:check -- --full
npm run github:launch:check
npm run docker:check
npm run repository:check
npm run public:check
node scripts/check-publication-readiness.mjs --strict
npm run supply:check
npm run community:check
npm run security:check
npm run market:check
npm run openapi:check
npm run package:check
npm run demo
npm run studio:capture
npm run benchmark
npm run benchmark:landscape:check
npm run release:notes
npm run release:check
npm run ci:smoke
```

## Source Notes

The market-read links are intentionally part of the repository rather than just this audit, so launch positioning can be checked without relying on memory:

- GitHub Copilot memory: https://github.blog/changelog/2026-01-15-agentic-memory-for-github-copilot-is-in-public-preview/
- Model Context Protocol examples: https://modelcontextprotocol.io/examples
- OpenAI Agents sessions: https://openai.github.io/openai-agents-python/sessions/
- LangGraph memory overview: https://docs.langchain.com/oss/python/concepts/memory
- Graphiti temporal context graphs: https://github.com/getzep/graphiti
- Mem0 2026 memory landscape: https://mem0.ai/blog/state-of-ai-agent-memory-2026
- LongMemEval-V2: https://arxiv.org/abs/2605.12493
- MemGym: https://arxiv.org/html/2605.20833v1
- AMemGym: https://arxiv.org/abs/2603.01966
