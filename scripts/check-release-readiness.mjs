#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const rootPackage = readJson('package.json')
const version = rootPackage.version

const publishablePackages = [
  ['mnemic-sdk', '@mnemic/sdk'],
  ['mnemic-cli', '@mnemic/cli'],
  ['mnemic-server', '@mnemic/server'],
  ['mcp-server', '@mnemic/memory-mcp'],
]

const checks = [
  check(rootPackage.private === true, 'root workspace remains private', 'Root package should remain private.'),
  fileContains('npm publishing strategy doc exists', 'docs/npm-publishing.md', /# Mnemic npm Publishing Strategy/),
  fileContains('publishing docs require scope ownership', 'docs/npm-publishing.md', /scope ownership/),
  fileContains('publishing docs mention file dependency rewrite', 'docs/npm-publishing.md', /file:\.\.\/mnemic-sdk/),
  fileContains('publishing docs include access public command', 'docs/npm-publishing.md', /npm publish --access public/),
  fileContains('repository identity doc exists', 'docs/repository-migration.md', /# Mnemic Repository Identity/),
  fileContains('repository identity doc has target repo', 'docs/repository-migration.md', /github\.com\/dongtang3\/mnemic/),
  fileContains('repository identity check exists', 'scripts/check-repository-migration.mjs', /Mnemic Repository Identity Check/),
  fileContains('publication readiness check exists', 'scripts/check-publication-readiness.mjs', /Mnemic Public Launch Readiness/),
  fileContains('supply-chain readiness check exists', 'scripts/check-supply-chain.mjs', /Mnemic Supply-Chain Readiness/),
  fileContains('community health check exists', 'scripts/check-community-health.mjs', /Mnemic Community Health Check/),
  fileContains('code of conduct exists', 'CODE_OF_CONDUCT.md', /# Mnemic Code of Conduct/),
  fileContains('support policy exists', 'SUPPORT.md', /# Mnemic Support/),
  fileContains('dependabot config exists', '.github/dependabot.yml', /package-ecosystem: "npm"/),
  fileContains('security hardening doc exists', 'docs/security-hardening.md', /# Mnemic Security Hardening/),
  fileContains('security hardening check exists', 'scripts/check-security-hardening.mjs', /Mnemic Security Hardening Check/),
  fileContains('CodeQL workflow exists', '.github/workflows/codeql.yml', /github\/codeql-action\/init@v4/),
  check(rootPackage.repository?.url === 'git+https://github.com/dongtang3/mnemic.git', 'root package repository points to Mnemic target', `got ${rootPackage.repository?.url || '(missing)'}`),
  check(rootPackage.bugs?.url === 'https://github.com/dongtang3/mnemic/issues', 'root package bugs URL points to Mnemic issues', `got ${rootPackage.bugs?.url || '(missing)'}`),
  check(typeof rootPackage.homepage === 'string' && rootPackage.homepage.startsWith('https://github.com/dongtang3/mnemic'), 'root package homepage points to Mnemic target', `got ${rootPackage.homepage || '(missing)'}`),
  fileContains('release notes exist', `docs/releases/v${version}.md`, new RegExp(`# Mnemic v${escapeRegExp(version)} Release Notes`)),
  fileContains('release notes include package table', `docs/releases/v${version}.md`, /@mnemic\/sdk[\s\S]*@mnemic\/cli[\s\S]*@mnemic\/server[\s\S]*@mnemic\/memory-mcp/),
  fileContains('release notes include benchmark metrics', `docs/releases/v${version}.md`, /recall@5[\s\S]*1\.00[\s\S]*relation path coverage/),
  fileContains('release notes do not claim external benchmark scores', `docs/releases/v${version}.md`, /External benchmark scores[\s\S]*not claimed/),
  fileContains('release notes include fresh clone check gate', `docs/releases/v${version}.md`, /npm run fresh:check/),
  fileContains('release notes include docs check gate', `docs/releases/v${version}.md`, /npm run docs:check/),
  fileContains('release notes include rewrite check gate', `docs/releases/v${version}.md`, /npm run rewrite:check/),
  fileContains('release notes include completion check gate', `docs/releases/v${version}.md`, /npm run completion:check/),
  fileContains('release notes include GitHub launch check gate', `docs/releases/v${version}.md`, /npm run github:launch:check/),
  fileContains('release notes include repository check gate', `docs/releases/v${version}.md`, /npm run repository:check/),
  fileContains('release notes include public check gate', `docs/releases/v${version}.md`, /npm run public:check/),
  fileContains('release notes include supply check gate', `docs/releases/v${version}.md`, /npm run supply:check/),
  fileContains('release notes include community check gate', `docs/releases/v${version}.md`, /npm run community:check/),
  fileContains('release notes include security check gate', `docs/releases/v${version}.md`, /npm run security:check/),
  fileContains('release notes include market check gate', `docs/releases/v${version}.md`, /npm run market:check/),
  fileContains('release notes include release check gate', `docs/releases/v${version}.md`, /npm run release:check/),
  fileContains('release checklist includes release notes generation', 'docs/release-checklist.md', /npm run release:notes/),
  fileContains('release checklist includes release check', 'docs/release-checklist.md', /npm run release:check/),
  fileContains('release checklist includes fresh clone check', 'docs/release-checklist.md', /npm run fresh:check/),
  fileContains('release checklist includes docs check', 'docs/release-checklist.md', /npm run docs:check/),
  fileContains('release checklist includes rewrite check', 'docs/release-checklist.md', /npm run rewrite:check/),
  fileContains('release checklist includes completion check', 'docs/release-checklist.md', /npm run completion:check/),
  fileContains('release checklist includes GitHub launch check', 'docs/release-checklist.md', /npm run github:launch:check/),
  fileContains('release checklist includes repository check', 'docs/release-checklist.md', /npm run repository:check/),
  fileContains('release checklist includes public check', 'docs/release-checklist.md', /npm run public:check/),
  fileContains('release checklist includes supply check', 'docs/release-checklist.md', /npm run supply:check/),
  fileContains('release checklist includes community check', 'docs/release-checklist.md', /npm run community:check/),
  fileContains('release checklist includes security check', 'docs/release-checklist.md', /npm run security:check/),
  fileContains('release checklist includes market check', 'docs/release-checklist.md', /npm run market:check/),
  fileContains('TypeScript rewrite check exists', 'scripts/check-typescript-rewrite.mjs', /Mnemic TypeScript Rewrite Check/),
  fileContains('fresh clone check exists', 'scripts/check-fresh-clone.mjs', /Mnemic Fresh Clone Check/),
  fileContains('docs integrity check exists', 'scripts/check-docs-integrity.mjs', /Mnemic Docs Integrity/),
  fileContains('completion audit exists', 'docs/completion-audit.md', /# Mnemic Completion Audit/),
  fileContains('completion audit check exists', 'scripts/check-completion-audit.mjs', /Mnemic Completion Audit Check/),
  fileContains('repository identity doc exists', 'docs/repository-migration.md', /# Mnemic Repository Identity/),
  fileContains('repository identity check exists', 'scripts/check-repository-migration.mjs', /Mnemic Repository Identity Check/),
  fileContains('publication readiness check exists', 'scripts/check-publication-readiness.mjs', /Mnemic Public Launch Readiness/),
  fileContains('supply-chain readiness check exists', 'scripts/check-supply-chain.mjs', /Mnemic Supply-Chain Readiness/),
  fileContains('community health check exists', 'scripts/check-community-health.mjs', /Mnemic Community Health Check/),
  fileContains('security hardening check exists', 'scripts/check-security-hardening.mjs', /Mnemic Security Hardening Check/),
  fileContains('GitHub launch playbook exists', 'docs/github-launch.md', /# Mnemic GitHub Launch Playbook/),
  fileContains('market readiness script exists', 'scripts/check-market-readiness.mjs', /Mnemic Market Readiness/),
  fileContains('changelog mentions release readiness', 'CHANGELOG.md', /release notes/),
]

for (const [dir, expectedName] of publishablePackages) {
  const packageJson = readJson(`${dir}/package.json`)
  checks.push(check(packageJson.name === expectedName, `${dir} package name is ${expectedName}`, `got ${packageJson.name}`))
  checks.push(check(packageJson.version === version, `${dir} version matches root ${version}`, `got ${packageJson.version}`))
  checks.push(check(packageJson.repository?.url === 'git+https://github.com/dongtang3/mnemic.git', `${dir} repository points to Mnemic target`, `got ${packageJson.repository?.url || '(missing)'}`))
  checks.push(check(packageJson.private === true, `${dir} remains private before npm scope confirmation`, 'private should remain true before registry publish review.'))
}

const fileDependencyPackages = publishablePackages
  .map(([dir]) => [dir, readJson(`${dir}/package.json`)])
  .filter(([, packageJson]) => Object.values(packageJson.dependencies ?? {}).some((value) => typeof value === 'string' && value.startsWith('file:')))

checks.push(check(fileDependencyPackages.length > 0, 'registry dependency rewrite is still required before npm publish', 'Expected at least one file: dependency while packages are private.'))

let failures = 0
console.log('Mnemic Release Readiness')
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
  if (!item.ok) {
    failures += 1
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic release readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic release readiness passed.')

function fileContains(message, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return check(false, message, `Missing ${relativePath}.`)
  }
  const content = readFileSync(absolutePath, 'utf8')
  return check(pattern.test(content), message, `${relativePath} did not match ${pattern}.`)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}

function check(ok, message, detail) {
  return { ok, message, detail }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
