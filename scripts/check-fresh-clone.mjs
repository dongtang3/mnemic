#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const args = new Set(process.argv.slice(2))
const full = args.has('--full')
const keep = args.has('--keep')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const rootFiles = [
  '.dockerignore',
  '.env.mnemic.example',
  '.gitignore',
  '.mcp.json',
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'SUPPORT.md',
  'docker-compose.agent-memory.yml',
  'package-lock.json',
  'package.json',
]

const rootDirs = [
  '.github',
  '.mnemic',
  'docs',
  'examples',
  'mcp-server',
  'mnemic-cli',
  'mnemic-sdk',
  'mnemic-server',
  'scripts',
  'studio',
]

const excludedNames = new Set([
  '.git',
  '.vite',
  'dist',
  'dist-ssr',
  'node_modules',
  'target',
])

const excludedRelativePaths = new Set([
  '.env.mnemic',
  '.mnemic/policy.json',
  'AGENTS.mnemic.md',
])

const tempRoot = join(tmpdir(), `mnemic-fresh-clone-${process.pid}-${Date.now()}`)
mkdirSync(tempRoot, { recursive: true })

try {
  copySourceTree(tempRoot)

  const standardCommands = [
    [npmBin, ['install']],
    [npmBin, ['run', 'init', '--', '--force']],
    [npmBin, ['run', 'docs:check']],
    [npmBin, ['run', 'rewrite:check']],
    [npmBin, ['run', 'completion:check']],
    [npmBin, ['run', 'repository:check']],
    [npmBin, ['run', 'public:check']],
    [npmBin, ['run', 'supply:check']],
    [npmBin, ['run', 'community:check']],
    [npmBin, ['run', 'security:check']],
    [npmBin, ['run', 'build']],
    [npmBin, ['test']],
    [npmBin, ['run', 'launch:check']],
    [npmBin, ['run', 'github:launch:check']],
    [npmBin, ['run', 'market:check']],
    [npmBin, ['run', 'openapi:check']],
    [npmBin, ['run', 'release:check']],
  ]

  const fullCommands = [
    [npmBin, ['run', 'demo']],
    [npmBin, ['run', 'benchmark']],
    [npmBin, ['run', 'package:check']],
  ]

  console.log('Mnemic Fresh Clone Check')
  console.log(`source: ${rootDir}`)
  console.log(`clone: ${tempRoot}`)
  console.log(`mode: ${full ? 'full' : 'standard'}`)
  console.log('')

  for (const [command, commandArgs] of full ? [...standardCommands, ...fullCommands] : standardCommands) {
    run(command, commandArgs, tempRoot)
  }

  console.log('\nMnemic fresh clone check passed.')
} finally {
  if (keep) {
    console.log(`\nFresh clone kept at ${tempRoot}`)
  } else {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

function copySourceTree(destinationRoot) {
  for (const file of rootFiles) {
    const source = join(rootDir, file)
    if (existsSync(source)) {
      cpSync(source, join(destinationRoot, file), { recursive: false })
    }
  }

  for (const dir of rootDirs) {
    const source = join(rootDir, dir)
    if (existsSync(source)) {
      copyDir(source, join(destinationRoot, dir))
    }
  }
}

function copyDir(sourceDir, destinationDir) {
  mkdirSync(destinationDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry)
    const relativePath = relative(rootDir, sourcePath)
    if (excludedNames.has(entry) || excludedRelativePaths.has(relativePath)) {
      continue
    }

    const destinationPath = join(destinationDir, entry)
    const stat = statSync(sourcePath)
    if (stat.isDirectory()) {
      copyDir(sourcePath, destinationPath)
    } else if (stat.isFile()) {
      cpSync(sourcePath, destinationPath)
    }
  }
}

function run(command, commandArgs, cwd) {
  console.log(`==> ${[command, ...commandArgs].join(' ')}`)
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: process.env.CI ?? '1',
    },
  })

  if (result.status !== 0) {
    throw new Error(`${[command, ...commandArgs].join(' ')} failed with exit code ${result.status ?? 'unknown'}`)
  }
}
