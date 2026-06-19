# Mnemic GitHub Actions

Mnemic ships one real CI workflow and a memory-review recipe that teams can copy into their own repositories.

## CI Gate

`.github/workflows/ci.yml` runs the same command developers can run locally:

```bash
npm run ci:smoke
```

The smoke gate covers:

- workspace tests
- production build for SDK, CLI, server, MCP, and Studio
- package readiness through npm pack dry-runs
- OpenAPI contract drift check for required HTTP paths, operations, and schemas
- MCP live E2E smoke against a temporary backend
- model-free memory eval with `recall@5` threshold
- policy status inspection through the CLI
- configurable policy preview and blocked-write checks using `.mnemic/policy.example.json`
- launch-demo and benchmark-report script syntax checks
- completion audit and repository identity metadata checks
- community-health checks for support, conduct, Dependabot, issue templates, and release checklist coverage
- offline doctor readiness checks for workspace structure, open-source metadata, and release artifacts

The workflow intentionally calls `scripts/ci-smoke.sh` instead of inlining every command, so local and GitHub verification stay aligned.

## CodeQL Gate

`.github/workflows/codeql.yml` runs CodeQL Action v4 for JavaScript and TypeScript on pull requests, pushes to `main`, a weekly schedule, and manual dispatch. It uses the `security-extended` and `security-and-quality` query suites.

Run the static source-side check locally:

```bash
npm run security:check
```

Hosted CodeQL results are not proven until the workflow has run on the renamed public repository.

Run the same local readiness check directly:

```bash
npm run doctor
```

Run package readiness directly:

```bash
npm run package:check
```

Run the API contract check directly:

```bash
npm run openapi:check
```

## Benchmark Report

Generate a paste-ready local benchmark report before a release or larger recall change:

```bash
npm run benchmark
```

The report is written to `target/mnemic-benchmark/mnemic-eval-report.md`. It is deterministic and model-free, so teams can attach it to PRs without requiring provider credentials.

## PR Memory Review Recipe

For repository memory, avoid silently writing durable memories from CI. Use a reviewable JSONL handoff:

1. Run the backend with a temporary memory file.
2. Record candidate learnings with stable `sourceKey` values.
3. Export memory events as JSONL.
4. Upload the JSONL as an artifact or attach it to the PR.
5. A human reviews the JSONL diff.
6. Import approved events with `mnemic import reviewed-events.jsonl --confirm`.

Example local commands:

```bash
SERVER_PORT=8088 MNEMIC_MEMORY_FILE=target/pr-memory-review.json node mnemic-server/dist/server.js
node mnemic-cli/dist/index.js remember \
  --title "PR 123 fixed flaky MCP startup" \
  --content "MCP startup failed when MNEMIC_API_BASE pointed at a closed port; CI now uses a temporary backend." \
  --project mnemic \
  --type fix \
  --source-key "pr/123/flaky-mcp-startup"
node mnemic-cli/dist/index.js export --project mnemic > reviewed-events.jsonl
```

Then import after review:

```bash
node mnemic-cli/dist/index.js import reviewed-events.jsonl --confirm
```

This keeps CI useful without letting automation poison long-term memory.

## Release Memory Recipe

Release memories should include a `sourceKey` because the default policy requires provenance for release records:

```bash
node mnemic-cli/dist/index.js remember \
  --title "v0.1.0 released with configurable governance" \
  --content "Release includes policyFindings, configurable source-key requirements, custom secret regex, and CI smoke." \
  --project mnemic \
  --type release \
  --source-key "release/v0.1.0"
```

If the release note contains a secret-like value, `mnemic preview` will expose the policy finding before the write is applied.
