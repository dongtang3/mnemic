#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const rawArgs = process.argv.slice(2)
const args = new Set(rawArgs)
const livePort = valueArg('--live-port') ?? process.env.MNEMIC_DOCKER_TEST_PORT ?? '49888'

const checks = [
  fileContains('compose file defines backend service', 'docker-compose.agent-memory.yml', /mnemic-memory-backend:/),
  fileContains('compose backend builds local Dockerfile', 'docker-compose.agent-memory.yml', /dockerfile:\s*mnemic-server\/Dockerfile\.agent-memory/),
  fileContains('compose backend exposes configurable 8088 port', 'docker-compose.agent-memory.yml', /MNEMIC_BACKEND_PORT:-8088/),
  fileContains('compose backend persists memory data', 'docker-compose.agent-memory.yml', /mnemic_memory_data:\/data/),
  fileContains('compose backend has healthcheck', 'docker-compose.agent-memory.yml', /healthcheck:[\s\S]*\/actuator\/health/),
  fileContains('compose Neo4j is optional profile', 'docker-compose.agent-memory.yml', /profiles:[\s\S]*graph-store/),
  fileContains('Dockerfile uses current Node runtime', 'mnemic-server/Dockerfile.agent-memory', /FROM node:24-alpine/),
  fileContains('Dockerfile builds server workspace', 'mnemic-server/Dockerfile.agent-memory', /npm --prefix mnemic-server run build/),
  fileContains('Dockerfile exposes backend port', 'mnemic-server/Dockerfile.agent-memory', /EXPOSE 8088/),
  fileContains('Dockerfile has runtime healthcheck', 'mnemic-server/Dockerfile.agent-memory', /HEALTHCHECK[\s\S]*\/actuator\/health/),
  fileContains('Dockerfile starts TypeScript backend', 'mnemic-server/Dockerfile.agent-memory', /CMD \["node", "mnemic-server\/dist\/server\.js"\]/),
  fileContains('start script uses compose backend path', 'scripts/start-agent-memory-stack.sh', /compose up -d --build mnemic-memory-backend/),
  fileContains('start script supports local non-Docker fallback', 'scripts/start-agent-memory-stack.sh', /MNEMIC_SKIP_DOCKER/),
  fileContains('stop script stops backend container', 'scripts/stop-agent-memory-stack.sh', /compose stop mnemic-memory-backend/),
  fileContains('Docker quickstart docs include compose up', 'docs/docker-quickstart.md', /docker compose -f docker-compose\.agent-memory\.yml up -d --build mnemic-memory-backend/),
  fileContains('Docker quickstart docs include health check', 'docs/docker-quickstart.md', /\/actuator\/health/),
  fileContains('Docker quickstart docs include live check', 'docs/docker-quickstart.md', /check-docker-readiness\.mjs --compose-config --live/),
  fileContains('Docker quickstart docs include stop command', 'docs/docker-quickstart.md', /docker compose -f docker-compose\.agent-memory\.yml stop mnemic-memory-backend/),
  fileContains('README links Docker quickstart', 'README.md', /docs\/docker-quickstart\.md/),
]

if (args.has('--compose-config')) {
  checks.push(checkComposeConfig())
}

if (args.has('--live')) {
  checks.push(checkDockerDaemon())
  checks.push(checkComposeLive(livePort))
}

let failures = 0
console.log('Mnemic Docker Readiness')
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`)
  if (!check.ok) {
    failures += 1
    console.log(`     ${check.detail}`)
  }
}

if (failures > 0) {
  console.error(`\nMnemic Docker readiness failed with ${failures} failure(s).`)
  process.exit(1)
}

console.log('\nMnemic Docker readiness passed.')

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

function checkComposeConfig() {
  const command = composeCommand()
  if (!command) {
    return {
      ok: false,
      name: 'docker compose config validates',
      detail: 'Docker Compose is not available.',
    }
  }

  try {
    execFileSync(command.bin, [...command.args, '-f', join(rootDir, 'docker-compose.agent-memory.yml'), 'config'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      ok: true,
      name: 'docker compose config validates',
      detail: '',
    }
  } catch (error) {
    return {
      ok: false,
      name: 'docker compose config validates',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

function checkDockerDaemon() {
  try {
    execFileSync('docker', ['info'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] })
    return {
      ok: true,
      name: 'docker daemon is reachable',
      detail: '',
    }
  } catch (error) {
    return {
      ok: false,
      name: 'docker daemon is reachable',
      detail: commandError(error),
    }
  }
}

function checkComposeLive(port) {
  const command = composeCommand()
  if (!command) {
    return {
      ok: false,
      name: 'docker compose live backend boots',
      detail: 'Docker Compose is not available.',
    }
  }

  const existingState = inspectContainerState('mnemic-memory-backend')
  if (existingState === 'running') {
    return {
      ok: false,
      name: 'docker compose live backend boots',
      detail: 'Container mnemic-memory-backend is already running. Stop it before running the live Docker gate.',
    }
  }

  const composeArgs = ['-f', join(rootDir, 'docker-compose.agent-memory.yml')]
  const env = {
    ...process.env,
    MNEMIC_BACKEND_PORT: port,
    SERVER_PORT: port,
  }

  try {
    execFileSync(command.bin, [...command.args, ...composeArgs, 'up', '-d', '--build', 'mnemic-memory-backend'], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const healthUrl = `http://127.0.0.1:${port}/actuator/health`
    let lastError = ''
    let healthBody = ''
    for (let attempt = 0; attempt < 180; attempt += 1) {
      try {
        healthBody = execFileSync('curl', ['-fsS', healthUrl], {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
        break
      } catch (error) {
        lastError = commandError(error)
        sleep(1000)
      }
    }

    if (!healthBody) {
      return {
        ok: false,
        name: 'docker compose live backend boots',
        detail: `Timed out waiting for ${healthUrl}. ${lastError}`,
      }
    }

    let containerHealth = ''
    for (let attempt = 0; attempt < 60; attempt += 1) {
      containerHealth = inspectContainerHealth('mnemic-memory-backend')
      if (containerHealth === 'healthy') break
      sleep(1000)
    }

    return {
      ok: containerHealth === 'healthy',
      name: 'docker compose live backend boots',
      detail: containerHealth === 'healthy'
        ? `Health endpoint returned ${healthBody}.`
        : `Health endpoint returned ${healthBody}, but container health is ${containerHealth || 'missing'}.`,
    }
  } catch (error) {
    return {
      ok: false,
      name: 'docker compose live backend boots',
      detail: commandError(error),
    }
  } finally {
    try {
      execFileSync(command.bin, [...command.args, ...composeArgs, 'stop', 'mnemic-memory-backend'], {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      // Best effort cleanup. The check result above carries the actionable error.
    }
  }
}

function composeCommand() {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' })
    return { bin: 'docker', args: ['compose'] }
  } catch {
    // Try legacy docker-compose below.
  }

  try {
    execFileSync('docker-compose', ['version'], { stdio: 'ignore' })
    return { bin: 'docker-compose', args: [] }
  } catch {
    return undefined
  }
}

function inspectContainerState(name) {
  try {
    return execFileSync('docker', ['inspect', '--format', '{{.State.Status}}', name], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function inspectContainerHealth(name) {
  try {
    return execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', name], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function valueArg(name) {
  const exact = rawArgs.find((arg) => arg.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = rawArgs.indexOf(name)
  if (index >= 0) return rawArgs[index + 1]
  return undefined
}

function commandError(error) {
  if (!error || typeof error !== 'object') return String(error)
  const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8').trim() : ''
  const stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8').trim() : ''
  return stderr || stdout || (error instanceof Error ? error.message : String(error))
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}
