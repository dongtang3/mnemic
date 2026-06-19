# Mnemic Support

Mnemic is pre-1.0 and does not have a hosted support channel yet. Use GitHub issues after the repository is public.

## Where To Ask

- Bugs: open a bug report with reproduction steps, commands, logs, and the affected surface.
- Feature requests: open a feature request with the agent-memory workflow and expected user-facing behavior.
- Security issues or leaked secrets: do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- Release, npm, or repository identity questions: check [docs/release-checklist.md](docs/release-checklist.md), [docs/npm-publishing.md](docs/npm-publishing.md), and [docs/repository-migration.md](docs/repository-migration.md).

## Useful Diagnostics

Run these before filing an issue when possible:

```bash
npm run doctor
npm run completion:check
npm run repository:check
npm run launch:check
```

For memory-quality issues, include:

- the command or MCP tool called,
- whether the backend used JSON or SQLite storage,
- a redacted `mnemic explain` or `mnemic audit` snippet,
- and whether the issue reproduces in `npm run demo`.

Do not attach private memory exports unless they have been reviewed and redacted.
