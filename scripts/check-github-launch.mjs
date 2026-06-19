#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const requiredTopics = [
  'agent-memory',
  'mcp',
  'model-context-protocol',
  'llm',
  'long-term-memory',
  'temporal-memory',
  'memory-graph',
  'coding-agents',
  'typescript',
  'local-first',
  'knowledge-graph',
]

const checks = [
  fileContains('GitHub launch playbook exists', 'docs/github-launch.md', /# Mnemic GitHub Launch Playbook/),
  fileContains('playbook has current review date', 'docs/github-launch.md', /Last updated: 2026-06-18/),
  fileContains('playbook has repository description', 'docs/github-launch.md', /Local-first memory kernel for coding agents/),
  fileContains('playbook has target repository URL', 'docs/github-launch.md', /https:\/\/github\.com\/dongtang3\/mnemic/),
  fileContains('playbook has HN draft', 'docs/github-launch.md', /Show HN: Mnemic/),
  fileContains('playbook has social draft', 'docs/github-launch.md', /## Social Draft/),
  fileContains('playbook has no-claim guardrails', 'docs/github-launch.md', /## Do Not Claim[\s\S]*LoCoMo[\s\S]*LongMemEval[\s\S]*BEAM[\s\S]*LongMemEval-V2[\s\S]*MemGym/),
  fileContains('playbook includes demo command', 'docs/github-launch.md', /npm run demo/),
  fileContains('playbook includes docs check', 'docs/github-launch.md', /npm run docs:check/),
  fileContains('playbook includes rewrite check', 'docs/github-launch.md', /npm run rewrite:check/),
  fileContains('playbook includes completion check', 'docs/github-launch.md', /npm run completion:check/),
  fileContains('playbook includes full fresh clone check', 'docs/github-launch.md', /npm run fresh:check -- --full/),
  fileContains('playbook includes repository check', 'docs/github-launch.md', /npm run repository:check/),
  fileContains('playbook includes public check', 'docs/github-launch.md', /npm run public:check/),
  fileContains('playbook includes supply check', 'docs/github-launch.md', /npm run supply:check/),
  fileContains('playbook includes community check', 'docs/github-launch.md', /npm run community:check/),
  fileContains('playbook includes security check', 'docs/github-launch.md', /npm run security:check/),
  fileContains('playbook includes benchmark command', 'docs/github-launch.md', /npm run benchmark/),
  fileContains('playbook includes CI smoke command', 'docs/github-launch.md', /npm run ci:smoke/),
  fileContains('README links GitHub launch playbook', 'README.md', /docs\/github-launch\.md/),
  fileContains('release checklist includes GitHub launch check', 'docs/release-checklist.md', /npm run github:launch:check/),
  fileContains('release checklist includes docs check', 'docs/release-checklist.md', /npm run docs:check/),
  fileContains('release checklist includes repository check', 'docs/release-checklist.md', /npm run repository:check/),
  fileContains('release checklist includes public check', 'docs/release-checklist.md', /npm run public:check/),
  fileContains('release checklist includes supply check', 'docs/release-checklist.md', /npm run supply:check/),
  fileContains('release checklist includes community check', 'docs/release-checklist.md', /npm run community:check/),
  fileContains('release checklist includes security check', 'docs/release-checklist.md', /npm run security:check/),
  fileContains('release notes include GitHub launch check', 'docs/releases/v0.1.0.md', /npm run github:launch:check/),
  fileContains('release notes include docs check', 'docs/releases/v0.1.0.md', /npm run docs:check/),
  fileContains('release notes include public check', 'docs/releases/v0.1.0.md', /npm run public:check/),
  fileContains('release notes include supply check', 'docs/releases/v0.1.0.md', /npm run supply:check/),
]

for (const topic of requiredTopics) {
  checks.push(fileContains(`playbook topic ${topic}`, 'docs/github-launch.md', new RegExp(`(^|\\n)${escapeRegExp(topic)}(\\n|$)`)))
  checks.push(jsonArrayIncludes(`package keyword ${topic}`, 'package.json', ['keywords'], topic))
}

let failures = 0
console.log('Mnemic GitHub Launch Check')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic GitHub launch check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic GitHub launch check passed.')

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
