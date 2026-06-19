#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const rootPackage = readJson('package.json')
const ignoredDirs = new Set(['.git', 'dist', 'node_modules', 'target'])
const roots = [
  '.github',
  'docs',
  'examples',
  'mcp-server/README.md',
  'mnemic-cli/README.md',
  'mnemic-sdk/README.md',
  'mnemic-server/README.md',
  'studio/README.md',
  'README.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
]

const requiredDocsMapLinks = [
  'docs/usage.md',
  'docs/agent-memory-architecture.md',
  'docs/mnemic-2026-roadmap.md',
  'docs/benchmark-landscape.md',
  'docs/local-readiness.md',
  'docs/docker-quickstart.md',
  'docs/github-actions.md',
  'docs/github-launch.md',
  'docs/security-hardening.md',
  'docs/supply-chain.md',
  'docs/repository-migration.md',
  'docs/completion-audit.md',
  'docs/release-checklist.md',
  'docs/npm-publishing.md',
  'docs/releases/v0.1.0.md',
  'docs/openapi.json',
]

const markdownFiles = collectMarkdownFiles()
const checks = [
  check(markdownFiles.length > 0, 'markdown files discovered', 'No markdown files were discovered for docs integrity checks.'),
  packageScript('package exposes docs check', 'docs:check', 'node scripts/check-docs-integrity.mjs'),
  fileContains('README includes docs check gate', 'README.md', /npm run docs:check/),
  fileContains('GitHub launch playbook includes docs check', 'docs/github-launch.md', /npm run docs:check/),
  fileContains('release checklist includes docs check', 'docs/release-checklist.md', /npm run docs:check/),
  fileContains('release notes include docs check', 'docs/releases/v0.1.0.md', /npm run docs:check/),
  fileContains('CI smoke runs docs check', 'scripts/ci-smoke.sh', /check-docs-integrity\.mjs/),
  fileContains('fresh clone runs docs check', 'scripts/check-fresh-clone.mjs', /docs:check/),
  ...checkRequiredDocsMapLinks(),
  ...checkMarkdownLinks(markdownFiles),
]

let failures = 0
console.log('Mnemic Docs Integrity')
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
  if (!item.ok) {
    failures += 1
    console.log(`     ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic docs integrity failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log(`\nMnemic docs integrity passed: ${markdownFiles.length} markdown file(s) checked.`)

function collectMarkdownFiles() {
  const files = []
  for (const root of roots) {
    const absolutePath = join(rootDir, root)
    if (!existsSync(absolutePath)) continue
    if (statSync(absolutePath).isDirectory()) {
      walk(absolutePath, files)
    } else if (extname(absolutePath).toLowerCase() === '.md') {
      files.push(absolutePath)
    }
  }
  return [...new Set(files)].sort()
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue
    const absolutePath = join(dir, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      walk(absolutePath, files)
    } else if (stats.isFile() && extname(entry).toLowerCase() === '.md') {
      files.push(absolutePath)
    }
  }
}

function checkRequiredDocsMapLinks() {
  const readme = readFileSync(join(rootDir, 'README.md'), 'utf8')
  return requiredDocsMapLinks.map((link) => check(
    readme.includes(`(${link})`),
    `README docs map links ${link}`,
    `README.md does not link to ${link}.`,
  ))
}

function packageScript(message, scriptName, expected) {
  const scripts = rootPackage.scripts ?? {}
  return check(scripts[scriptName] === expected, message, `package.json scripts.${scriptName} is ${JSON.stringify(scripts[scriptName])}, expected ${JSON.stringify(expected)}.`)
}

function fileContains(message, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return check(false, message, `Missing ${relativePath}.`)
  }
  const content = readFileSync(absolutePath, 'utf8')
  return check(pattern.test(content), message, `${relativePath} did not match ${pattern}.`)
}

function checkMarkdownLinks(files) {
  const checks = []
  for (const file of files) {
    const content = stripFencedCode(readFileSync(file, 'utf8'))
    const links = extractMarkdownLinks(content)
    const seen = new Set()
    for (const rawHref of links) {
      const href = rawHref.trim()
      if (!href || seen.has(href) || shouldSkipHref(href)) continue
      seen.add(href)

      const cleaned = stripOptionalTitle(href)
      const withoutFragment = cleaned.split('#')[0]
      const withoutQuery = withoutFragment.split('?')[0]
      if (!withoutQuery) continue

      const decoded = safeDecode(withoutQuery)
      const targetPath = decoded.startsWith('/')
        ? join(rootDir, decoded.slice(1))
        : resolve(dirname(file), decoded)

      const normalizedTarget = normalize(targetPath)
      const relativeTarget = relative(rootDir, normalizedTarget)
      const displayFile = relative(rootDir, file)
      checks.push(check(
        !relativeTarget.startsWith('..') && !relativeTarget.startsWith('/'),
        `${displayFile} link stays inside repository: ${cleaned}`,
        `${cleaned} resolves outside the repository.`,
      ))
      if (relativeTarget.startsWith('..') || relativeTarget.startsWith('/')) {
        continue
      }
      checks.push(check(
        existsSync(normalizedTarget),
        `${displayFile} link target exists: ${cleaned}`,
        `${cleaned} resolves to missing path ${relativeTarget}.`,
      ))
    }
  }
  return checks
}

function stripFencedCode(content) {
  return content.replace(/```[\s\S]*?```/g, '')
}

function extractMarkdownLinks(content) {
  const links = []
  const pattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g
  let match
  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1])
  }
  return links
}

function shouldSkipHref(href) {
  return /^(https?:|mailto:|tel:|#)/i.test(href)
}

function stripOptionalTitle(href) {
  const trimmed = href.trim()
  const titleMatch = /^([^"']+?)\s+["'][^"']+["']$/.exec(trimmed)
  return (titleMatch?.[1] ?? trimmed).trim()
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function check(ok, message, detail) {
  return { ok, message, detail }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}
