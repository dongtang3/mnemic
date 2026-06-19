#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const oldBrandPattern = new RegExp(['\\bD' + '3A\\b', '\\bd' + '3a\\b', 'd' + '3a_'].join('|'))

const checks = [
  fileContains('roadmap has 2026 market read', 'docs/mnemic-2026-roadmap.md', /## Market Read[\s\S]*Last checked: 2026-06-18/),
  fileContains('roadmap tracks GitHub Copilot memory', 'docs/mnemic-2026-roadmap.md', /github\.blog\/changelog\/2026-01-15-agentic-memory-for-github-copilot-is-in-public-preview/),
  fileContains('roadmap tracks MCP distribution', 'docs/mnemic-2026-roadmap.md', /modelcontextprotocol\.io\/examples/),
  fileContains('roadmap tracks OpenAI Agents sessions', 'docs/mnemic-2026-roadmap.md', /openai\.github\.io\/openai-agents-python\/sessions/),
  fileContains('roadmap tracks LangGraph long-term memory', 'docs/mnemic-2026-roadmap.md', /docs\.langchain\.com\/oss\/python\/concepts\/memory/),
  fileContains('roadmap tracks temporal graph memory', 'docs/mnemic-2026-roadmap.md', /github\.com\/getzep\/graphiti/),
  fileContains('roadmap tracks Mem0 2026 memory landscape', 'docs/mnemic-2026-roadmap.md', /mem0\.ai\/blog\/state-of-ai-agent-memory-2026/),
  fileContains('roadmap tracks LongMemEval-V2', 'docs/mnemic-2026-roadmap.md', /arxiv\.org\/abs\/2605\.12493/),
  fileContains('roadmap tracks MemGym', 'docs/mnemic-2026-roadmap.md', /arxiv\.org\/html\/2605\.20833v1/),
  fileContains('roadmap tracks AMemGym', 'docs/mnemic-2026-roadmap.md', /arxiv\.org\/abs\/2603\.01966/),
  fileContains('README states 2026 agent-memory direction', 'README.md', /2026 agent-memory stack/),
  fileContains('README positions Mnemic as local-first memory kernel', 'README.md', /local-first memory kernel for coding agents/),
  fileContains('README links usage docs', 'README.md', /docs\/usage\.md/),
  fileContains('package metadata uses Mnemic package name', 'package.json', /"name": "@mnemic\/platform"/),
  fileContains('package metadata includes memory graph keyword', 'package.json', /"memory-graph"/),
  fileDoesNotContain('README no longer uses the old brand', 'README.md', oldBrandPattern),
  fileDoesNotContain('usage docs no longer use the old brand', 'docs/usage.md', oldBrandPattern),
  fileDoesNotContain('SDK package README no longer uses the old brand', 'mnemic-sdk/README.md', oldBrandPattern),
  fileDoesNotContain('CLI package README no longer uses the old brand', 'mnemic-cli/README.md', oldBrandPattern),
  fileDoesNotContain('server package README no longer uses the old brand', 'mnemic-server/README.md', oldBrandPattern),
  fileDoesNotContain('MCP package README no longer uses the old brand', 'mcp-server/README.md', oldBrandPattern),
]

let failures = 0
console.log('Mnemic Market Readiness')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic market readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic market readiness passed.')

function fileContains(name, relativePath, pattern) {
  const content = readText(relativePath)
  if (!content.ok) {
    return { ok: false, name, detail: content.detail }
  }
  return {
    ok: pattern.test(content.value),
    name,
    detail: `${relativePath} did not match ${pattern}.`,
  }
}

function fileDoesNotContain(name, relativePath, pattern) {
  const content = readText(relativePath)
  if (!content.ok) {
    return { ok: false, name, detail: content.detail }
  }
  return {
    ok: !pattern.test(content.value),
    name,
    detail: `${relativePath} still matched ${pattern}.`,
  }
}

function readText(relativePath) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return { ok: false, detail: `Missing ${relativePath}.` }
  }
  return { ok: true, value: readFileSync(absolutePath, 'utf8') }
}
