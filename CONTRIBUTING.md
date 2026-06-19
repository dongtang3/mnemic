# Contributing to Mnemic

Mnemic is a TypeScript-first memory kernel for coding agents. Contributions should keep the default path local-first, auditable, MCP-native, and reproducible.

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security reports and leaked secrets should follow [SECURITY.md](SECURITY.md), not public issue threads.

## Local Setup

```bash
npm install
npm run build
npm run doctor
npm run demo
npm run benchmark
```

Run the full gate before opening a pull request:

```bash
npm run ci:smoke
```

## Development Rules

- Keep durable memory writes source-keyed when the workflow can identify a stable source such as a commit, issue, release, or session summary.
- Use write preview surfaces for risky or high-impact memory changes.
- Do not store secrets in fixtures, examples, docs, benchmark data, screenshots, or memory records.
- Preserve the HTTP, SDK, CLI, MCP, and Studio contract when changing shared memory behavior.
- Keep benchmark claims reproducible through `npm run benchmark` or clearly mark them as future/external benchmark work.
- Prefer focused additions over broad rewrites. New runtime code should fit the TypeScript workspace structure.

## Pull Request Checklist

- `npm run build` passes.
- `npm test` passes, or the PR explains why a narrower test is sufficient.
- `npm run doctor` has no failures.
- `npm run benchmark` is updated when recall behavior or fixture scoring changes.
- Docs are updated for user-visible CLI, API, MCP, policy, benchmark, or Studio changes.
- New memory governance behavior has tests for preview and applied writes.

## Memory Review

If a PR adds durable project memory examples, export them as JSONL and review them like code:

```bash
node mnemic-cli/dist/index.js export --project mnemic > reviewed-events.jsonl
```

Import reviewed events only after approval:

```bash
node mnemic-cli/dist/index.js import reviewed-events.jsonl --confirm
```

This keeps agent memory useful without letting automation silently poison the repository.
