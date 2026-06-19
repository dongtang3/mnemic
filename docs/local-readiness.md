# Mnemic Local Readiness

Use doctor before publishing, debugging a clone, or helping someone wire Mnemic into an MCP client.

```bash
npm run init
npm run doctor
```

The command builds the CLI and runs:

```bash
node mnemic-cli/dist/index.js doctor
```

## What It Checks

- Node.js runtime is 20 or newer.
- Root `package.json` is the Mnemic workspace.
- TypeScript workspace package manifests exist.
- TypeScript rewrite boundary is enforced: active runtime packages are TypeScript and non-TypeScript runtime roots stay out of the public product tree.
- Fresh-clone checks can install and validate a temporary copy without local `node_modules`, `dist`, or `target` artifacts.
- Init-generated local config exists when expected: `.env.mnemic` and `.mnemic/policy.json`.
- Open-source metadata exists: license, contributing guide, security policy, changelog, release checklist, pull request template, and issue templates.
- Launch assets exist: README visual card, Studio preview screenshot, launch-readiness check, Studio capture script, and coding-agent demo walkthrough.
- Completion audit files exist so original rewrite, rename, and 2026 positioning claims stay tied to source evidence.
- Repository identity files exist so package metadata and launch docs point at the final Mnemic GitHub target.
- Community health files exist: code of conduct, support policy, Dependabot config, issue templates, PR template, security policy, and contribution guide.
- Security hardening files exist: CodeQL workflow, security hardening docs, Dependabot config, security policy, and static security check.
- Docs integrity files exist and README/local Markdown links can be checked before public launch.
- GitHub launch playbook exists with repo description, topics, launch copy, and benchmark claim guardrails.
- Docker quickstart files exist: compose file, backend Dockerfile, Docker readiness check, and Docker quickstart docs.
- Package readiness files exist: package READMEs and `scripts/check-package-readiness.mjs`.
- OpenAPI contract files exist and `docs/openapi.json` declares an OpenAPI 3.x document.
- CLI, server, MCP, and Studio build artifacts exist.
- `.mcp.json` contains a `mnemic-memory` MCP server entry.
- `.mnemic/policy.example.json` parses.
- A local benchmark report exists when one has been generated.
- Benchmark landscape docs exist and keep external benchmark claims explicit.
- Market readiness checks exist and keep 2026 positioning sources plus public Mnemic branding explicit.
- Release notes and npm publishing strategy docs exist.
- Backend health, policy, and memory audit if the backend is reachable.

Backend checks are warnings by default so offline source checks still work. Use strict mode when the backend must be online:

```bash
node mnemic-cli/dist/index.js doctor --require-backend --project mnemic
```

Use a different backend or repository root:

```bash
node mnemic-cli/dist/index.js doctor \
  --base-url http://127.0.0.1:8088 \
  --root /path/to/mnemic \
  --project mnemic
```

## Interpreting Results

Doctor emits `pass`, `warn`, and `fail` checks.

- `pass`: ready.
- `warn`: usable, but a release/demo artifact or optional service is missing.
- `fail`: broken for local development or strict backend validation.

Warnings do not fail the process. Failures set a non-zero exit code.

## Fixing Missing Local Config

If doctor warns about missing `.env.mnemic`, `.mcp.json`, or policy config, run:

```bash
npm run init
```

`mnemic init` is idempotent: it skips existing files by default and only overwrites generated files when called with `--force`.

## Package Readiness

Doctor checks that package-readiness files exist. Run the full package dry-run gate separately:

```bash
npm run package:check
```

This verifies package metadata, package README files, dist entrypoints, and tarball contents for the SDK, CLI, server, and MCP packages.

## API Contract

Doctor checks that the OpenAPI contract is present and parseable. Run the full route/schema drift gate separately:

```bash
npm run openapi:check
```

## Benchmark Landscape

The local benchmark is reproducible, but Mnemic should not claim external benchmark scores until adapters exist:

```bash
npm run benchmark
npm run benchmark:landscape:check
npm run docs:check
npm run rewrite:check
npm run completion:check
npm run repository:check
npm run community:check
npm run security:check
npm run fresh:check
npm run market:check
```

The landscape page is [docs/benchmark-landscape.md](benchmark-landscape.md).
The market check keeps the 2026 roadmap sources and public Mnemic branding from drifting away from the agent-memory positioning.

## Release Readiness

Generate launch-candidate notes and validate publish guardrails:

```bash
npm run release:notes
npm run release:check
npm run github:launch:check
```

The publishing strategy is [docs/npm-publishing.md](npm-publishing.md), and the generated release notes live under `docs/releases/`.

## Docker Readiness

Docker is optional for local development, but public launch instructions should keep the container path working:

```bash
npm run docker:check
```

This static check does not require Docker. On a machine with Docker installed, validate Compose syntax too:

```bash
node scripts/check-docker-readiness.mjs --compose-config
```

Before advertising the Docker path as end-to-end validated, run the live gate. It builds the backend image, starts `mnemic-memory-backend`, checks the host health endpoint, waits for Docker health to become `healthy`, then stops the container:

```bash
node scripts/check-docker-readiness.mjs --compose-config --live
```

## Studio Preview

Refresh the README Studio screenshot after meaningful UI changes:

```bash
npm run studio:capture
```

The capture script starts an isolated backend and Studio, seeds a small memory graph, waits for the graph canvas, and writes:

```text
docs/assets/mnemic-studio-preview.png
```

On a fresh machine, the first run downloads Playwright Chromium through `npx`.
