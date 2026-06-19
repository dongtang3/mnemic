#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const workspacePackages = [
  ['mnemic-sdk', '@mnemic/sdk', ['src/index.ts', 'src/client.ts', 'src/types.ts']],
  ['mnemic-cli', '@mnemic/cli', ['src/index.ts', 'src/doctor.ts', 'src/eval.ts', 'src/init.ts']],
  ['mnemic-server', '@mnemic/server', ['src/server.ts', 'src/memoryService.ts', 'src/store.ts']],
  ['mcp-server', '@mnemic/memory-mcp', ['src/index.ts']],
  ['studio', 'studio', ['src/App.tsx', 'src/api.ts', 'src/types.ts']],
]

const retiredRootPaths = [
  'API',
  'analyze',
  'engine',
  'engineExample',
  'inMemoryCompute',
  'knowledgeManage',
  'supplier',
  'studio-backend',
  'pom.xml',
  'mvninstall',
]

const forbiddenActiveFiles = [
  '.java',
  '.scala',
  '.sbt',
  '.gradle',
]

const forbiddenActiveBasenames = new Set([
  'pom.xml',
  'build.gradle',
  'gradlew',
  'gradlew.bat',
])

const ignoredDirs = new Set([
  '.git',
  'node_modules',
  'target',
])
const removedDocsArchivePath = ['docs', 'legacy'].join('/')

const checks = [
  jsonFieldEquals('root package is Mnemic platform', 'package.json', ['name'], '@mnemic/platform'),
  jsonArrayEquals('root workspaces match TypeScript packages', 'package.json', ['workspaces'], workspacePackages.map(([dir]) => dir)),
  fileContains('README says active product path is TypeScript', 'README.md', /active product path is the TypeScript workspace/),
  fileContains('architecture says TypeScript-first', 'docs/agent-memory-architecture.md', /TypeScript-first memory substrate/),
  pathDoesNotExist('legacy source archive removed from public tree', 'legacy'),
  pathDoesNotExist('docs archive removed from public tree', removedDocsArchivePath),
]

for (const [dir, expectedName, requiredSources] of workspacePackages) {
  checks.push(fileExists(`workspace ${dir} package.json exists`, `${dir}/package.json`))
  checks.push(fileExists(`workspace ${dir} tsconfig exists`, `${dir}/tsconfig.json`))
  checks.push(jsonFieldEquals(`workspace ${dir} package name`, `${dir}/package.json`, ['name'], expectedName))
  for (const sourcePath of requiredSources) {
    checks.push(fileExists(`workspace ${dir} source ${sourcePath}`, `${dir}/${sourcePath}`))
  }
}

for (const retiredPath of retiredRootPaths) {
  checks.push(pathDoesNotExist(`retired active path removed: ${retiredPath}`, retiredPath))
}

checks.push(noForbiddenActiveRuntimeFiles())

let failures = 0
console.log('Mnemic TypeScript Rewrite Check')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic TypeScript rewrite check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic TypeScript rewrite check passed.')

function fileExists(name, relativePath) {
  return {
    ok: existsSync(join(rootDir, relativePath)),
    name,
    detail: `Missing ${relativePath}.`,
  }
}

function pathDoesNotExist(name, relativePath) {
  return {
    ok: !existsSync(join(rootDir, relativePath)),
    name,
    detail: `${relativePath} still exists in the active product tree.`,
  }
}

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

function jsonFieldEquals(name, relativePath, path, expected) {
  const read = readJson(relativePath)
  if (!read.ok) {
    return { ok: false, name, detail: read.detail }
  }
  let current = read.value
  for (const key of path) {
    current = current?.[key]
  }
  return {
    ok: current === expected,
    name,
    detail: `${relativePath}.${path.join('.')} expected ${JSON.stringify(expected)}, got ${JSON.stringify(current)}.`,
  }
}

function jsonArrayEquals(name, relativePath, path, expected) {
  const read = readJson(relativePath)
  if (!read.ok) {
    return { ok: false, name, detail: read.detail }
  }
  let current = read.value
  for (const key of path) {
    current = current?.[key]
  }
  const ok = Array.isArray(current)
    && current.length === expected.length
    && expected.every((value, index) => current[index] === value)
  return {
    ok,
    name,
    detail: `${relativePath}.${path.join('.')} expected ${JSON.stringify(expected)}, got ${JSON.stringify(current)}.`,
  }
}

function readJson(relativePath) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, detail: `Missing ${relativePath}.` }
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(absolutePath, 'utf8')) }
  } catch (error) {
    return { ok: false, detail: `${relativePath} is not valid JSON: ${error.message}` }
  }
}

function noForbiddenActiveRuntimeFiles() {
  const matches = []
  walk(rootDir, (absolutePath) => {
    const relativePath = relative(rootDir, absolutePath)
    const parts = relativePath.split('/')
    const basename = parts.at(-1) ?? ''
    if (forbiddenActiveBasenames.has(basename) || forbiddenActiveFiles.includes(extname(basename))) {
      matches.push(relativePath)
    }
  })

  return {
    ok: matches.length === 0,
    name: 'no Java, Scala, Maven, or Gradle runtime files in public tree',
    detail: matches.length > 0 ? matches.slice(0, 20).join(', ') : '',
  }
}

function walk(dir, visitFile) {
  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry)
    const relativePath = relative(rootDir, absolutePath)
    const topLevel = relativePath.split('/')[0]
    if (ignoredDirs.has(entry) && dir === rootDir) {
      continue
    }
    const stat = statSync(absolutePath)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'target') {
        continue
      }
      walk(absolutePath, visitFile)
      continue
    }
    if (stat.isFile()) {
      visitFile(absolutePath)
    }
  }
}
