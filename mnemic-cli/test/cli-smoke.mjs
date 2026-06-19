import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execFileAsync = promisify(execFile)

test('mnemic CLI prints help', async () => {
  const result = await execFileAsync(process.execPath, ['dist/index.js', '--help'], { cwd: new URL('..', import.meta.url) })
  assert.match(result.stdout, /mnemic remember/)
  assert.match(result.stdout, /MNEMIC_API_BASE/)
})

test('mnemic CLI checks backend health', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/actuator/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'UP', service: 'mnemic-test' }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, ['dist/index.js', 'health', '--base-url', `http://127.0.0.1:${address.port}`], {
      cwd: new URL('..', import.meta.url),
    })
    assert.equal(result.stdout, 'UP mnemic-test\n')
  } finally {
    server.close()
  }
})

test('mnemic CLI prints policy status', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    if (request.url === '/api/agent-memory/policy') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(policyFixture()))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, ['dist/index.js', 'policy', '--base-url', `http://127.0.0.1:${address.port}`], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(result.stdout, /Mnemic Policy Status/)
    assert.match(result.stdout, /source: file/)
    assert.match(result.stdout, /secret-openai-key/)
    assert.equal(requests[0].url, '/api/agent-memory/policy')
  } finally {
    server.close()
  }
})

test('mnemic CLI prints memory audit and can fail gates', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    if (request.url?.startsWith('/api/agent-memory/audit')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(auditFixture()))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseArgs = ['--base-url', `http://127.0.0.1:${address.port}`]
    const result = await execFileAsync(process.execPath, ['dist/index.js', 'audit', '--project', 'mnemic', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(result.stdout, /Mnemic Memory Audit/)
    assert.match(result.stdout, /healthScore: 90/)
    assert.match(result.stdout, /missingSourceKeys: 1/)
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/audit?project=mnemic'))

    await assert.rejects(
      execFileAsync(process.execPath, ['dist/index.js', 'audit', '--project', 'mnemic', '--max-warnings', '0', ...baseArgs], {
        cwd: new URL('..', import.meta.url),
      }),
      /Command failed/,
    )
  } finally {
    server.close()
  }
})

test('mnemic CLI initializes local Mnemic config idempotently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-init-'))
  await mkdir(join(dir, '.mnemic'), { recursive: true })
  await mkdir(join(dir, 'scripts'), { recursive: true })
  await writeFile(join(dir, '.mnemic/policy.example.json'), JSON.stringify(policyFixture().config, null, 2))
  await writeFile(join(dir, 'scripts/run-agent-memory-mcp.sh'), '#!/usr/bin/env bash\n')

  try {
    const first = await execFileAsync(process.execPath, [
      'dist/index.js',
      'init',
      '--root',
      dir,
      '--project',
      'demo-project',
      '--port',
      '9099',
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(first.stdout, /Mnemic Init/)
    assert.match(first.stdout, /\[created\] \.env\.mnemic/)
    assert.match(first.stdout, /\[created\] \.mnemic\/policy\.json/)
    assert.match(first.stdout, /\[created\] \.mcp\.json/)
    assert.match(first.stdout, /\[created\] AGENTS\.mnemic\.md/)

    const env = await readFile(join(dir, '.env.mnemic'), 'utf8')
    assert.match(env, /MNEMIC_API_BASE=http:\/\/localhost:9099/)
    assert.match(env, /MNEMIC_POLICY_FILE=\.mnemic\/policy\.json/)

    const manifest = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
    assert.equal(manifest.mcpServers['mnemic-memory'].env.MNEMIC_API_BASE, 'http://localhost:9099')
    assert.deepEqual(manifest.mcpServers['mnemic-memory'].args, ['./scripts/run-agent-memory-mcp.sh'])

    const instructions = await readFile(join(dir, 'AGENTS.mnemic.md'), 'utf8')
    assert.match(instructions, /project scope `demo-project`/)

    const second = await execFileAsync(process.execPath, [
      'dist/index.js',
      'init',
      '--root',
      dir,
      '--project',
      'demo-project',
      '--port',
      '9099',
    ], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(second.stdout, /\[skipped\] \.env\.mnemic/)
    assert.match(second.stdout, /\[skipped\] \.mcp\.json/)

    const forced = await execFileAsync(process.execPath, [
      'dist/index.js',
      'init',
      '--root',
      dir,
      '--project',
      'demo-project',
      '--port',
      '9191',
      '--force',
    ], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(forced.stdout, /\[updated\] \.env\.mnemic/)
    assert.match(forced.stdout, /\[updated\] \.mcp\.json/)
    const forcedManifest = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
    assert.equal(forcedManifest.mcpServers['mnemic-memory'].env.MNEMIC_API_BASE, 'http://localhost:9191')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('mnemic CLI runs doctor readiness checks', async () => {
  const requests = []
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-doctor-'))
  await createDoctorFixture(dir)

  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    if (request.url === '/actuator/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'UP', service: 'mnemic-test' }))
      return
    }

    if (request.url === '/api/agent-memory/policy') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(policyFixture()))
      return
    }

    if (request.url === '/api/agent-memory/audit?project=mnemic') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        ...auditFixture(),
        healthScore: 100,
        summary: {
          blockCount: 0,
          warningCount: 0,
          infoCount: 0,
          missingSourceKeyCount: 0,
          lowConfidenceCount: 0,
          staleCount: 0,
          orphanCount: 0,
          duplicateTitleCount: 0,
        },
        findings: [],
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, [
      'dist/index.js',
      'doctor',
      '--root',
      dir,
      '--project',
      'mnemic',
      '--require-backend',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(result.stdout, /Mnemic Doctor/)
    assert.match(result.stdout, /summary: [0-9]+ pass, 0 warning, 0 fail/)
    assert.match(result.stdout, /\[pass\] Node\.js runtime/)
    assert.match(result.stdout, /\[pass\] MCP manifest/)
    assert.match(result.stdout, /\[pass\] Backend health/)
    assert.match(result.stdout, /\[pass\] Backend policy/)
    assert.match(result.stdout, /\[pass\] Backend memory audit/)
    assert.ok(requests.some((request) => request.url === '/actuator/health'))
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/policy'))
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/audit?project=mnemic'))
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('mnemic CLI previews a memory write without applying it', async () => {
  const requests = []
  const server = createServer(async (request, response) => {
    const body = await readJson(request)
    requests.push({ method: request.method, url: request.url, body })

    if (request.url === '/api/agent-memory/memories/preview') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        dryRun: true,
        action: 'update',
        eventType: 'memory-updated',
        wouldAppendEventUid: 'MemoryEvent-4',
        memoryUid: 'AgentMemory-1',
        sourceKeyMatched: true,
        beforeMemory: memoryFixture('Previous CLI fixture'),
        afterMemory: memoryFixture('CLI fixture'),
        diff: {
          subject: 'memory',
          before: { title: 'Previous CLI fixture' },
          after: { title: 'CLI fixture' },
          changedFields: ['title'],
        },
        relationPreviews: [
          {
            targetMemoryUid: 'AgentMemory-2',
            relationshipType: 'MEMORY_RELATED_TO',
            alreadyExists: false,
            diff: {
              subject: 'relation',
              before: null,
              after: { targetMemoryUid: 'AgentMemory-2' },
              changedFields: ['targetMemoryUid'],
            },
          },
        ],
        policyFindings: [
          {
            policyId: 'source-key-recommended',
            severity: 'warning',
            field: 'sourceKey',
            message: 'sourceKey is empty; repeated writes will create new memories.',
            recommendation: 'Use a stable source key.',
          },
        ],
        warnings: ['sourceKey matched existing memory AgentMemory-1; write will update it.'],
        before: { memoryCount: 2, relationCount: 0, eventCount: 3, memories: [], relations: [] },
        after: { memoryCount: 2, relationCount: 1, eventCount: 3, memories: [], relations: [] },
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, [
      'dist/index.js',
      'preview',
      '--title',
      'CLI fixture',
      '--content',
      'CLI fixture content.',
      '--source-key',
      'cli-preview',
      '--related',
      'AgentMemory-2',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(result.stdout, /Mnemic Memory Write Preview/)
    assert.match(result.stdout, /dryRun: true/)
    assert.match(result.stdout, /wouldAppendEventUid: MemoryEvent-4/)
    assert.match(result.stdout, /relation: MEMORY_RELATED_TO -> AgentMemory-2 alreadyExists=false/)
    assert.match(result.stdout, /policy: warning source-key-recommended sourceKey/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].method, 'POST')
    assert.equal(requests[0].url, '/api/agent-memory/memories/preview')
    assert.equal(requests[0].body.sourceKey, 'cli-preview')
    assert.deepEqual(requests[0].body.relatedMemoryUids, ['AgentMemory-2'])
  } finally {
    server.close()
  }
})

test('mnemic CLI explains recall ranking', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })

    if (request.url?.startsWith('/api/agent-memory/explain')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        query: 'typescript',
        project: 'mnemic',
        generatedAt: '2026-06-17T00:00:00Z',
        entries: [
          {
            memory: memoryFixture('CLI fixture'),
            score: 4.5,
            lexicalScore: 3,
            importanceBoost: 0.8,
            relationBoost: 0.7,
            matchedTerms: ['typescript'],
            matchedFields: ['title'],
            fieldScores: { title: 3 },
            relationPaths: [
              {
                nodeUids: ['AgentMemory-1', 'AgentMemory-2'],
                titles: ['CLI fixture', 'Related fixture'],
                relationshipTypes: ['MEMORY_RELATED_TO'],
                score: 1.2,
              },
            ],
            stale: false,
            reasons: ['Matched title.'],
          },
        ],
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, [
      'dist/index.js',
      'explain',
      'typescript',
      '--project',
      'mnemic',
      '--as-of',
      '2026-06-17T00:00:00Z',
      '--limit',
      '3',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(result.stdout, /Mnemic Recall Explanation/)
    assert.match(result.stdout, /matchedFields: title/)
    assert.match(result.stdout, /relationPaths: CLI fixture -> Related fixture/)
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/explain?query=typescript&project=mnemic&asOf=2026-06-17T00%3A00%3A00Z&limit=3'))
  } finally {
    server.close()
  }
})

test('mnemic CLI links memories through the relation endpoint', async () => {
  const requests = []
  const server = createServer(async (request, response) => {
    const body = await readJson(request)
    requests.push({ method: request.method, url: request.url, body })

    if (request.method === 'POST' && request.url === '/api/agent-memory/memories/AgentMemory-1/relations') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(memoryFixture({
        entityUid: 'AgentMemory-1',
        title: 'Source memory',
        relatedMemoryUids: ['AgentMemory-2'],
      })))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, [
      'dist/index.js',
      'link',
      'AgentMemory-1',
      'AgentMemory-2',
      '--relationship-type',
      'supports',
      '--reason',
      'demo graph',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(result.stdout, /Mnemic Memories Linked/)
    assert.match(result.stdout, /source: AgentMemory-1/)
    assert.match(result.stdout, /target: AgentMemory-2/)
    assert.match(result.stdout, /relationshipType: supports/)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/agent-memory/memories/AgentMemory-1/relations')
    assert.equal(requests[0].body.targetMemoryUid, 'AgentMemory-2')
    assert.equal(requests[0].body.relationshipType, 'supports')
    assert.equal(requests[0].body.attributes.reason, 'demo graph')
    assert.equal(requests[0].body.attributes.linkedBy, 'mnemic-cli')
  } finally {
    server.close()
  }
})

test('mnemic CLI exports JSONL and previews rollback', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url })
    if (request.url?.startsWith('/api/agent-memory/export')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        format: 'jsonl',
        generatedAt: '2026-06-17T00:00:00Z',
        project: 'mnemic',
        memoryType: '',
        tag: '',
        lineCount: 1,
        jsonl: '{"kind":"mnemic.memory_event","event":{"eventUid":"MemoryEvent-1"}}\n',
      }))
      return
    }

    if (request.url?.startsWith('/api/agent-memory/snapshot')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        asOf: '2026-06-17T00:00:00.000Z',
        project: 'mnemic',
        memoryType: '',
        tag: '',
        eventCount: 2,
        latestEventAt: '2026-06-17T00:00:00Z',
        memoryCount: 1,
        relationCount: 0,
        memories: [memoryFixture('CLI snapshot fixture')],
        relations: [],
      }))
      return
    }

    if (request.url?.startsWith('/api/agent-memory/rollback-preview')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        eventUid: 'MemoryEvent-1',
        targetEvent: {
          eventUid: 'MemoryEvent-1',
          eventType: 'memory-created',
          eventAt: '2026-06-17T00:00:00Z',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          actor: '',
          source: '',
          sourceKey: '',
          project: 'mnemic',
          memoryType: 'decision',
          tags: [],
          attributes: {},
          memorySnapshot: memoryFixture(),
        },
        targetEventIndex: 0,
        isLatestEvent: true,
        laterEventCount: 0,
        laterEvents: [],
        warning: 'Clean rollback preview only. No state was changed.',
        operation: {
          action: 'remove-memory',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          description: 'Remove memory AgentMemory-1.',
          currentMemory: memoryFixture(),
        },
        before: { memoryCount: 0, relationCount: 0, eventCount: 0, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
        current: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
      }))
      return
    }

    if (request.url === '/api/agent-memory/rollback') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        applied: true,
        rolledBackEventUid: 'MemoryEvent-1',
        rollbackEvent: {
          eventUid: 'MemoryEvent-2',
          eventType: 'memory-rolled-back',
          eventAt: '2026-06-17T00:00:00Z',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          actor: 'cli-user',
          source: 'mnemic-rollback',
          sourceKey: 'rollback/MemoryEvent-1',
          project: 'mnemic',
          memoryType: 'decision',
          tags: [],
          attributes: { rollbackAction: 'remove-memory' },
          memorySnapshot: memoryFixture(),
        },
        operation: {
          action: 'remove-memory',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          description: 'Remove memory AgentMemory-1.',
          currentMemory: memoryFixture(),
        },
        before: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
        after: { memoryCount: 0, relationCount: 0, eventCount: 2, memories: [], relations: [] },
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseArgs = ['--base-url', `http://127.0.0.1:${address.port}`]
    const exported = await execFileAsync(process.execPath, ['dist/index.js', 'export', '--project', 'mnemic', '--as-of', '2026-06-17T00:00:00Z', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(exported.stdout, /"kind":"mnemic.memory_event"/)
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/export?project=mnemic&asOf=2026-06-17T00%3A00%3A00Z'))

    const snapshot = await execFileAsync(process.execPath, ['dist/index.js', 'snapshot', '--project', 'mnemic', '--as-of', '2026-06-17T00:00:00Z', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(snapshot.stdout, /Mnemic Memory Snapshot/)
    assert.match(snapshot.stdout, /CLI snapshot fixture/)
    assert.ok(requests.some((request) => request.url === '/api/agent-memory/snapshot?project=mnemic&asOf=2026-06-17T00%3A00%3A00Z'))

    const preview = await execFileAsync(process.execPath, ['dist/index.js', 'rollback-preview', 'MemoryEvent-1', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(preview.stdout, /Mnemic Rollback Preview/)
    assert.match(preview.stdout, /operation: remove-memory/)

    const applied = await execFileAsync(process.execPath, ['dist/index.js', 'rollback', 'MemoryEvent-1', '--confirm', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(applied.stdout, /Mnemic Rollback Applied/)
    assert.match(applied.stdout, /rollbackEventUid: MemoryEvent-2/)
  } finally {
    server.close()
  }
})

test('mnemic CLI imports JSONL from a file', async () => {
  const requests = []
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-cli-'))
  const jsonlFile = join(dir, 'events.jsonl')
  await writeFile(jsonlFile, '{"kind":"mnemic.memory_event","schemaVersion":1,"event":{"eventUid":"MemoryEvent-1"}}\n')

  const server = createServer(async (request, response) => {
    const body = await readJson(request)
    requests.push({ method: request.method, url: request.url, body })

    if (request.url === '/api/agent-memory/import') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        applied: body.confirm === true,
        dryRun: body.confirm !== true,
        parsedEventCount: 1,
        importedEventCount: 1,
        skippedDuplicateEventCount: 0,
        importedEventUids: ['MemoryEvent-1'],
        skippedDuplicateEventUids: [],
        warning: body.confirm === true
          ? 'Imported JSONL memory events.'
          : 'Dry run only. Re-run with confirm=true to import these events.',
        before: { memoryCount: 0, relationCount: 0, eventCount: 0, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseArgs = ['--base-url', `http://127.0.0.1:${address.port}`]

    const preview = await execFileAsync(process.execPath, ['dist/index.js', 'import', jsonlFile, ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(preview.stdout, /Mnemic JSONL Import Preview/)
    assert.match(preview.stdout, /dryRun: true/)

    const applied = await execFileAsync(process.execPath, ['dist/index.js', 'import', jsonlFile, '--confirm', ...baseArgs], {
      cwd: new URL('..', import.meta.url),
    })
    assert.match(applied.stdout, /Mnemic JSONL Import Applied/)
    assert.match(applied.stdout, /importedEventUids: MemoryEvent-1/)

    assert.equal(requests.length, 2)
    assert.equal(requests[0].body.confirm, false)
    assert.equal(requests[1].body.confirm, true)
    assert.match(requests[1].body.jsonl, /"kind":"mnemic.memory_event"/)
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('mnemic CLI runs the coding-agent eval fixture', async () => {
  const requests = []
  const memoriesByUid = new Map()
  const memoriesBySourceKey = new Map()
  const expectedByQuery = new Map([
    ['typescript workspace agent memory', 'eval/typescript-foundation'],
    ['source keys auditable repeated writes', 'eval/source-keyed-writes'],
    ['preview memory before remember', 'eval/write-preview-policy'],
    ['why was this memory recalled', 'eval/recall-explanation'],
    ['current TypeScript product path', 'eval/runtime-boundary'],
  ])

  const server = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/agent-memory/memories') {
      const body = await readJson(request)
      requests.push({ method: request.method, url: request.url, body })
      const existing = memoriesBySourceKey.get(body.sourceKey)
      const memory = {
        ...(existing ?? memoryFixture({
          entityUid: `AgentMemory-${memoriesBySourceKey.size + 1}`,
        })),
        title: body.title,
        content: body.content,
        memoryType: body.memoryType,
        project: body.project,
        tags: body.tags ?? [],
        source: body.source,
        sourceKey: body.sourceKey,
        actor: body.actor,
        importance: body.importance ?? 0.5,
        confidence: body.confidence ?? 0.7,
        observedAt: body.observedAt ?? '',
        validTo: body.validTo ?? '',
      }
      memoriesByUid.set(memory.entityUid, memory)
      memoriesBySourceKey.set(memory.sourceKey, memory)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(memory))
      return
    }

    const relationMatch = request.url?.match(/^\/api\/agent-memory\/memories\/([^/]+)\/relations$/)
    if (request.method === 'POST' && relationMatch) {
      const body = await readJson(request)
      requests.push({ method: request.method, url: request.url, body })
      const source = memoriesByUid.get(decodeURIComponent(relationMatch[1]))
      if (source && !source.relatedMemoryUids.includes(body.targetMemoryUid)) {
        source.relatedMemoryUids.push(body.targetMemoryUid)
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(source))
      return
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/agent-memory/explain')) {
      requests.push({ method: request.method, url: request.url })
      const url = new URL(request.url, 'http://127.0.0.1')
      const query = url.searchParams.get('query') ?? ''
      const expectedSourceKey = expectedByQuery.get(query)
      const memory = expectedSourceKey ? memoriesBySourceKey.get(expectedSourceKey) : undefined
      const relationPaths = memory?.relatedMemoryUids.length
        ? memory.relatedMemoryUids.map((targetUid) => {
          const target = memoriesByUid.get(targetUid)
          return {
            nodeUids: [memory.entityUid, targetUid],
            titles: [memory.title, target?.title ?? targetUid],
            relationshipTypes: ['SUPPORTS'],
            score: 1,
          }
        })
        : []

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        query,
        project: url.searchParams.get('project') ?? '',
        generatedAt: '2026-06-17T00:00:00Z',
        entries: memory ? [{
          memory,
          score: 10,
          lexicalScore: 9,
          importanceBoost: 0.8,
          relationBoost: relationPaths.length ? 0.2 : 0,
          matchedTerms: query.split(' ').filter(Boolean),
          matchedFields: ['title', 'content'],
          fieldScores: { title: 6, content: 3 },
          relationPaths,
          stale: false,
          reasons: ['Matched fixture.'],
        }] : [],
      }))
      return
    }

    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const result = await execFileAsync(process.execPath, [
      'dist/index.js',
      'eval',
      '--project',
      'cli-eval',
      '--limit',
      '5',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(result.stdout, /Mnemic Eval/)
    assert.match(result.stdout, /fixture: coding-agent/)
    assert.match(result.stdout, /recall@5: 1.00/)
    assert.match(result.stdout, /relationPathCoverage: 1.00/)

    const markdown = await execFileAsync(process.execPath, [
      'dist/index.js',
      'eval',
      '--project',
      'cli-eval-markdown',
      '--limit',
      '5',
      '--markdown',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
    ], {
      cwd: new URL('..', import.meta.url),
    })

    assert.match(markdown.stdout, /^# Mnemic Eval Report/m)
    assert.match(markdown.stdout, /\| recall@5 \| 1\.00 \|/)
    assert.match(markdown.stdout, /\| relation path coverage \| 1\.00 \|/)
    assert.match(markdown.stdout, /\| Query \| Hit \| Rank \| Expected \| Top result \|/)
    assert.equal(requests.filter((request) => request.url === '/api/agent-memory/memories').length, 12)
    assert.equal(requests.filter((request) => request.url?.includes('/relations')).length, 6)
    assert.equal(requests.filter((request) => request.url?.startsWith('/api/agent-memory/explain')).length, 10)
  } finally {
    server.close()
  }
})

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function createDoctorFixture(root) {
  const files = new Map([
    ['package.json', JSON.stringify({ name: '@mnemic/platform' })],
    ['mnemic-sdk/package.json', JSON.stringify({ name: '@mnemic/sdk' })],
    ['mnemic-cli/package.json', JSON.stringify({ name: '@mnemic/cli' })],
    ['mnemic-server/package.json', JSON.stringify({ name: '@mnemic/server' })],
    ['mcp-server/package.json', JSON.stringify({ name: '@mnemic/memory-mcp' })],
    ['studio/package.json', JSON.stringify({ name: 'studio' })],
    ['.env.mnemic', 'MNEMIC_API_BASE=http://localhost:8088\n'],
    ['.mnemic/policy.json', JSON.stringify(policyFixture().config)],
    ['LICENSE', 'MIT License\n'],
    ['CONTRIBUTING.md', '# Contributing\n'],
    ['SECURITY.md', '# Security\n'],
    ['CODE_OF_CONDUCT.md', '# Mnemic Code of Conduct\n'],
    ['SUPPORT.md', '# Mnemic Support\n'],
    ['docs/security-hardening.md', '# Mnemic Security Hardening\n'],
    ['scripts/check-security-hardening.mjs', '#!/usr/bin/env node\n'],
    ['.github/workflows/codeql.yml', 'name: Mnemic CodeQL\n'],
    ['docs/supply-chain.md', '# Mnemic Supply-Chain Readiness\n'],
    ['scripts/check-supply-chain.mjs', '#!/usr/bin/env node\n'],
    ['CHANGELOG.md', '# Changelog\n'],
    ['docs/release-checklist.md', '# Release Checklist\n'],
    ['docs/assets/mnemic-readme-card.svg', '<svg><title>Mnemic</title></svg>\n'],
    ['docs/assets/mnemic-studio-preview.png', 'png fixture\n'],
    ['scripts/check-docs-integrity.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-launch-readiness.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-typescript-rewrite.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-fresh-clone.mjs', '#!/usr/bin/env node\n'],
    ['docs/completion-audit.md', '# Mnemic Completion Audit\n'],
    ['scripts/check-completion-audit.mjs', '#!/usr/bin/env node\n'],
    ['docs/repository-migration.md', '# Mnemic Repository Identity\n'],
    ['scripts/check-repository-migration.mjs', '#!/usr/bin/env node\n'],
    ['docs/github-launch.md', '# Mnemic GitHub Launch Playbook\n'],
    ['scripts/check-github-launch.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-publication-readiness.mjs', '#!/usr/bin/env node\n'],
    ['scripts/capture-studio-preview.mjs', '#!/usr/bin/env node\n'],
    ['examples/coding-agent-memory/README.md', '# Mnemic Coding-Agent Memory Demo\n'],
    ['docker-compose.agent-memory.yml', 'services:\n  mnemic-memory-backend:\n'],
    ['mnemic-server/Dockerfile.agent-memory', 'FROM node:24-alpine\n'],
    ['scripts/check-docker-readiness.mjs', '#!/usr/bin/env node\n'],
    ['docs/docker-quickstart.md', '# Mnemic Docker Quickstart\n'],
    ['docs/benchmark-landscape.md', '# Mnemic Benchmark Landscape\n'],
    ['scripts/check-benchmark-landscape.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-market-readiness.mjs', '#!/usr/bin/env node\n'],
    ['docs/npm-publishing.md', '# Mnemic npm Publishing Strategy\n'],
    ['scripts/generate-release-notes.mjs', '#!/usr/bin/env node\n'],
    ['scripts/check-release-readiness.mjs', '#!/usr/bin/env node\n'],
    ['docs/releases/v0.1.0.md', '# Mnemic v0.1.0 Release Notes\n'],
    ['scripts/check-package-readiness.mjs', '#!/usr/bin/env node\n'],
    ['docs/openapi.json', JSON.stringify({ openapi: '3.1.0', paths: {}, components: { schemas: {} } })],
    ['scripts/check-openapi.mjs', '#!/usr/bin/env node\n'],
    ['mnemic-sdk/README.md', '# SDK\n'],
    ['mnemic-cli/README.md', '# CLI\n'],
    ['mnemic-server/README.md', '# Server\n'],
    ['mcp-server/README.md', '# MCP\n'],
    ['.github/PULL_REQUEST_TEMPLATE.md', '# Pull Request\n'],
    ['.github/ISSUE_TEMPLATE/bug_report.yml', 'name: Bug report\n'],
    ['.github/ISSUE_TEMPLATE/feature_request.yml', 'name: Feature request\n'],
    ['.github/dependabot.yml', 'version: 2\n'],
    ['scripts/check-community-health.mjs', '#!/usr/bin/env node\n'],
    ['mnemic-cli/dist/index.js', ''],
    ['mnemic-server/dist/server.js', ''],
    ['mcp-server/dist/index.js', ''],
    ['studio/dist/index.html', '<div></div>'],
    ['scripts/run-agent-memory-mcp.sh', '#!/usr/bin/env bash\n'],
    ['.mcp.json', JSON.stringify({
      mcpServers: {
        'mnemic-memory': {
          command: '/bin/bash',
          args: ['./scripts/run-agent-memory-mcp.sh'],
          env: { MNEMIC_API_BASE: 'http://localhost:8088' },
        },
      },
    })],
    ['.mnemic/policy.example.json', JSON.stringify(policyFixture().config)],
    ['target/mnemic-benchmark/mnemic-eval-report.md', '# Mnemic Eval Report\n'],
  ])

  for (const [relativePath, content] of files) {
    const fullPath = join(root, relativePath)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content)
  }
}

function memoryFixture(titleOrOverrides = 'CLI fixture') {
  const overrides = typeof titleOrOverrides === 'string' ? { title: titleOrOverrides } : titleOrOverrides
  return {
    entityUid: 'AgentMemory-1',
    title: 'CLI fixture',
    content: 'CLI fixture content.',
    memoryType: 'decision',
    project: 'mnemic',
    tags: [],
    source: '',
    sourceKey: '',
    actor: '',
    importance: 0.5,
    confidence: 0.7,
    observedAt: '',
    validFrom: '',
    validTo: '',
    createdAt: '2026-06-17T00:00:00Z',
    updatedAt: '2026-06-17T00:00:00Z',
    metadata: {},
    relatedMemoryUids: [],
    ...overrides,
  }
}

function policyFixture() {
  return {
    generatedAt: '2026-06-18T00:00:00Z',
    source: { kind: 'file', policyFile: '.mnemic/policy.json' },
    config: {
      requireSourceKey: { memoryTypes: ['release'], tags: ['security'], severity: 'block' },
      secrets: {
        enabled: true,
        severity: 'block',
        builtInPolicyIds: ['secret-openai-key'],
        customPatterns: [
          {
            policyId: 'secret-company-token',
            pattern: 'company_live_[A-Za-z0-9]{20,}',
            fields: ['content'],
            severity: 'block',
          },
        ],
      },
      confidence: {
        lowWarningBelow: 0.35,
        highImportanceThreshold: 0.85,
        highImportanceLowWarningBelow: 0.5,
      },
      stale: { staleOnArrivalSeverity: 'warning' },
    },
  }
}

function auditFixture() {
  return {
    generatedAt: '2026-06-18T00:00:00Z',
    project: 'mnemic',
    totalMemories: 1,
    healthScore: 90,
    summary: {
      blockCount: 0,
      warningCount: 1,
      infoCount: 0,
      missingSourceKeyCount: 1,
      lowConfidenceCount: 0,
      staleCount: 0,
      orphanCount: 0,
      duplicateTitleCount: 0,
    },
    findings: [
      {
        findingId: 'missing-source-key-AgentMemory-1',
        severity: 'warning',
        memoryUid: 'AgentMemory-1',
        title: 'CLI fixture',
        category: 'source-key',
        message: 'Memory has no sourceKey.',
        recommendation: 'Add a stable sourceKey.',
      },
    ],
  }
}
