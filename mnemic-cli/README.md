# @mnemic/cli

Command-line interface for Mnemic agent memory.

## Usage

```bash
mnemic init
mnemic health
mnemic remember --title "Decision" --content "What changed" --project mnemic --source-key demo/decision
mnemic preview --title "Decision" --content "Updated detail" --project mnemic --source-key demo/decision
mnemic explain "decision" --project mnemic
mnemic audit --project mnemic --max-blocks 0
mnemic doctor --project mnemic
```

`MNEMIC_API_BASE` defaults to `http://localhost:8088`.

## Commands

- `init`: generate local `.env.mnemic`, `.mnemic/policy.json`, `.mcp.json`, and agent instructions.
- `remember` / `preview`: write or dry-run durable memories.
- `recall` / `explain` / `context` / `briefing`: retrieve and assemble memory context.
- `link`: create graph relations between memories.
- `policy` / `audit` / `doctor`: inspect governance and local readiness.
- `timeline` / `export` / `import` / `rollback`: review and manage append-only memory events.
- `eval`: run the deterministic coding-agent memory eval.

This package is currently marked `private: true` until npm scope ownership is confirmed.
