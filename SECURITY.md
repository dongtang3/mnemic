# Security Policy

Mnemic stores long-term agent memory. Treat memory records, event logs, exported JSONL, Studio screenshots, benchmark fixtures, and MCP tool inputs as potentially sensitive.

## Supported Versions

Mnemic is pre-1.0. Security fixes target the current `main` branch until stable releases begin.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability or leaked secret.

Until a private security contact is published, report issues privately to the repository owner through GitHub. Include:

- affected package or surface: server, CLI, SDK, MCP, Studio, policy, storage, or docs.
- reproduction steps.
- whether durable memory, exported JSONL, MCP tool input, or local files can expose secrets.
- suggested mitigation if known.

## Sensitive Data Rules

- Never commit real tokens, keys, customer data, private prompts, or production memory exports.
- Use `mnemic preview` before high-impact writes so policy findings are visible before mutation.
- Use `mnemic audit` and `npm run doctor` before publishing demos, releases, screenshots, or benchmark reports.
- Redact memory exports before attaching them to issues or pull requests.

## MCP Safety Notes

Mnemic's MCP server is intended to run locally and connect to a trusted Mnemic backend through `MNEMIC_API_BASE`. Review MCP client config before use, especially command paths and environment variables.
