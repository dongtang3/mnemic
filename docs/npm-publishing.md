# Mnemic npm Publishing Strategy

Mnemic packages are intentionally **not publishable yet**. The source workspace keeps every publishable package at `private: true` until npm scope ownership and dependency rewrites are reviewed.

## Intended Packages

| Package | Role | Current status |
| --- | --- | --- |
| `@mnemic/sdk` | Shared TypeScript contracts and HTTP client | private until scope ownership is confirmed |
| `@mnemic/cli` | `mnemic` command-line workflow | private until `@mnemic/sdk` dependency is a registry range |
| `@mnemic/server` | TypeScript memory backend | private until `@mnemic/sdk` dependency is a registry range |
| `@mnemic/memory-mcp` | MCP adapter for agent clients | private until `@mnemic/sdk` dependency is a registry range |

The root `@mnemic/platform` workspace should remain private unless the monorepo itself is intentionally published later.

## Publish Blockers

Before npm publish:

1. Confirm `@mnemic` npm scope ownership, or choose a different package scope.
2. Confirm the GitHub repository exists at `https://github.com/dongtang3/mnemic` or update package metadata to the chosen final repository.
3. Run `npm run repository:check` and `node scripts/check-repository-migration.mjs --require-renamed-origin`.
4. Replace `file:../mnemic-sdk` dependencies with a registry version range such as `^0.1.0`.
5. Re-run `npm install` so the lockfile reflects registry-safe dependency ranges.
6. Keep `files` allowlists tight: `dist`, `README.md`, and `package.json`.
7. Run `npm run package:check` and inspect the dry-run tarball output.
8. Run `npm run supply:check`.
9. Run `npm run release:check`.
10. Configure npm trusted publishing for each package and publish from a GitHub-hosted runner instead of using a long-lived npm token.
11. Remove `private: true` only in the packages being intentionally published.

## Trusted Publishing And Provenance

Use npm trusted publishing for the public release path. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` to GitHub Actions while this repo remains pre-publish.

The publish workflow should be added only after the repository is renamed and the npm scope is owned. It should use:

- GitHub-hosted runners.
- `permissions: id-token: write` and `contents: read`.
- Node 22.14.0 or newer.
- npm 11.5.1 or newer.
- npm package trusted-publisher records configured on npmjs.com.

When trusted publishing is enabled, provenance and publish attestations become part of the package trust story. Until that workflow exists and has run, do not claim npm provenance.

## Name Availability Snapshot

Checked on 2026-06-18:

```bash
npm view mnemic
npm view @mnemic/sdk
```

Both returned npm `E404` in the current environment. Treat this only as a snapshot, not ownership proof. Re-run the checks and confirm npm account or organization scope ownership immediately before publishing.

## Publish Order

Publish only after the blockers above are resolved:

Canonical package-directory form:

```bash
npm publish --access public
```

Monorepo convenience form:

```bash
npm --prefix mnemic-sdk publish --access public
npm --prefix mnemic-cli publish --access public
npm --prefix mnemic-server publish --access public
npm --prefix mcp-server publish --access public
```

## Current Safe Commands

These commands are safe because they do not publish:

```bash
npm run package:check
npm run supply:check
npm run repository:check
npm run release:notes
npm run release:check
```

`npm run package:check` uses `npm pack --dry-run --json` to inspect package contents while all publishable packages remain private.
