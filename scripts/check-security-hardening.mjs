#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const checks = [
  fileContains('security hardening doc exists', 'docs/security-hardening.md', /# Mnemic Security Hardening/),
  fileContains('security hardening doc records CodeQL v4', 'docs/security-hardening.md', /CodeQL Action v4/),
  fileContains('CodeQL workflow exists', '.github/workflows/codeql.yml', /name: Mnemic CodeQL/),
  fileContains('CodeQL workflow uses action v4 init', '.github/workflows/codeql.yml', /github\/codeql-action\/init@v4/),
  fileContains('CodeQL workflow uses action v4 analyze', '.github/workflows/codeql.yml', /github\/codeql-action\/analyze@v4/),
  fileContains('CodeQL workflow scans JavaScript and TypeScript', '.github/workflows/codeql.yml', /languages: javascript-typescript/),
  fileContains('CodeQL workflow uses extended queries', '.github/workflows/codeql.yml', /security-extended,security-and-quality/),
  fileContains('CodeQL workflow has least privilege contents read', '.github/workflows/codeql.yml', /contents: read/),
  fileContains('CodeQL workflow can write security events', '.github/workflows/codeql.yml', /security-events: write/),
  fileContains('Dependabot covers npm', '.github/dependabot.yml', /package-ecosystem: "npm"/),
  fileContains('Dependabot covers GitHub Actions', '.github/dependabot.yml', /package-ecosystem: "github-actions"/),
  fileContains('SECURITY warns against public vulnerability issues', 'SECURITY.md', /Do not open a public issue/),
  fileContains('SECURITY covers sensitive memory artifacts', 'SECURITY.md', /memory records[\s\S]*exported JSONL/),
  fileContains('README links security hardening docs', 'README.md', /docs\/security-hardening\.md/),
  fileContains('README links security check', 'README.md', /npm run security:check/),
  fileContains('release checklist includes security check', 'docs/release-checklist.md', /npm run security:check/),
  fileContains('release notes include security check', 'docs/releases/v0.1.0.md', /npm run security:check/),
  fileContains('release readiness checks security hardening', 'scripts/check-release-readiness.mjs', /security hardening/),
  fileContains('launch readiness checks security hardening', 'scripts/check-launch-readiness.mjs', /security hardening/),
  fileContains('doctor checks security hardening', 'mnemic-cli/src/doctor.ts', /checkSecurityHardening/),
  fileContains('CI smoke checks security hardening', 'scripts/ci-smoke.sh', /check-security-hardening\.mjs/),
]

let failures = 0
console.log('Mnemic Security Hardening Check')
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
  if (!item.ok) {
    failures += 1
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic security hardening check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic security hardening check passed.')

function fileContains(message, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, message, detail: `Missing ${relativePath}.` }
  }
  const content = readFileSync(absolutePath, 'utf8')
  return {
    ok: pattern.test(content),
    message,
    detail: `${relativePath} did not match ${pattern}.`,
  }
}
