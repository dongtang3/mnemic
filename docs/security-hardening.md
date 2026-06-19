# Mnemic Security Hardening

Last updated: 2026-06-18.

Mnemic stores long-term agent memory, so the repository treats memory exports, MCP inputs, benchmark fixtures, screenshots, and event logs as potentially sensitive.

## Local Gate

Run the static security hardening check:

```bash
npm run security:check
```

The check validates:

- CodeQL workflow presence and CodeQL Action v4 usage.
- `security-extended` and `security-and-quality` query suites.
- read-only default workflow permissions plus `security-events: write`.
- Dependabot coverage for npm and GitHub Actions.
- public security docs and sensitive-data guidance.
- release checklist, release notes, CI smoke, and doctor wiring.

## GitHub Code Scanning

The CodeQL workflow is [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml). It runs on pull requests, pushes to `main`, weekly schedule, and manual dispatch.

The workflow uses CodeQL Action v4 because GitHub released v4 on the Node.js 24 runtime and announced the v3 deprecation path for December 2026:

- https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/
- https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options

Remote CodeQL results are not available until the repository is published or renamed and GitHub Actions runs on the remote branch.

## Sensitive Data Rules

- Do not commit real tokens, keys, private prompts, customer data, production memory exports, or unredacted event logs.
- Use `mnemic preview` before high-impact writes.
- Use `mnemic audit` before publishing demos, screenshots, release notes, benchmark reports, or exported JSONL.
- Attach memory JSONL to issues or PRs only after review and redaction.

## Release Boundary

Passing `npm run security:check` means the source repository has the expected security hardening files. It does not prove that remote code scanning has run. Hosted CodeQL status remains a release blocker until GitHub Actions completes on the renamed public repository.
