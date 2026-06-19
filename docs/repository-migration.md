# Mnemic Repository Identity

Last updated: 2026-06-18.

The public source tree uses the Mnemic product identity and should not expose old repository names or retired project branding.

## Target Repository

Current target:

```text
https://github.com/dongtang3/mnemic
```

If you want an organization-owned launch instead, create an org target such as:

```text
https://github.com/mnemic-ai/mnemic
```

Then update package metadata, docs, and `scripts/check-repository-migration.mjs` in the same commit.

## Current Verification

Verified on 2026-06-18:

- GitHub repository: `https://github.com/dongtang3/mnemic`
- Local origin: `https://github.com/dongtang3/mnemic.git`
- Strict migration gate: `node scripts/check-repository-migration.mjs --require-renamed-origin`

## Identity Checklist

Run the local source checks:

```bash
npm run repository:check
npm run completion:check
npm run fresh:check -- --full
```

`npm run repository:check` validates package metadata, launch docs, and public-tree guardrails against old repository identities.

These steps are retained as the repeatable procedure if the repo is moved.

On GitHub:

1. Create or rename the repository to `dongtang3/mnemic`.
2. Set the About description to:

```text
Local-first memory kernel for coding agents: MCP-native, temporal, auditable, source-keyed, and benchmarked.
```

3. Add the topics from [docs/github-launch.md](github-launch.md).
4. Confirm issue templates, PR template, and GitHub Actions are visible.

Then update the local remote:

```bash
git remote set-url origin git@github.com:dongtang3/mnemic.git
git remote -v
```

Validate strict migration status:

```bash
node scripts/check-repository-migration.mjs --require-renamed-origin
```

## npm Metadata

Package metadata currently points to the target Mnemic repository:

- root workspace: `https://github.com/dongtang3/mnemic`
- `@mnemic/sdk`: `mnemic-sdk`
- `@mnemic/cli`: `mnemic-cli`
- `@mnemic/server`: `mnemic-server`
- `@mnemic/memory-mcp`: `mcp-server`

Do not publish packages until:

- the GitHub repository exists at the target URL,
- npm scope ownership is confirmed,
- `file:../mnemic-sdk` dependencies are replaced with registry ranges,
- and `npm run package:check` plus `npm run release:check` pass again.

## Current Blocker

Repository identity is no longer blocking public GitHub launch. npm publication is still gated by scope ownership, package privacy flags, registry dependency ranges, and trusted publishing setup.
