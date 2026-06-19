# Mnemic Release Checklist

Use this checklist before tagging a release, publishing packages, or sharing a public launch post.

## Required Gates

```bash
npm install
npm run build
npm test
npm run doctor
npm run launch:check
npm run docs:check
npm run rewrite:check
npm run completion:check
npm run fresh:check -- --full
npm run github:launch:check
npm run docker:check
npm run repository:check
npm run public:check
npm run supply:check
npm run community:check
npm run security:check
npm run market:check
npm run openapi:check
npm run package:check
npm run demo
npm run studio:capture
npm run benchmark
npm run benchmark:landscape:check
npm run release:notes
npm run release:check
npm run ci:smoke
```

## Memory Safety

- Run `mnemic audit --project mnemic --max-blocks 0`.
- Review `target/mnemic-benchmark/mnemic-eval-report.md`.
- Review [docs/benchmark-landscape.md](benchmark-landscape.md) and keep external benchmark scores marked as not claimed until adapter commands exist.
- Check exported JSONL before attaching memory artifacts to a release.
- Confirm examples and docs do not contain secrets, customer data, private prompts, or production memory exports.

## Package Readiness

- Confirm npm scope ownership before removing `private: true` from publishable packages.
- Review [docs/npm-publishing.md](npm-publishing.md) before changing package privacy or dependency ranges.
- Confirm package names:
  - `@mnemic/sdk`
  - `@mnemic/cli`
  - `@mnemic/server`
  - `@mnemic/memory-mcp`
- Confirm package descriptions, license, keywords, `bin`, `exports`, and Node engine fields.
- Confirm `npm run package:check` passes and `npm pack --dry-run` contains README, package metadata, and dist entrypoints only.
- Confirm `npm run release:notes` refreshes [docs/releases/v0.1.0.md](releases/v0.1.0.md).
- Confirm `npm run release:check` passes before tagging.
- Confirm the root workspace remains private unless the monorepo itself is intentionally published.

## GitHub Readiness

- Confirm README quickstart works from a fresh clone.
- Confirm `npm run docs:check` passes so README Docs Map links, local Markdown links, and image targets stay valid.
- Confirm `npm run completion:check` passes so the original rename, TypeScript rewrite, 2026 direction, and remaining blockers stay explicit.
- Confirm `npm run fresh:check -- --full` passes before sharing the repository outside a development branch.
- Confirm `npm run rewrite:check` passes so the public product tree remains TypeScript-first and non-TypeScript runtime roots stay out of the public product tree.
- Confirm `npm run repository:check` passes and run `node scripts/check-repository-migration.mjs --require-renamed-origin`.
- Confirm `npm run public:check` reports the remaining external blockers, and after pushing run `node scripts/check-publication-readiness.mjs --strict`.
- Confirm `npm run supply:check` passes so the lockfile, npm audit threshold, package-manager pin, token boundary, and trusted-publishing docs stay current.
- Confirm `npm run community:check` passes so GitHub community-health files stay present before public launch.
- Confirm `npm run security:check` passes so CodeQL, Dependabot, and sensitive-data release boundaries stay present before public launch.
- Confirm `npm run studio:capture` refreshes `docs/assets/mnemic-studio-preview.png` after meaningful Studio UI changes.
- Confirm `npm run launch:check` passes so README visuals, demo path, benchmark links, and snapshot launch artifacts stay intact.
- Confirm `npm run benchmark:landscape:check` passes before publishing benchmark or leaderboard language.
- Confirm `npm run market:check` passes so 2026 positioning sources and Mnemic branding stay current.
- Confirm `npm run docker:check` passes, and run `node scripts/check-docker-readiness.mjs --compose-config --live` on a machine with Docker before publishing Docker instructions.
- Confirm `docs/openapi.json` is current by running `npm run openapi:check`.
- Confirm issue templates and pull request template render correctly.
- Confirm [docs/github-launch.md](github-launch.md) has the current repo description, topics, launch copy, and no-claim guardrails.
- Confirm `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, and `LICENSE` are present.
- Confirm `.github/workflows/ci.yml` is green on the release branch.
- Confirm `.github/workflows/codeql.yml` has run successfully on the renamed public repository before claiming hosted code scanning is active.

## Release Memory

Record a release memory with a stable source key:

```bash
node mnemic-cli/dist/index.js remember \
  --title "v0.1.0 release" \
  --content "Summarize the verified release scope and benchmark baseline." \
  --project mnemic \
  --type release \
  --source-key "release/v0.1.0"
```

Preview first when release notes mention credentials, hosted endpoints, or customer-specific data:

```bash
node mnemic-cli/dist/index.js preview \
  --title "v0.1.0 release" \
  --content "Release note draft." \
  --project mnemic \
  --type release \
  --source-key "release/v0.1.0"
```
