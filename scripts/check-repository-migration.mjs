#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const args = new Set(process.argv.slice(2))
const requireRenamedOrigin = args.has('--require-renamed-origin')
const targetOwner = 'dongtang3'
const targetRepo = 'mnemic'
const targetHttps = `https://github.com/${targetOwner}/${targetRepo}`
const targetGit = `git+${targetHttps}.git`
const oldBrand = ['d', '3', 'a'].join('')
const oldPlatform = `${oldBrand}_platform`
const oldUpstreamRepo = ['docg', '_platform'].join('')
const oldUpstreamOwner = ['wang', 'ying', 'chu'].join('')
const legacyPattern = new RegExp(`\\b${oldBrand}\\b|\\b${oldPlatform}\\b|github\\.com/${targetOwner}/${oldPlatform}|github\\.com/${oldUpstreamOwner}/${oldUpstreamRepo}`, 'i')
const scanIgnoredDirs = new Set(['.git', 'dist', 'node_modules', 'target'])
const scanExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.sh', '.ts', '.tsx', '.txt', '.yml', '.yaml'])

const packageSpecs = [
  ['package.json', undefined],
  ['mnemic-sdk/package.json', 'mnemic-sdk'],
  ['mnemic-cli/package.json', 'mnemic-cli'],
  ['mnemic-server/package.json', 'mnemic-server'],
  ['mcp-server/package.json', 'mcp-server'],
  ['studio/package.json', 'studio'],
]

const checks = [
  fileContains('repository identity doc exists', 'docs/repository-migration.md', /# Mnemic Repository Identity/),
  fileContains('identity doc records target repo', 'docs/repository-migration.md', /github\.com\/dongtang3\/mnemic/),
  fileContains('identity doc includes remote command', 'docs/repository-migration.md', /git remote set-url origin git@github\.com:dongtang3\/mnemic\.git/),
  fileContains('identity doc includes strict check', 'docs/repository-migration.md', /check-repository-migration\.mjs --require-renamed-origin/),
  fileContains('GitHub launch playbook uses target repo', 'docs/github-launch.md', /https:\/\/github\.com\/dongtang3\/mnemic/),
  publicTreeDoesNotContainOldIdentity(),
]

for (const [relativePath, directory] of packageSpecs) {
  const packageJson = readJson(relativePath)
  checks.push(check(packageJson.repository?.type === 'git', `${relativePath} repository type is git`, `got ${packageJson.repository?.type || '(missing)'}`))
  checks.push(check(packageJson.repository?.url === targetGit, `${relativePath} repository points to ${targetGit}`, `got ${packageJson.repository?.url || '(missing)'}`))
  if (directory) {
    checks.push(check(packageJson.repository?.directory === directory, `${relativePath} repository directory is ${directory}`, `got ${packageJson.repository?.directory || '(missing)'}`))
  }
  checks.push(check(packageJson.bugs?.url === `${targetHttps}/issues`, `${relativePath} bugs URL points to target issues`, `got ${packageJson.bugs?.url || '(missing)'}`))
  checks.push(check(typeof packageJson.homepage === 'string' && packageJson.homepage.startsWith(targetHttps), `${relativePath} homepage points to target repo`, `got ${packageJson.homepage || '(missing)'}`))
}

const origin = gitOrigin()
if (origin) {
  const normalized = normalizeRemote(origin)
  const targetRemotes = new Set([
    `${targetHttps}.git`,
    `git@github.com:${targetOwner}/${targetRepo}.git`,
    targetHttps,
  ])
  const originOk = targetRemotes.has(normalized)
  if (originOk) {
    checks.push(check(true, 'git origin has been renamed to Mnemic target', `origin=${origin}`))
  } else if (requireRenamedOrigin) {
    checks.push(check(false, 'git origin has been renamed to Mnemic target', `origin=${origin}; run git remote set-url origin git@github.com:${targetOwner}/${targetRepo}.git after the GitHub repo is renamed.`))
  } else {
    checks.push(check(false, 'git origin rename is still pending', `origin=${origin}; run git remote set-url origin git@github.com:${targetOwner}/${targetRepo}.git after the GitHub repo is renamed.`, 'info'))
  }
}

let failures = 0
console.log('Mnemic Repository Identity Check')
for (const item of checks) {
  const label = item.ok ? 'PASS' : item.level === 'info' ? 'INFO' : 'FAIL'
  console.log(`${label} ${item.message}`)
  if (!item.ok && item.level !== 'info') {
    failures += 1
    console.log(`     ${item.detail}`)
  } else if (!item.ok && item.level === 'info') {
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic repository identity check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic repository identity check passed.')

function publicTreeDoesNotContainOldIdentity() {
  const matches = []
  walkPublicTree(rootDir, (absolutePath) => {
    const content = readFileSync(absolutePath, 'utf8')
    if (legacyPattern.test(content)) {
      matches.push(relative(rootDir, absolutePath))
    }
  })

  return check(
    matches.length === 0,
    'public tree has no non-Mnemic repository identity',
    matches.length > 0 ? `Matched old identity in ${matches.slice(0, 20).join(', ')}` : '',
  )
}

function fileContains(message, relativePath, pattern) {
  const content = readText(relativePath)
  if (!content.ok) return check(false, message, content.detail)
  return check(pattern.test(content.value), message, `${relativePath} did not match ${pattern}.`)
}

function fileDoesNotContain(message, relativePath, pattern) {
  const content = readText(relativePath)
  if (!content.ok) return check(false, message, content.detail)
  return check(!pattern.test(content.value), message, `${relativePath} still matched ${pattern}.`)
}

function readText(relativePath) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, detail: `Missing ${relativePath}.` }
  }
  return { ok: true, value: readFileSync(absolutePath, 'utf8') }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}

function check(ok, message, detail, level = 'fail') {
  return { ok, message, detail, level }
}

function gitOrigin() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function normalizeRemote(remote) {
  return remote.replace(/^git\+/, '').replace(/\/$/, '')
}

function walkPublicTree(dir, visitFile) {
  for (const entry of readdirSync(dir)) {
    if (scanIgnoredDirs.has(entry)) continue
    const absolutePath = join(dir, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      walkPublicTree(absolutePath, visitFile)
      continue
    }
    if (!stats.isFile()) continue
    const extension = extname(entry).toLowerCase()
    if (!scanExtensions.has(extension)) continue
    visitFile(absolutePath)
  }
}
