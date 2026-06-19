# Mnemic Supply-Chain Readiness

Last updated: 2026-06-18.

Mnemic is not ready for npm publication yet, but the repository should already keep supply-chain risk visible before the first public launch.

## Local Gate

Run:

```bash
npm run supply:check
```

The check verifies:

- `package-lock.json` is present and uses lockfile version 3.
- Linux Rolldown, esbuild, and lightningcss optional native bindings are locked so GitHub-hosted Linux runners can build Studio reproducibly.
- the root package pins the npm client through `packageManager`.
- `npm audit --audit-level=high` has no high-or-critical advisories in the current dependency graph.
- publishable packages still have `private: true`.
- package dry-run checks remain available through `npm run package:check`.
- GitHub workflows do not contain long-lived npm publish tokens.
- release docs, launch docs, CI smoke, and fresh-clone checks include the supply-chain gate.

## Publishing Policy

Use npm trusted publishing for the first public npm release instead of long-lived npm tokens.

Official npm docs describe trusted publishing as OIDC-based publishing from CI providers and list npm CLI 11.5.1+ plus Node 22.14.0+ as requirements:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/

Until the target GitHub repository, npm scope, and publish workflow are configured:

- keep all publishable packages at `private: true`,
- keep `file:../mnemic-sdk` workspace dependencies out of registry-bound package releases,
- do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` secrets to GitHub Actions,
- do not claim npm installability or package provenance,
- and treat `npm run package:check` as a tarball inspection gate, not a publish approval.

## Future Publish Workflow

After the GitHub repository is renamed to `dongtang3/mnemic`, the release branch is pushed, and the npm scope is owned:

1. Create trusted publisher records on npm for each package.
2. Use a dedicated GitHub Actions publish workflow on GitHub-hosted runners.
3. Set workflow permissions to include `id-token: write` and `contents: read`.
4. Use Node 22.14.0 or newer and npm 11.5.1 or newer.
5. Publish only after `npm run supply:check`, `npm run package:check`, and `node scripts/check-publication-readiness.mjs --strict` pass.

This repository intentionally does not include a publish workflow yet because packages remain private and the npm scope is not confirmed.
