#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const checks = [
  fileContains('README visual card', 'README.md', /docs\/assets\/mnemic-readme-card\.svg/),
  fileContains('README Studio preview image', 'README.md', /docs\/assets\/mnemic-studio-preview\.png/),
  fileContains('README five-minute demo', 'README.md', /npm run demo/),
  fileContains('README benchmark command', 'README.md', /npm run benchmark/),
  fileContains('README doctor command', 'README.md', /npm run doctor/),
  fileContains('README OpenAPI check', 'README.md', /npm run openapi:check/),
  fileContains('README snapshot command', 'README.md', /mnemic snapshot/),
  fileContains('README differentiator section', 'README.md', /Why Mnemic/),
  fileContains('README current capability table', 'README.md', /What Ships Today/),
  fileContains('launch card exists and renders as SVG', 'docs/assets/mnemic-readme-card.svg', /<svg[\s\S]*Mnemic/),
  pngExists('Studio preview screenshot exists', 'docs/assets/mnemic-studio-preview.png'),
  fileContains('Studio preview capture script exists', 'scripts/capture-studio-preview.mjs', /playwright[\s\S]*screenshot/),
  fileContains('demo exercises snapshot replay', 'scripts/launch-demo.sh', /run_cli snapshot/),
  fileContains('demo writes launch report', 'scripts/launch-demo.sh', /mnemic-launch-report\.md/),
  fileContains('docs integrity check is linked', 'README.md', /npm run docs:check/),
  fileContains('docs integrity check is available', 'scripts/check-docs-integrity.mjs', /Mnemic Docs Integrity/),
  fileContains('TypeScript rewrite check is linked', 'README.md', /npm run rewrite:check/),
  fileContains('TypeScript rewrite check is available', 'scripts/check-typescript-rewrite.mjs', /Mnemic TypeScript Rewrite Check/),
  fileContains('fresh clone check is linked', 'README.md', /npm run fresh:check/),
  fileContains('fresh clone check is available', 'scripts/check-fresh-clone.mjs', /Mnemic Fresh Clone Check/),
  fileContains('completion audit is linked', 'README.md', /docs\/completion-audit\.md/),
  fileContains('completion check is linked', 'README.md', /npm run completion:check/),
  fileContains('completion audit check is available', 'scripts/check-completion-audit.mjs', /Mnemic Completion Audit Check/),
  fileContains('GitHub launch playbook exists', 'docs/github-launch.md', /# Mnemic GitHub Launch Playbook/),
  fileContains('GitHub launch check is available', 'scripts/check-github-launch.mjs', /Mnemic GitHub Launch Check/),
  fileContains('README links GitHub launch playbook', 'README.md', /docs\/github-launch\.md/),
  fileContains('repository identity doc exists', 'docs/repository-migration.md', /# Mnemic Repository Identity/),
  fileContains('repository identity check is available', 'scripts/check-repository-migration.mjs', /Mnemic Repository Identity Check/),
  fileContains('README links repository identity doc', 'README.md', /docs\/repository-migration\.md/),
  fileContains('README links repository check', 'README.md', /npm run repository:check/),
  fileContains('publication readiness check is available', 'scripts/check-publication-readiness.mjs', /Mnemic Public Launch Readiness/),
  fileContains('README links public check', 'README.md', /npm run public:check/),
  fileContains('supply-chain readiness check is available', 'scripts/check-supply-chain.mjs', /Mnemic Supply-Chain Readiness/),
  fileContains('README links supply check', 'README.md', /npm run supply:check/),
  fileContains('README links supply-chain doc', 'README.md', /docs\/supply-chain\.md/),
  fileContains('community health check is available', 'scripts/check-community-health.mjs', /Mnemic Community Health Check/),
  fileContains('README links community check', 'README.md', /npm run community:check/),
  fileContains('README links code of conduct', 'README.md', /CODE_OF_CONDUCT\.md/),
  fileContains('README links support policy', 'README.md', /SUPPORT\.md/),
  fileContains('security hardening doc exists', 'docs/security-hardening.md', /# Mnemic Security Hardening/),
  fileContains('security hardening check is available', 'scripts/check-security-hardening.mjs', /Mnemic Security Hardening Check/),
  fileContains('README links security hardening doc', 'README.md', /docs\/security-hardening\.md/),
  fileContains('README links security check', 'README.md', /npm run security:check/),
  fileContains('roadmap cites memory benchmark shape', 'docs/mnemic-2026-roadmap.md', /LoCoMo[\s\S]*LongMemEval[\s\S]*BEAM/),
  fileContains('benchmark baseline publishes recall metric', 'docs/benchmark-baseline.md', /recall@5/),
  fileContains('benchmark landscape is linked', 'README.md', /docs\/benchmark-landscape\.md/),
  fileContains('benchmark landscape has not-claimed guardrail', 'docs/benchmark-landscape.md', /not claimed/),
  fileContains('market readiness check is linked', 'README.md', /npm run market:check/),
  fileContains('market readiness check is available', 'scripts/check-market-readiness.mjs', /Mnemic Market Readiness/),
  fileContains('roadmap has 2026 market read', 'docs/mnemic-2026-roadmap.md', /## Market Read[\s\S]*Last checked: 2026-06-18/),
  fileContains('release checklist includes launch check', 'docs/release-checklist.md', /npm run launch:check/),
  fileContains('release notes are generated', 'docs/releases/v0.1.0.md', /# Mnemic v0\.1\.0 Release Notes/),
  fileContains('npm publishing strategy is linked', 'docs/npm-publishing.md', /npm Publishing Strategy/),
  fileContains('README links Docker quickstart', 'README.md', /docs\/docker-quickstart\.md/),
  fileContains('Docker readiness check is available', 'scripts/check-docker-readiness.mjs', /Mnemic Docker Readiness/),
  jsonArrayIncludes('package keywords include agent-memory', 'package.json', ['keywords'], 'agent-memory'),
  jsonArrayIncludes('package keywords include temporal-memory', 'package.json', ['keywords'], 'temporal-memory'),
  jsonArrayIncludes('package keywords include mcp', 'package.json', ['keywords'], 'mcp'),
  jsonArrayIncludes('package keywords include local-first', 'package.json', ['keywords'], 'local-first'),
]

let failures = 0
console.log('Mnemic Launch Readiness')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic launch readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic launch readiness passed.')

function fileContains(name, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, name, detail: `Missing ${relativePath}.` }
  }
  const content = readFileSync(absolutePath, 'utf8')
  return {
    ok: pattern.test(content),
    name,
    detail: `${relativePath} did not match ${pattern}.`,
  }
}

function pngExists(name, relativePath) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, name, detail: `Missing ${relativePath}. Run npm run studio:capture.` }
  }
  const bytes = readFileSync(absolutePath)
  const pngSignature = [0x89, 0x50, 0x4e, 0x47]
  const ok = pngSignature.every((byte, index) => bytes[index] === byte) && bytes.length > 10_000
  return {
    ok,
    name,
    detail: `${relativePath} is not a valid non-empty PNG preview asset.`,
  }
}

function jsonArrayIncludes(name, relativePath, path, expected) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, name, detail: `Missing ${relativePath}.` }
  }
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'))
  let current = parsed
  for (const key of path) {
    current = current?.[key]
  }
  const ok = Array.isArray(current) && current.includes(expected)
  return {
    ok,
    name,
    detail: `${relativePath}.${path.join('.')} does not include ${expected}.`,
  }
}
