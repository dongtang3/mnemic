#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const targetRepo = 'git+https://github.com/dongtang3/mnemic.git'
const targetIssues = 'https://github.com/dongtang3/mnemic/issues'
const targetHomepage = 'https://github.com/dongtang3/mnemic'

const packages = [
  {
    dir: 'mnemic-sdk',
    name: '@mnemic/sdk',
    requiredFiles: ['README.md', 'package.json', 'dist/index.js', 'dist/index.d.ts', 'dist/client.js', 'dist/client.d.ts', 'dist/types.d.ts'],
    forbiddenPrefixes: ['src/', 'test/', 'node_modules/', 'target/'],
  },
  {
    dir: 'mnemic-cli',
    name: '@mnemic/cli',
    requiredFiles: ['README.md', 'package.json', 'dist/index.js', 'dist/doctor.js', 'dist/eval.js', 'dist/init.js'],
    forbiddenPrefixes: ['src/', 'test/', 'node_modules/', 'target/'],
  },
  {
    dir: 'mnemic-server',
    name: '@mnemic/server',
    requiredFiles: ['README.md', 'package.json', 'dist/server.js', 'dist/memoryService.js', 'dist/store.js'],
    forbiddenPrefixes: ['src/', 'test/', 'node_modules/', 'target/'],
  },
  {
    dir: 'mcp-server',
    name: '@mnemic/memory-mcp',
    requiredFiles: ['README.md', 'package.json', 'dist/index.js'],
    forbiddenPrefixes: ['src/', 'test/', 'node_modules/', 'target/'],
  },
]

let failures = 0

for (const spec of packages) {
  const packageDir = join(rootDir, spec.dir)
  const packageJsonPath = join(packageDir, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const checks = []

  checks.push(check(packageJson.name === spec.name, `name is ${spec.name}`, `expected name ${spec.name}, got ${packageJson.name}`))
  checks.push(check(packageJson.version === '0.1.0', 'version is 0.1.0', `expected version 0.1.0, got ${packageJson.version}`))
  checks.push(check(packageJson.license === 'MIT', 'license is MIT', `expected MIT license, got ${packageJson.license || '(missing)'}`))
  checks.push(check(Boolean(packageJson.description), 'description is present', 'missing description'))
  checks.push(check(Array.isArray(packageJson.keywords) && packageJson.keywords.length > 0, 'keywords are present', 'missing keywords'))
  checks.push(check(packageJson.repository?.url === targetRepo, 'repository points to Mnemic target', `expected ${targetRepo}, got ${packageJson.repository?.url || '(missing)'}`))
  checks.push(check(packageJson.repository?.directory === spec.dir, `repository directory is ${spec.dir}`, `expected ${spec.dir}, got ${packageJson.repository?.directory || '(missing)'}`))
  checks.push(check(packageJson.bugs?.url === targetIssues, 'bugs URL points to Mnemic issues', `expected ${targetIssues}, got ${packageJson.bugs?.url || '(missing)'}`))
  checks.push(check(typeof packageJson.homepage === 'string' && packageJson.homepage.startsWith(targetHomepage), 'homepage points to Mnemic target', `expected ${targetHomepage}..., got ${packageJson.homepage || '(missing)'}`))
  checks.push(check(packageJson.engines?.node === '>=20', 'Node engine is >=20', `expected engines.node >=20, got ${packageJson.engines?.node || '(missing)'}`))
  checks.push(check(packageJson.private === true, 'private remains true before npm scope confirmation', 'private should remain true until npm scope ownership is confirmed'))

  for (const file of spec.requiredFiles) {
    checks.push(check(existsSync(join(packageDir, file)), `${file} exists`, `missing ${file}`))
  }

  const pack = runPack(packageDir)
  checks.push(check(pack.name === spec.name, `pack name is ${spec.name}`, `pack name mismatch: ${pack.name}`))
  const packFiles = new Set(pack.files.map((file) => file.path))
  for (const file of spec.requiredFiles) {
    checks.push(check(packFiles.has(file), `pack includes ${file}`, `pack missing ${file}`))
  }
  for (const prefix of spec.forbiddenPrefixes) {
    const forbidden = [...packFiles].filter((file) => file.startsWith(prefix))
    checks.push(check(forbidden.length === 0, `pack excludes ${prefix}`, `pack includes forbidden files: ${forbidden.join(', ')}`))
  }

  const failed = checks.filter((item) => !item.ok)
  failures += failed.length

  console.log(`\n${spec.name}`)
  console.log(`  package: ${spec.dir}`)
  console.log(`  pack: ${pack.filename} (${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked)`)
  console.log(`  private: ${packageJson.private === true ? 'true (publish blocked until scope confirmed)' : String(packageJson.private)}`)
  for (const item of checks) {
    console.log(`  ${item.ok ? 'PASS' : 'FAIL'} ${item.message}`)
    if (!item.ok) console.log(`       ${item.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic package readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic package readiness passed.')

function runPack(packageDir) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(output)
  if (!Array.isArray(parsed) || !parsed[0]) {
    throw new Error(`npm pack returned unexpected output for ${packageDir}`)
  }
  return parsed[0]
}

function check(ok, message, detail) {
  return { ok, message, detail }
}
