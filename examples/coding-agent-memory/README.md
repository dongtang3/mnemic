# Mnemic Coding-Agent Memory Demo

This example is the public first-run path for Mnemic. It uses only local services and deterministic fixture data, so it is safe for CI, screenshots, release notes, and fresh-clone validation.

Run it from the repository root:

```bash
npm run demo
```

The script starts an isolated TypeScript backend on a random `127.0.0.1` port and writes all demo state under:

```text
target/mnemic-launch-demo/
```

## What It Proves

The demo covers the parts that matter for coding-agent memory:

- backend health through the CLI
- source-keyed memory writes
- explicit graph relations between memories
- dry-run update preview without mutating state
- recall explanation with matched fields and relation paths
- context-pack generation for prompt injection
- start-of-session briefing
- memory hygiene audit with strict warning and block gates
- append-only event timeline
- event-log snapshot replay into a reconstructed memory graph

## Generated Artifacts

After a successful run, inspect:

```text
target/mnemic-launch-demo/07-preview-update.txt
target/mnemic-launch-demo/08-explain.txt
target/mnemic-launch-demo/09-context-pack.txt
target/mnemic-launch-demo/11-audit.txt
target/mnemic-launch-demo/12-timeline.txt
target/mnemic-launch-demo/13-snapshot.txt
target/mnemic-launch-demo/mnemic-launch-report.md
```

The launch report is intentionally short enough to paste into a PR, release note, or GitHub launch issue.

## Keep The Backend Running

By default, the demo stops the backend when it exits. Keep it alive for manual CLI or Studio testing:

```bash
MNEMIC_DEMO_KEEPALIVE=1 npm run demo
```

Then use the printed `Backend:` URL as `MNEMIC_API_BASE`.

## Why This Example Exists

Agent-memory projects are easy to overclaim. This demo keeps Mnemic's launch story grounded in reproducible behavior: one command, local state, visible artifacts, and no model-provider credentials.
