#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const rootPackage = readJson('package.json')
const lockfile = readJson('package-lock.json')
const publishablePackages = ['mnemic-sdk', 'mnemic-cli', 'mnemic-server', 'mcp-server']

const checks = [
  fileContains('supply-chain doc exists', 'docs/supply-chain.md', /# Mnemic Supply-Chain Readiness/),
  fileContains('supply-chain doc references trusted publishing', 'docs/supply-chain.md', /trusted publishing/),
  fileContains('supply-chain doc references provenance', 'docs/supply-chain.md', /provenance/),
  fileContains('supply-chain doc records npm runtime floor', 'docs/supply-chain.md', /npm CLI 11\.5\.1\+[\s\S]*Node 22\.14\.0\+/),
  packageScript('package exposes supply check', 'supply:check', 'node scripts/check-supply-chain.mjs'),
  packageScript('package exposes docs check', 'docs:check', 'node scripts/check-docs-integrity.mjs'),
  fileContains('README includes supply check gate', 'README.md', /npm run supply:check/),
  fileContains('GitHub launch playbook includes supply check', 'docs/github-launch.md', /npm run supply:check/),
  fileContains('release checklist includes supply check', 'docs/release-checklist.md', /npm run supply:check/),
  fileContains('release notes include supply check', 'docs/releases/v0.1.0.md', /npm run supply:check/),
  fileContains('npm publishing doc references trusted publishing', 'docs/npm-publishing.md', /trusted publishing/),
  fileContains('npm publishing doc references provenance', 'docs/npm-publishing.md', /provenance/),
  fileContains('CI smoke runs supply check', 'scripts/ci-smoke.sh', /check-supply-chain\.mjs/),
  fileContains('CI smoke runs docs check', 'scripts/ci-smoke.sh', /check-docs-integrity\.mjs/),
  fileContains('fresh clone runs supply check', 'scripts/check-fresh-clone.mjs', /supply:check/),
  fileContains('fresh clone runs docs check', 'scripts/check-fresh-clone.mjs', /docs:check/),
  fileContains('package readiness uses npm pack dry-run JSON', 'scripts/check-package-readiness.mjs', /npm[\s\S]*pack[\s\S]*--dry-run[\s\S]*--json/),
  check(lockfile.lockfileVersion === 3, 'package-lock uses lockfile version 3', `got ${lockfile.lockfileVersion || '(missing)'}`),
  check(lockfile.packages?.['']?.name === rootPackage.name, 'package-lock root package matches package.json', `got ${lockfile.packages?.['']?.name || '(missing)'}`),
  rolldownBindingLockEntry('linux x64 glibc Rolldown binding is locked', 'node_modules/@rolldown/binding-linux-x64-gnu'),
  rolldownBindingLockEntry('linux arm64 glibc Rolldown binding is locked', 'node_modules/@rolldown/binding-linux-arm64-gnu'),
  nativeOptionalLockEntry('linux x64 esbuild binding is locked', 'node_modules/@esbuild/linux-x64', 'x64'),
  nativeOptionalLockEntry('linux arm64 esbuild binding is locked', 'node_modules/@esbuild/linux-arm64', 'arm64'),
  nativeOptionalLockEntry('linux x64 lightningcss binding is locked', 'node_modules/lightningcss-linux-x64-gnu', 'x64'),
  nativeOptionalLockEntry('linux arm64 lightningcss binding is locked', 'node_modules/lightningcss-linux-arm64-gnu', 'arm64'),
  check(typeof rootPackage.packageManager === 'string' && /^npm@\d+\.\d+\.\d+$/.test(rootPackage.packageManager), 'packageManager pins npm', `got ${rootPackage.packageManager || '(missing)'}`),
  check(npmVersionAtLeast(rootPackage.packageManager, 11, 5, 1), 'packageManager npm satisfies trusted-publishing floor', `got ${rootPackage.packageManager || '(missing)'}`),
  workflowDoesNotContainToken(),
  npmAuditHigh(),
]

for (const packageDir of publishablePackages) {
  const packageJson = readJson(`${packageDir}/package.json`)
  checks.push(check(packageJson.private === true, `${packageDir} remains private before scope confirmation`, 'private should stay true before npm scope ownership and registry ranges are reviewed.'))
}

const fileDependencyPackages = publishablePackages
  .map((packageDir) => [packageDir, readJson(`${packageDir}/package.json`)])
  .filter(([, packageJson]) => Object.values(packageJson.dependencies ?? {}).some((value) => typeof value === 'string' && value.startsWith('file:')))
checks.push(check(fileDependencyPackages.length > 0, 'registry dependency rewrite remains explicit before publish', 'Expected file: dependencies while packages stay private.'))

let failures = 0
console.log('Mnemic Supply-Chain Readiness')
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
  if (!item.ok) {
    failures += 1
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic supply-chain readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic supply-chain readiness passed.')

function npmAuditHigh() {
  const result = spawnSync('npm', ['audit', '--audit-level=high'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const detail = (result.stdout || result.stderr || '').trim()
  return {
    ok: result.status === 0,
    message: 'npm audit high threshold passes',
    detail: detail || `npm audit exited with ${result.status ?? 'unknown'}.`,
  }
}

function workflowDoesNotContainToken() {
  const workflowsDir = join(rootDir, '.github/workflows')
  if (!existsSync(workflowsDir)) {
    return check(false, 'GitHub workflows do not contain npm publish tokens', 'Missing .github/workflows.')
  }
  const tokenPattern = /\b(NPM_TOKEN|NODE_AUTH_TOKEN)\b/
  const matches = []
  for (const entry of readdirSync(workflowsDir)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue
    const relativePath = `.github/workflows/${entry}`
    const content = readFileSync(join(rootDir, relativePath), 'utf8')
    if (tokenPattern.test(content)) {
      matches.push(relativePath)
    }
  }
  return check(matches.length === 0, 'GitHub workflows do not contain npm publish tokens', `token-like npm publish secrets found in ${matches.join(', ')}`)
}

function rolldownBindingLockEntry(message, packagePath) {
  const entry = lockfile.packages?.[packagePath]
  return check(
    entry?.optional === true && entry?.os?.includes('linux') && Array.isArray(entry?.cpu),
    message,
    `${packagePath} is missing from package-lock.json or is not marked as a linux optional binding.`
  )
}

function nativeOptionalLockEntry(message, packagePath, cpu) {
  const entry = lockfile.packages?.[packagePath]
  return check(
    entry?.optional === true && entry?.os?.includes('linux') && entry?.cpu?.includes(cpu),
    message,
    `${packagePath} is missing from package-lock.json or is not marked as a linux ${cpu} optional binding.`
  )
}

function fileContains(message, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return check(false, message, `Missing ${relativePath}.`)
  }
  const content = readFileSync(absolutePath, 'utf8')
  return check(pattern.test(content), message, `${relativePath} did not match ${pattern}.`)
}

function packageScript(message, scriptName, expected) {
  const scripts = rootPackage.scripts ?? {}
  return check(scripts[scriptName] === expected, message, `package.json scripts.${scriptName} is ${JSON.stringify(scripts[scriptName])}, expected ${JSON.stringify(expected)}.`)
}

function npmVersionAtLeast(packageManager, major, minor, patch) {
  const match = /^npm@(\d+)\.(\d+)\.(\d+)$/.exec(packageManager ?? '')
  if (!match) return false
  const version = match.slice(1).map(Number)
  const floor = [major, minor, patch]
  for (let index = 0; index < floor.length; index += 1) {
    if (version[index] > floor[index]) return true
    if (version[index] < floor[index]) return false
  }
  return true
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}

function check(ok, message, detail) {
  return { ok, message, detail }
}
