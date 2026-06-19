#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const checks = [
  jsonScriptEquals('package exposes completion check', 'package.json', 'completion:check', 'node scripts/check-completion-audit.mjs'),
  fileContains('completion audit exists', 'docs/completion-audit.md', /# Mnemic Completion Audit/),
  fileContains('audit has current date', 'docs/completion-audit.md', /Last audited: 2026-06-18/),
  fileContains('audit preserves original scope', 'docs/completion-audit.md', /## Original User Scope[\s\S]*Rewrite the project in TypeScript[\s\S]*clean Mnemic product identity[\s\S]*large-model memory/),
  fileContains('audit covers GitHub-hot direction honestly', 'docs/completion-audit.md', /GitHub-hot-worthy[\s\S]*not a guarantee of future ranking/),
  fileContains('audit records docs integrity status', 'docs/completion-audit.md', /Docs integrity[\s\S]*npm run docs:check[\s\S]*README Docs Map/),
  fileContains('audit records full fresh-clone proof', 'docs/completion-audit.md', /npm run fresh:check -- --full[\s\S]*Result: pass/),
  fileContains('audit records TypeScript rewrite proof', 'docs/completion-audit.md', /npm run rewrite:check[\s\S]*Result: pass/),
  fileContains('audit records launch proof', 'docs/completion-audit.md', /npm run github:launch:check[\s\S]*npm run market:check[\s\S]*Result: pass/),
  fileContains('audit records repository identity proof', 'docs/completion-audit.md', /Repository identity[\s\S]*https:\/\/github\.com\/dongtang3\/mnemic[\s\S]*--require-renamed-origin/),
  fileContains('audit records public launch strict proof', 'docs/completion-audit.md', /Public launch state[\s\S]*check-publication-readiness\.mjs --strict[\s\S]*GitHub About description[\s\S]*discovery topics[\s\S]*hosted Mnemic CI success[\s\S]*hosted Mnemic CodeQL success/),
  fileContains('audit records supply-chain readiness status', 'docs/completion-audit.md', /Supply-chain readiness[\s\S]*npm run supply:check[\s\S]*Linux native optional build bindings[\s\S]*Provenance cannot be claimed/),
  fileContains('audit records current market sources', 'docs/completion-audit.md', /GitHub Copilot memory[\s\S]*Model Context Protocol[\s\S]*LongMemEval-V2[\s\S]*MemGym[\s\S]*AMemGym/),
  fileContains('audit records Docker runtime proof', 'docs/completion-audit.md', /Docker runtime path[\s\S]*check-docker-readiness\.mjs --compose-config --live/),
  fileContains('audit records npm publish blocker', 'docs/completion-audit.md', /npm scope ownership/),
  fileContains('README links completion audit', 'README.md', /docs\/completion-audit\.md/),
  fileContains('README includes completion check gate', 'README.md', /npm run completion:check/),
  fileContains('README includes docs check gate', 'README.md', /npm run docs:check/),
  fileContains('README includes repository check gate', 'README.md', /npm run repository:check/),
  fileContains('README includes public check gate', 'README.md', /npm run public:check/),
  fileContains('README includes supply check gate', 'README.md', /npm run supply:check/),
  fileContains('README includes community check gate', 'README.md', /npm run community:check/),
  fileContains('README includes security check gate', 'README.md', /npm run security:check/),
  fileContains('release checklist includes completion check', 'docs/release-checklist.md', /npm run completion:check/),
  fileContains('release checklist includes docs check', 'docs/release-checklist.md', /npm run docs:check/),
  fileContains('release checklist includes repository check', 'docs/release-checklist.md', /npm run repository:check/),
  fileContains('release checklist includes public check', 'docs/release-checklist.md', /npm run public:check/),
  fileContains('release checklist includes supply check', 'docs/release-checklist.md', /npm run supply:check/),
  fileContains('release checklist includes community check', 'docs/release-checklist.md', /npm run community:check/),
  fileContains('release checklist includes security check', 'docs/release-checklist.md', /npm run security:check/),
  fileContains('release notes include completion check', 'docs/releases/v0.1.0.md', /npm run completion:check/),
  fileContains('release notes include docs check', 'docs/releases/v0.1.0.md', /npm run docs:check/),
  fileContains('release notes include repository check', 'docs/releases/v0.1.0.md', /npm run repository:check/),
  fileContains('release notes include public check', 'docs/releases/v0.1.0.md', /npm run public:check/),
  fileContains('release notes include supply check', 'docs/releases/v0.1.0.md', /npm run supply:check/),
  fileContains('release notes include community check', 'docs/releases/v0.1.0.md', /npm run community:check/),
  fileContains('release notes include security check', 'docs/releases/v0.1.0.md', /npm run security:check/),
  fileContains('release readiness checks completion audit', 'scripts/check-release-readiness.mjs', /completion audit/),
  fileContains('launch readiness checks completion audit', 'scripts/check-launch-readiness.mjs', /completion audit/),
  fileContains('CI smoke checks completion audit', 'scripts/ci-smoke.sh', /check-completion-audit\.mjs/),
  workspaceSourceExists('SDK TypeScript source exists', 'mnemic-sdk/src/index.ts'),
  workspaceSourceExists('CLI TypeScript source exists', 'mnemic-cli/src/index.ts'),
  workspaceSourceExists('server TypeScript source exists', 'mnemic-server/src/server.ts'),
  workspaceSourceExists('MCP TypeScript source exists', 'mcp-server/src/index.ts'),
  workspaceSourceExists('Studio TSX source exists', 'studio/src/App.tsx'),
]

let failures = 0
console.log('Mnemic Completion Audit Check')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic completion audit check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic completion audit check passed.')

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

function workspaceSourceExists(name, relativePath) {
  return {
    ok: existsSync(join(rootDir, relativePath)),
    name,
    detail: `Missing ${relativePath}.`,
  }
}

function jsonScriptEquals(name, relativePath, scriptName, expected) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, name, detail: `Missing ${relativePath}.` }
  }
  const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'))
  const actual = parsed.scripts?.[scriptName]
  return {
    ok: actual === expected,
    name,
    detail: `${relativePath}.scripts.${scriptName} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}.`,
  }
}
