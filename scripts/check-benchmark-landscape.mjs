#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

const checks = [
  fileContains('benchmark landscape doc exists', 'docs/benchmark-landscape.md', /# Mnemic Benchmark Landscape/),
  fileContains('landscape includes local benchmark command', 'docs/benchmark-landscape.md', /npm run benchmark/),
  fileContains('landscape includes current local result', 'docs/benchmark-landscape.md', /recall@5 1\.00/),
  fileContains('landscape includes LoCoMo', 'docs/benchmark-landscape.md', /LoCoMo/),
  fileContains('landscape includes LongMemEval', 'docs/benchmark-landscape.md', /LongMemEval/),
  fileContains('landscape includes LongMemEval-V2', 'docs/benchmark-landscape.md', /LongMemEval-V2/),
  fileContains('landscape includes BEAM', 'docs/benchmark-landscape.md', /BEAM/),
  fileContains('landscape includes MemGym', 'docs/benchmark-landscape.md', /MemGym/),
  fileContains('landscape marks external scores as not claimed', 'docs/benchmark-landscape.md', /not claimed/),
  fileContains('landscape links Mem0 state source', 'docs/benchmark-landscape.md', /mem0\.ai\/blog\/state-of-ai-agent-memory-2026/),
  fileContains('landscape links memory-benchmarks repo', 'docs/benchmark-landscape.md', /github\.com\/mem0ai\/memory-benchmarks/),
  fileContains('landscape links LongMemEval-V2 paper', 'docs/benchmark-landscape.md', /arxiv\.org\/abs\/2605\.12493/),
  fileContains('landscape links MemGym paper', 'docs/benchmark-landscape.md', /arxiv\.org\/abs\/2605\.20833/),
  fileContains('baseline scope rejects external score claims', 'docs/benchmark-baseline.md', /not a claim against LoCoMo, LongMemEval, LongMemEval-V2, BEAM, or MemGym/),
  fileContains('README links benchmark landscape', 'README.md', /docs\/benchmark-landscape\.md/),
  fileContains('release checklist includes benchmark landscape check', 'docs/release-checklist.md', /npm run benchmark:landscape:check/),
]

let failures = 0
console.log('Mnemic Benchmark Landscape Check')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic benchmark landscape check failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic benchmark landscape check passed.')

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
