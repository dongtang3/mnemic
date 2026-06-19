#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const checks = [
  fileContains('code of conduct exists', 'CODE_OF_CONDUCT.md', /# Mnemic Code of Conduct[\s\S]*Expected Behavior[\s\S]*Enforcement/),
  fileContains('support policy exists', 'SUPPORT.md', /# Mnemic Support[\s\S]*Where To Ask[\s\S]*Useful Diagnostics/),
  fileContains('dependabot config exists', '.github/dependabot.yml', /package-ecosystem: "npm"[\s\S]*package-ecosystem: "github-actions"/),
  fileContains('gitignore allows community files', '.gitignore', /!\/CHANGELOG\.md[\s\S]*!\/CODE_OF_CONDUCT\.md[\s\S]*!\/CONTRIBUTING\.md[\s\S]*!\/LICENSE[\s\S]*!\/SECURITY\.md[\s\S]*!\/SUPPORT\.md/),
  fileContains('gitignore allows examples', '.gitignore', /!\/examples\/[\s\S]*!\/examples\/\*\*/),
  fileContains('README links code of conduct', 'README.md', /CODE_OF_CONDUCT\.md/),
  fileContains('README links support policy', 'README.md', /SUPPORT\.md/),
  fileContains('contributing references code of conduct', 'CONTRIBUTING.md', /CODE_OF_CONDUCT\.md/),
  fileContains('security references support policy or public issue boundary', 'SECURITY.md', /public issue/),
  fileContains('release checklist includes community check', 'docs/release-checklist.md', /npm run community:check/),
  fileContains('release notes include community check', 'docs/releases/v0.1.0.md', /npm run community:check/),
  fileContains('release readiness checks community health', 'scripts/check-release-readiness.mjs', /community health/),
  fileContains('launch readiness checks community health', 'scripts/check-launch-readiness.mjs', /community health/),
  fileContains('CI smoke checks community health', 'scripts/ci-smoke.sh', /check-community-health\.mjs/),
]

let failures = 0
console.log('Mnemic Community Health Check')
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
  if (!item.ok) {
    failures += 1
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic community health check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic community health check passed.')

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
