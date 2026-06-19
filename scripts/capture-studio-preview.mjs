#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

const rootDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const outputFile = process.env.MNEMIC_STUDIO_PREVIEW_FILE
  ? join(process.cwd(), process.env.MNEMIC_STUDIO_PREVIEW_FILE)
  : join(rootDir, 'docs/assets/mnemic-studio-preview.png')
const workDir = process.env.MNEMIC_STUDIO_PREVIEW_DIR
  ? join(process.cwd(), process.env.MNEMIC_STUDIO_PREVIEW_DIR)
  : join(rootDir, 'target/mnemic-studio-preview')
const project = process.env.MNEMIC_STUDIO_PREVIEW_PROJECT ?? 'mnemic'
const observedAt = process.env.MNEMIC_STUDIO_PREVIEW_OBSERVED_AT ?? '2026-06-18T00:00:00.000Z'

mkdirSync(workDir, { recursive: true })
mkdirSync(join(rootDir, 'docs/assets'), { recursive: true })

let backend
let studio

try {
  const backendPort = await pickPort()
  const studioPort = await pickPort()
  const backendBase = `http://127.0.0.1:${backendPort}`
  const studioBase = `http://127.0.0.1:${studioPort}`
  const memoryFile = join(workDir, 'mnemic-studio-preview-memory.json')

  if (existsSync(memoryFile)) rmSync(memoryFile)

  section('Building screenshot runtime')
  execFileSync('npm', ['--prefix', join(rootDir, 'mnemic-server'), 'run', 'build'], { cwd: rootDir, stdio: 'inherit' })
  execFileSync('npm', ['--prefix', join(rootDir, 'mnemic-sdk'), 'run', 'build'], { cwd: rootDir, stdio: 'inherit' })

  section('Starting preview backend')
  backend = spawn(process.execPath, [join(rootDir, 'mnemic-server/dist/server.js')], {
    cwd: rootDir,
    env: {
      ...process.env,
      SERVER_PORT: String(backendPort),
      MNEMIC_MEMORY_FILE: memoryFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeLogs(backend, 'backend')
  await waitForHttp(`${backendBase}/actuator/health`, 'Mnemic backend')

  section('Seeding preview memory graph')
  const primary = await remember(backendBase, {
    title: 'Mnemic is the shared memory plane',
    content: 'Codex, Claude Code, Cursor, and MCP-compatible agents can share source-keyed project memory instead of relearning the same facts.',
    memoryType: 'decision',
    project,
    tags: ['mcp', 'typescript', 'local-first'],
    source: 'studio-preview',
    sourceKey: `${project}/shared-memory-plane`,
    importance: 0.96,
    confidence: 0.94,
    observedAt,
  })
  const preview = await remember(backendBase, {
    title: 'Preview before durable memory writes',
    content: 'Write previews show policy findings, changed fields, relation effects, and before/after state counts before memory becomes durable.',
    memoryType: 'workflow',
    project,
    tags: ['governance', 'preview'],
    source: 'studio-preview',
    sourceKey: `${project}/preview-before-write`,
    importance: 0.9,
    confidence: 0.93,
    observedAt,
    relatedMemoryUids: [primary.entityUid],
  })
  const audit = await remember(backendBase, {
    title: 'Audit and replay memory changes',
    content: 'Append-only events, JSONL export/import, rollback preview, and historical snapshots make agent memory inspectable.',
    memoryType: 'release',
    project,
    tags: ['audit', 'event-log', 'snapshot'],
    source: 'studio-preview',
    sourceKey: `${project}/audit-and-replay`,
    importance: 0.88,
    confidence: 0.91,
    observedAt,
    relatedMemoryUids: [preview.entityUid],
  })
  await link(backendBase, preview.entityUid, primary.entityUid, 'supports', 'Preview flow supports shared agent memory.')
  await link(backendBase, audit.entityUid, preview.entityUid, 'depends_on', 'Release audit depends on previewing memory writes.')

  section('Starting Studio')
  studio = spawn('npm', ['--prefix', join(rootDir, 'studio'), 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(studioPort)], {
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_API_BASE: backendBase,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeLogs(studio, 'studio')
  await waitForHttp(studioBase, 'Mnemic Studio')

  section('Ensuring Playwright Chromium')
  execFileSync('npx', ['--yes', 'playwright', 'install', 'chromium'], { cwd: rootDir, stdio: 'inherit' })

  section('Capturing Studio graph preview')
  execFileSync('npx', [
    '--yes',
    'playwright',
    'screenshot',
    '--browser',
    'chromium',
    '--viewport-size',
    '1440,980',
    '--wait-for-selector',
    '.graph-canvas',
    '--wait-for-timeout',
    '1500',
    '--timeout',
    '15000',
    `${studioBase}/graph`,
    outputFile,
  ], { cwd: rootDir, stdio: 'inherit' })

  console.log(`Studio preview: ${outputFile}`)
} finally {
  stopProcess(studio)
  stopProcess(backend)
}

async function remember(baseUrl, memory) {
  const response = await fetch(`${baseUrl}/api/agent-memory/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  })
  if (!response.ok) {
    throw new Error(`Failed to write preview memory: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function link(baseUrl, sourceUid, targetUid, relationshipType, reason) {
  const response = await fetch(`${baseUrl}/api/agent-memory/memories/${sourceUid}/relations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetMemoryUid: targetUid,
      relationshipType,
      attributes: {
        reason,
        linkedBy: 'studio-preview',
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to link preview memory: ${response.status} ${await response.text()}`)
  }
  return response.json()
}

async function pickPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port)
        else reject(new Error('Unable to allocate a local port.'))
      })
    })
  })
}

async function waitForHttp(url, name) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Retry below.
    }
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${name} at ${url}`)
}

function pipeLogs(child, label) {
  child?.stdout?.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`))
  child?.stderr?.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`))
}

function stopProcess(child) {
  if (!child || child.killed) return
  child.kill('SIGTERM')
}

function section(label) {
  console.log(`\n==> ${label}`)
}
