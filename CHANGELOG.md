# Changelog

All notable changes to Mnemic will be documented here.

Mnemic is pre-1.0. Until the first tagged release, entries describe repository milestones rather than stable API guarantees.

## Unreleased

- Rebranded the project direction to Mnemic, a TypeScript-first memory kernel for coding agents.
- Added TypeScript workspace packages for SDK, CLI, server, MCP adapter, and Studio.
- Added `npm run rewrite:check` to guard the active TypeScript product path and keep non-TypeScript runtime roots outside the public tree.
- Added `npm run fresh:check` to validate install, init, build, tests, and launch checks from a temporary fresh clone without local artifacts.
- Added `docs/completion-audit.md` and `npm run completion:check` to map the original rename, TypeScript rewrite, and 2026 agent-memory direction to current evidence and remaining release blockers.
- Added repository identity metadata, package repository links, and `npm run repository:check` so public launch stays aligned with the final Mnemic target.
- Added code of conduct, support policy, Dependabot config, and `npm run community:check` for GitHub community-health readiness.
- Added CodeQL workflow, security hardening docs, and `npm run security:check` for source-side security launch readiness.
- Added local JSON and SQLite memory stores.
- Added source-keyed memory writes, write previews, event diffs, relations, timelines, JSONL export/import, and rollback.
- Added recall explanations with matched fields, score parts, stale flags, and relation paths.
- Added temporal `asOf` recall filters across HTTP, SDK, CLI, MCP, Studio, and OpenAPI.
- Added event-log historical snapshot reconstruction across HTTP, SDK, CLI, MCP, and OpenAPI.
- Added memory governance policy for likely secrets, source-key requirements, confidence warnings, stale records, and configurable policy files.
- Added policy and audit surfaces across HTTP, SDK, CLI, MCP, and Studio.
- Added one-command demo with `npm run demo`.
- Added deterministic model-free eval, Markdown benchmark reports, and `npm run benchmark`.
- Added `npm run market:check` to guard 2026 market-positioning sources and public Mnemic branding.
- Added first-run local config generation with `mnemic init` and `npm run init`.
- Added local readiness checks with `mnemic doctor` and `npm run doctor`.
- Added OpenAPI 3.1 HTTP contract documentation and `npm run openapi:check` for route/schema drift checks.
- Added package README files and `npm run package:check` for npm pack dry-run readiness.
- Added `docs/github-launch.md` and `npm run github:launch:check` for GitHub About text, topics, launch copy, and benchmark claim guardrails.
- Added release notes generation, npm publishing strategy documentation, and `npm run release:check` to keep launch publishing claims guarded.
- Added GitHub Actions CI smoke for tests, build, MCP live E2E, eval, policy, audit, doctor, and release-script checks.
