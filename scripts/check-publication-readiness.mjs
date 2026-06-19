#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const args = new Set(process.argv.slice(2))
const strict = args.has('--strict')
const targetOwner = 'dongtang3'
const targetRepo = 'mnemic'
const targetHttps = `https://github.com/${targetOwner}/${targetRepo}`
const targetGit = `git+${targetHttps}.git`
const targetSsh = `git@github.com:${targetOwner}/${targetRepo}.git`
const launchDescription = 'Local-first memory kernel for coding agents: MCP-native, temporal, auditable, source-keyed, and benchmarked.'
const launchTopics = [
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
  localFile('publication readiness check exists', 'scripts/check-publication-readiness.mjs', /Mnemic Public Launch Readiness/),
  packageScript('package exposes public check', 'public:check', 'node scripts/check-publication-readiness.mjs'),
  packageScript('package exposes docs check', 'docs:check', 'node scripts/check-docs-integrity.mjs'),
  packageScript('package exposes supply check', 'supply:check', 'node scripts/check-supply-chain.mjs'),
  localFile('README includes public check gate', 'README.md', /npm run public:check/),
  localFile('README includes docs check gate', 'README.md', /npm run docs:check/),
  localFile('README includes supply check gate', 'README.md', /npm run supply:check/),
  localFile('GitHub launch playbook includes public check gate', 'docs/github-launch.md', /npm run public:check/),
  localFile('GitHub launch playbook includes docs check gate', 'docs/github-launch.md', /npm run docs:check/),
  localFile('GitHub launch playbook includes supply check gate', 'docs/github-launch.md', /npm run supply:check/),
  localFile('release checklist includes public check gate', 'docs/release-checklist.md', /npm run public:check/),
  localFile('release checklist includes docs check gate', 'docs/release-checklist.md', /npm run docs:check/),
  localFile('release checklist includes supply check gate', 'docs/release-checklist.md', /npm run supply:check/),
  localFile('release notes include public check gate', 'docs/releases/v0.1.0.md', /npm run public:check/),
  localFile('release notes include docs check gate', 'docs/releases/v0.1.0.md', /npm run docs:check/),
  localFile('release notes include supply check gate', 'docs/releases/v0.1.0.md', /npm run supply:check/),
  localFile('docs integrity check exists', 'scripts/check-docs-integrity.mjs', /Mnemic Docs Integrity/),
  localFile('supply-chain readiness check exists', 'scripts/check-supply-chain.mjs', /Mnemic Supply-Chain Readiness/),
  localFile('CI smoke runs public check', 'scripts/ci-smoke.sh', /check-publication-readiness\.mjs/),
  localFile('CI smoke runs docs check', 'scripts/ci-smoke.sh', /check-docs-integrity\.mjs/),
  localFile('CI smoke runs supply check', 'scripts/ci-smoke.sh', /check-supply-chain\.mjs/),
  localFile('fresh clone runs public check', 'scripts/check-fresh-clone.mjs', /public:check/),
  localFile('fresh clone runs docs check', 'scripts/check-fresh-clone.mjs', /docs:check/),
  localFile('fresh clone runs supply check', 'scripts/check-fresh-clone.mjs', /supply:check/),
  localFile('CI workflow exists', '.github/workflows/ci.yml', /npm run ci:smoke/),
  localFile('CodeQL workflow exists', '.github/workflows/codeql.yml', /github\/codeql-action\/init@v4/),
  packageMetadata('root package repository points to target repo', 'package.json'),
]

checks.push(...publicationStateChecks())

let failures = 0
let pending = 0
console.log('Mnemic Public Launch Readiness')
console.log(`mode: ${strict ? 'strict' : 'advisory'}`)

for (const item of checks) {
  const label = item.ok ? 'PASS' : item.level === 'info' ? 'INFO' : 'FAIL'
  console.log(`${label} ${item.message}`)
  if (!item.ok && item.detail) {
    console.log(`     ${item.detail}`)
  }
  if (!item.ok && item.level === 'info') {
    pending += 1
  }
  if (!item.ok && item.level !== 'info') {
    failures += 1
  }
}

if (failures > 0) {
  console.error(`\nMnemic public launch readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

const suffix = pending > 0 && !strict ? ` with ${pending} pending external item(s)` : ''
console.log(`\nMnemic public launch readiness passed${suffix}.`)
if (pending > 0 && !strict) {
  console.log('Run `node scripts/check-publication-readiness.mjs --strict` after the GitHub repository is renamed, pushed, and Actions have run.')
}

function publicationStateChecks() {
  const checks = []
  const origin = git(['remote', 'get-url', 'origin'])
  const normalizedOrigin = normalizeRemote(origin)
  const targetOrigins = new Set([`${targetHttps}.git`, targetSsh, targetHttps])
  checks.push(publicationCheck(
    targetOrigins.has(normalizedOrigin),
    'git origin points to the public Mnemic target',
    origin
      ? `origin=${origin}; expected ${targetSsh} or ${targetHttps}.git.`
      : 'No git origin is configured.',
  ))

  const status = gitResult(['status', '--porcelain'])
  if (status.ok) {
    const dirtyLines = status.output ? status.output.split('\n').filter(Boolean) : []
    checks.push(publicationCheck(
      dirtyLines.length === 0,
      'git worktree is clean for publication',
      `${dirtyLines.length} changed path(s) are present; stage/commit intentionally before public launch.`,
    ))
  } else {
    checks.push(publicationCheck(false, 'git worktree is clean for publication', 'Unable to inspect git status; this is expected in copied fresh-clone fixtures without .git.'))
  }

  const head = gitResult(['rev-parse', '--verify', 'HEAD'])
  checks.push(publicationCheck(head.ok && Boolean(head.output), 'git HEAD exists for publication', 'No committed HEAD was found.'))

  if (strict) {
    const reachable = git(['ls-remote', '--heads', `${targetHttps}.git`], 12_000)
    checks.push(publicationCheck(
      Boolean(reachable),
      'target GitHub repository is reachable',
      `Could not read ${targetHttps}.git. Create or rename the repo and confirm network/auth access.`,
    ))
    checks.push(...repositoryMetadataChecks())
    checks.push(...hostedActionChecks())
  } else {
    checks.push(info('target GitHub repository reachability not checked', `Run strict mode after ${targetHttps} exists.`))
    checks.push(info('GitHub repository metadata not checked', 'Run strict mode after setting the repository About description and topics.'))
    checks.push(info('hosted GitHub Actions and CodeQL not checked', 'Run strict mode with GitHub CLI authenticated after pushing the release branch.'))
  }

  const packages = [
    ['mnemic-sdk', '@mnemic/sdk'],
    ['mnemic-cli', '@mnemic/cli'],
    ['mnemic-server', '@mnemic/server'],
    ['mcp-server', '@mnemic/memory-mcp'],
  ]
  const privatePackages = packages.filter(([dir]) => readJson(`${dir}/package.json`).private === true)
  checks.push(info(
    'npm package publication remains gated',
    `${privatePackages.length}/${packages.length} packages are still private until npm scope ownership and registry ranges are reviewed.`,
  ))

  return checks
}

function hostedActionChecks() {
  if (!commandExists('gh')) {
    return [
      publicationCheck(false, 'hosted GitHub Actions status is verified', 'GitHub CLI `gh` is not installed or not on PATH.'),
      publicationCheck(false, 'hosted CodeQL status is verified', 'GitHub CLI `gh` is required to inspect the remote CodeQL workflow run.'),
    ]
  }

  const output = runCommand('gh', ['run', 'list', '--repo', `${targetOwner}/${targetRepo}`, '--limit', '30', '--json', 'conclusion,status,workflowName,name,headBranch'], 15_000)
  if (!output) {
    return [
      publicationCheck(false, 'hosted GitHub Actions status is verified', 'Could not read GitHub Actions runs with `gh run list`.'),
      publicationCheck(false, 'hosted CodeQL status is verified', 'Could not read hosted CodeQL runs with `gh run list`.'),
    ]
  }

  let runs = []
  try {
    runs = JSON.parse(output)
  } catch {
    return [
      publicationCheck(false, 'hosted GitHub Actions status is verified', '`gh run list` did not return parseable JSON.'),
      publicationCheck(false, 'hosted CodeQL status is verified', '`gh run list` did not return parseable JSON.'),
    ]
  }

  const successfulCi = runs.find((run) => run.conclusion === 'success' && /ci/i.test(`${run.workflowName ?? ''} ${run.name ?? ''}`))
  const successfulCodeql = runs.find((run) => run.conclusion === 'success' && /codeql/i.test(`${run.workflowName ?? ''} ${run.name ?? ''}`))
  return [
    publicationCheck(Boolean(successfulCi), 'hosted GitHub Actions status is verified', 'No successful hosted CI run was found for the target repository.'),
    publicationCheck(Boolean(successfulCodeql), 'hosted CodeQL status is verified', 'No successful hosted CodeQL run was found for the target repository.'),
  ]
}

function repositoryMetadataChecks() {
  if (!commandExists('gh')) {
    return [
      publicationCheck(false, 'GitHub repository About description is verified', 'GitHub CLI `gh` is not installed or not on PATH.'),
      publicationCheck(false, 'GitHub repository topics are verified', 'GitHub CLI `gh` is required to inspect repository topics.'),
    ]
  }

  const output = runCommand(
    'gh',
    ['repo', 'view', `${targetOwner}/${targetRepo}`, '--json', 'defaultBranchRef,description,isPrivate,repositoryTopics'],
    15_000,
  )
  if (!output) {
    return [
      publicationCheck(false, 'GitHub repository visibility is verified', `Could not read ${targetOwner}/${targetRepo} with \`gh repo view\`.`),
      publicationCheck(false, 'GitHub repository default branch is verified', `Could not read ${targetOwner}/${targetRepo} with \`gh repo view\`.`),
      publicationCheck(false, 'GitHub repository About description is verified', `Could not read ${targetOwner}/${targetRepo} with \`gh repo view\`.`),
      publicationCheck(false, 'GitHub repository topics are verified', `Could not read ${targetOwner}/${targetRepo} with \`gh repo view\`.`),
    ]
  }

  let repo = {}
  try {
    repo = JSON.parse(output)
  } catch {
    return [
      publicationCheck(false, 'GitHub repository visibility is verified', '`gh repo view` did not return parseable JSON.'),
      publicationCheck(false, 'GitHub repository default branch is verified', '`gh repo view` did not return parseable JSON.'),
      publicationCheck(false, 'GitHub repository About description is verified', '`gh repo view` did not return parseable JSON.'),
      publicationCheck(false, 'GitHub repository topics are verified', '`gh repo view` did not return parseable JSON.'),
    ]
  }

  const topicNames = new Set((repo.repositoryTopics ?? []).map((topic) => topic.name))
  const missingTopics = launchTopics.filter((topic) => !topicNames.has(topic))
  return [
    publicationCheck(repo.isPrivate === false, 'GitHub repository visibility is verified', 'Repository should be public before public launch.'),
    publicationCheck(repo.defaultBranchRef?.name === 'main', 'GitHub repository default branch is verified', `Default branch is ${JSON.stringify(repo.defaultBranchRef?.name)}, expected "main".`),
    publicationCheck(repo.description === launchDescription, 'GitHub repository About description is verified', `Description is ${JSON.stringify(repo.description)}, expected ${JSON.stringify(launchDescription)}.`),
    publicationCheck(missingTopics.length === 0, 'GitHub repository topics are verified', `Missing topic(s): ${missingTopics.join(', ') || 'none'}.`),
  ]
}

function localFile(message, relativePath, pattern) {
  const absolutePath = join(rootDir, relativePath)
  if (!existsSync(absolutePath)) {
    return fail(message, `Missing ${relativePath}.`)
  }
  const content = readFileSync(absolutePath, 'utf8')
  return {
    ok: pattern.test(content),
    message,
    detail: `${relativePath} did not match ${pattern}.`,
    level: 'fail',
  }
}

function packageScript(message, scriptName, expected) {
  const scripts = readJson('package.json').scripts ?? {}
  return {
    ok: scripts[scriptName] === expected,
    message,
    detail: `package.json scripts.${scriptName} is ${JSON.stringify(scripts[scriptName])}, expected ${JSON.stringify(expected)}.`,
    level: 'fail',
  }
}

function packageMetadata(message, relativePath) {
  const packageJson = readJson(relativePath)
  return {
    ok: packageJson.repository?.url === targetGit && packageJson.bugs?.url === `${targetHttps}/issues`,
    message,
    detail: `${relativePath} should point repository and bugs metadata at ${targetHttps}.`,
    level: 'fail',
  }
}

function publicationCheck(ok, message, detail) {
  return { ok, message, detail, level: strict ? 'fail' : 'info' }
}

function info(message, detail) {
  return { ok: false, message, detail, level: 'info' }
}

function fail(message, detail) {
  return { ok: false, message, detail, level: 'fail' }
}

function git(args, timeout = 5_000) {
  return runCommand('git', args, timeout, rootDir)
}

function gitResult(args, timeout = 5_000) {
  return runCommandResult('git', args, timeout, rootDir)
}

function commandExists(command) {
  return Boolean(runCommand('which', [command], 2_000))
}

function runCommand(command, args, timeout = 5_000, cwd = rootDir) {
  const result = runCommandResult(command, args, timeout, cwd)
  return result.ok ? result.output : ''
}

function runCommandResult(command, args, timeout = 5_000, cwd = rootDir) {
  try {
    const output = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    }).trim()
    return { ok: true, output }
  } catch {
    return { ok: false, output: '' }
  }
}

function normalizeRemote(remote) {
  return remote.replace(/^git\+/, '').replace(/\/$/, '')
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}
