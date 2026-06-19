import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

test('Mnemic MCP adapter exposes memory tools and forwards backend requests', async () => {
  const requests = []
  const backend = http.createServer(async (req, res) => {
    const body = await readJson(req)
    requests.push({ method: req.method, url: req.url, body })

    if (req.method === 'GET' && req.url === '/api/agent-memory/stats') {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        totalMemories: 2,
        byMemoryType: { decision: 1, blocker: 1 },
        byProject: { mnemic: 2 },
        averageImportance: 0.82,
        averageConfidence: 0.71,
        explicitRelationCount: 1,
        eventCount: 3,
        latestUpdatedAt: '2026-06-08T15:00:00Z',
        latestEventAt: '2026-06-08T15:00:00Z',
      })
      return
    }

    if (req.method === 'GET' && req.url === '/api/agent-memory/policy') {
      sendJson(res, policyFixture())
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/audit')) {
      sendJson(res, auditFixture())
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/briefing')) {
      sendJson(res, {
        project: 'mnemic',
        generatedAt: '2026-06-08T15:00:00Z',
        recentMemories: [],
        highImportanceMemories: [],
        openProblemMemories: [],
        briefing: 'Mnemic Agent Memory Session Briefing\nProject: mnemic',
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/timeline')) {
      sendJson(res, {
        project: 'mnemic',
        generatedAt: '2026-06-08T15:00:00Z',
        entries: [
          {
            eventType: 'memory-updated',
            eventUid: 'MemoryEvent-2',
            eventAt: '2026-06-08T15:00:00Z',
            memoryUid: 'AgentMemory-1',
            targetMemoryUid: '',
            relationshipType: '',
            memory: {
              entityUid: 'AgentMemory-1',
              title: 'Temporal memory',
              content: 'Observed fact routed through MCP.',
              memoryType: 'decision',
              project: 'mnemic',
              tags: ['mcp', 'temporal'],
              source: 'mcp-smoke',
              sourceKey: 'mcp-smoke-1',
              actor: 'codex',
              importance: 0.8,
              confidence: 0.82,
              observedAt: '2026-06-08T15:00:00Z',
              validFrom: '2026-06-08T00:00:00Z',
              validTo: '',
              createdAt: '2026-06-08T14:00:00Z',
              updatedAt: '2026-06-08T15:00:00Z',
              metadata: {},
              relatedMemoryUids: [],
            },
          },
        ],
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/explain')) {
      sendJson(res, {
        query: 'temporal',
        project: 'mnemic',
        generatedAt: '2026-06-08T15:00:00Z',
        entries: [
          {
            memory: memoryFixture(),
            score: 4.5,
            lexicalScore: 3,
            importanceBoost: 0.8,
            relationBoost: 0.7,
            matchedTerms: ['temporal'],
            matchedFields: ['title'],
            fieldScores: { title: 3 },
            relationPaths: [
              {
                nodeUids: ['AgentMemory-1', 'AgentMemory-2'],
                titles: ['Temporal memory', 'Related temporal memory'],
                relationshipTypes: ['MEMORY_RELATED_TO'],
                score: 1.2,
              },
            ],
            stale: false,
            reasons: ['Matched title.'],
          },
        ],
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/export')) {
      sendJson(res, {
        format: 'jsonl',
        generatedAt: '2026-06-08T15:00:00Z',
        project: 'mnemic',
        memoryType: '',
        tag: '',
        lineCount: 1,
        jsonl: '{"kind":"mnemic.memory_event","event":{"eventUid":"MemoryEvent-2"}}\n',
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/snapshot')) {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        asOf: '2026-06-08T15:00:00.000Z',
        project: 'mnemic',
        memoryType: '',
        tag: '',
        eventCount: 2,
        latestEventAt: '2026-06-08T15:00:00Z',
        memoryCount: 1,
        relationCount: 0,
        memories: [memoryFixture('Snapshot temporal memory')],
        relations: [],
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/agent-memory/import') {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        applied: body.confirm === true,
        dryRun: body.confirm !== true,
        parsedEventCount: 1,
        importedEventCount: 1,
        skippedDuplicateEventCount: 0,
        importedEventUids: ['MemoryEvent-2'],
        skippedDuplicateEventUids: [],
        warning: body.confirm === true
          ? 'Imported JSONL memory events.'
          : 'Dry run only. Re-run with confirm=true to import these events.',
        before: { memoryCount: 0, relationCount: 0, eventCount: 0, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/agent-memory/memories/preview') {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        dryRun: true,
        action: 'update',
        eventType: 'memory-updated',
        wouldAppendEventUid: 'MemoryEvent-4',
        memoryUid: 'AgentMemory-1',
        sourceKeyMatched: true,
        beforeMemory: memoryFixture('Previous temporal memory'),
        afterMemory: {
          ...memoryFixture(body.title),
          content: body.content,
          sourceKey: body.sourceKey ?? '',
          relatedMemoryUids: body.relatedMemoryUids ?? [],
        },
        diff: {
          subject: 'memory',
          before: { title: 'Previous temporal memory' },
          after: { title: body.title },
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
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/agent-memory/rollback-preview')) {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        eventUid: 'MemoryEvent-2',
        targetEvent: {
          eventType: 'memory-updated',
          eventUid: 'MemoryEvent-2',
          eventAt: '2026-06-08T15:00:00Z',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          actor: 'codex',
          source: 'mcp-smoke',
          sourceKey: 'mcp-smoke-1',
          project: 'mnemic',
          memoryType: 'decision',
          tags: ['mcp', 'temporal'],
          attributes: {},
          memorySnapshot: memoryFixture(),
        },
        targetEventIndex: 1,
        isLatestEvent: true,
        laterEventCount: 0,
        laterEvents: [],
        warning: 'Clean rollback preview only. No state was changed.',
        operation: {
          action: 'restore-memory',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          description: 'Restore memory AgentMemory-1.',
          previousMemory: memoryFixture('Previous temporal memory'),
          currentMemory: memoryFixture('Temporal memory'),
        },
        before: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
        current: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/agent-memory/rollback') {
      sendJson(res, {
        generatedAt: '2026-06-08T15:00:00Z',
        applied: true,
        rolledBackEventUid: body.eventUid,
        rollbackEvent: {
          eventType: 'memory-rolled-back',
          eventUid: 'MemoryEvent-3',
          eventAt: '2026-06-08T15:00:00Z',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          actor: body.actor ?? 'mcp-test',
          source: 'mnemic-rollback',
          sourceKey: `rollback/${body.eventUid}`,
          project: 'mnemic',
          memoryType: 'decision',
          tags: ['mcp', 'temporal'],
          attributes: { rollbackAction: 'restore-memory' },
          memorySnapshot: memoryFixture('Previous temporal memory'),
        },
        operation: {
          action: 'restore-memory',
          memoryUid: 'AgentMemory-1',
          targetMemoryUid: '',
          relationshipType: '',
          description: 'Restore memory AgentMemory-1.',
          previousMemory: memoryFixture('Previous temporal memory'),
          currentMemory: memoryFixture('Temporal memory'),
        },
        before: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 3, memories: [], relations: [] },
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/agent-memory/memories') {
      sendJson(res, {
        entityUid: 'AgentMemory-1',
        title: body.title,
        content: body.content,
        memoryType: body.memoryType ?? 'note',
        project: body.project ?? '',
        tags: body.tags ?? [],
        source: body.source ?? '',
        sourceKey: body.sourceKey ?? '',
        actor: body.actor ?? '',
        importance: body.importance ?? 0.5,
        confidence: body.confidence ?? 0.7,
        observedAt: body.observedAt ?? '',
        validFrom: body.validFrom ?? '',
        validTo: body.validTo ?? '',
        createdAt: '2026-06-08T15:00:00Z',
        updatedAt: '2026-06-08T15:00:00Z',
        metadata: body.metadata ?? {},
        relatedMemoryUids: body.relatedMemoryUids ?? [],
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  })

  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  const { port } = backend.address()
  const apiBase = `http://127.0.0.1:${port}`

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MNEMIC_API_BASE: apiBase,
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'mnemic-mcp-smoke-test', version: '0.1.0' })

  try {
    await client.connect(transport)

    const tools = await client.listTools()
    assert.deepEqual(
      tools.tools.map(tool => tool.name).filter(name => name.startsWith('mnemic_')).sort(),
      [
        'mnemic_audit',
        'mnemic_context_pack',
        'mnemic_explain_recall',
        'mnemic_export_jsonl',
        'mnemic_get_memory',
        'mnemic_import_jsonl',
        'mnemic_link_memories',
        'mnemic_memory_stats',
        'mnemic_memory_timeline',
        'mnemic_policy',
        'mnemic_preview_memory',
        'mnemic_recall',
        'mnemic_remember',
        'mnemic_rollback',
        'mnemic_rollback_preview',
        'mnemic_session_briefing',
        'mnemic_snapshot',
      ],
    )

    const stats = await client.callTool({ name: 'mnemic_memory_stats', arguments: {} })
    assert.match(stats.content[0].text, /totalMemories: 2/)
    assert.match(stats.content[0].text, /eventCount: 3/)
    assert.match(stats.content[0].text, /byMemoryType: decision=1, blocker=1/)

    const policy = await client.callTool({ name: 'mnemic_policy', arguments: {} })
    assert.match(policy.content[0].text, /Mnemic Policy Status/)
    assert.match(policy.content[0].text, /secret-openai-key/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/policy'))

    const audit = await client.callTool({ name: 'mnemic_audit', arguments: { project: 'mnemic' } })
    assert.match(audit.content[0].text, /Mnemic Memory Audit/)
    assert.match(audit.content[0].text, /missingSourceKeys: 1/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/audit?project=mnemic'))

    const briefing = await client.callTool({ name: 'mnemic_session_briefing', arguments: { project: 'mnemic', limit: 3 } })
    assert.match(briefing.content[0].text, /Session Briefing/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/briefing?project=mnemic&limit=3'))

    const timeline = await client.callTool({
      name: 'mnemic_memory_timeline',
      arguments: { project: 'mnemic', tag: 'temporal', asOf: '2026-06-08T15:00:00Z', limit: 2 },
    })
    assert.match(timeline.content[0].text, /Mnemic Agent Memory Timeline/)
    assert.match(timeline.content[0].text, /memory-updated/)
    assert.match(timeline.content[0].text, /eventUid: MemoryEvent-2/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/timeline?project=mnemic&tag=temporal&asOf=2026-06-08T15%3A00%3A00Z&limit=2'))

    const explained = await client.callTool({
      name: 'mnemic_explain_recall',
      arguments: { query: 'temporal', project: 'mnemic', asOf: '2026-06-08T15:00:00Z', limit: 2 },
    })
    assert.match(explained.content[0].text, /Mnemic Recall Explanation/)
    assert.match(explained.content[0].text, /matchedFields: title/)
    assert.match(explained.content[0].text, /relationPaths: Temporal memory -> Related temporal memory/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/explain?query=temporal&project=mnemic&asOf=2026-06-08T15%3A00%3A00Z&limit=2'))

    const exported = await client.callTool({
      name: 'mnemic_export_jsonl',
      arguments: { project: 'mnemic', asOf: '2026-06-08T15:00:00Z', limit: 1 },
    })
    assert.match(exported.content[0].text, /"kind":"mnemic.memory_event"/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/export?project=mnemic&asOf=2026-06-08T15%3A00%3A00Z&limit=1'))

    const snapshot = await client.callTool({
      name: 'mnemic_snapshot',
      arguments: { project: 'mnemic', asOf: '2026-06-08T15:00:00Z', limit: 1 },
    })
    assert.match(snapshot.content[0].text, /Mnemic Memory Snapshot/)
    assert.match(snapshot.content[0].text, /Snapshot temporal memory/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/snapshot?project=mnemic&asOf=2026-06-08T15%3A00%3A00Z&limit=1'))

    const imported = await client.callTool({
      name: 'mnemic_import_jsonl',
      arguments: { jsonl: '{"kind":"mnemic.memory_event","schemaVersion":1,"event":{"eventUid":"MemoryEvent-2"}}\n', confirm: true, actor: 'mcp-test' },
    })
    assert.match(imported.content[0].text, /Mnemic JSONL Import Applied/)
    assert.match(imported.content[0].text, /importedEventCount: 1/)
    assert.ok(requests.some(request => request.method === 'POST'
      && request.url === '/api/agent-memory/import'
      && request.body.confirm === true
      && request.body.actor === 'mcp-test'))

    const rollback = await client.callTool({ name: 'mnemic_rollback_preview', arguments: { eventUid: 'MemoryEvent-2' } })
    assert.match(rollback.content[0].text, /Mnemic Rollback Preview/)
    assert.match(rollback.content[0].text, /operation: restore-memory/)
    assert.ok(requests.some(request => request.url === '/api/agent-memory/rollback-preview?eventUid=MemoryEvent-2'))

    const appliedRollback = await client.callTool({
      name: 'mnemic_rollback',
      arguments: { eventUid: 'MemoryEvent-2', confirm: true, actor: 'mcp-test' },
    })
    assert.match(appliedRollback.content[0].text, /Mnemic Rollback Applied/)
    assert.match(appliedRollback.content[0].text, /rollbackEventUid: MemoryEvent-3/)
    assert.ok(requests.some(request => request.method === 'POST'
      && request.url === '/api/agent-memory/rollback'
      && request.body.confirm === true
      && request.body.actor === 'mcp-test'))

    const previewed = await client.callTool({
      name: 'mnemic_preview_memory',
      arguments: {
        title: 'Temporal memory preview',
        content: 'Preview routed through MCP without mutation.',
        memoryType: 'decision',
        project: 'mnemic',
        source: 'mcp-smoke',
        sourceKey: 'mcp-smoke-1',
        relatedMemoryUids: ['AgentMemory-2'],
      },
    })
    assert.match(previewed.content[0].text, /Mnemic Memory Write Preview/)
    assert.match(previewed.content[0].text, /action: update/)
    assert.match(previewed.content[0].text, /relation: MEMORY_RELATED_TO -> AgentMemory-2 alreadyExists=false/)
    assert.match(previewed.content[0].text, /policy: warning source-key-recommended sourceKey/)
    assert.ok(requests.some(request => request.method === 'POST'
      && request.url === '/api/agent-memory/memories/preview'
      && request.body.sourceKey === 'mcp-smoke-1'
      && request.body.relatedMemoryUids[0] === 'AgentMemory-2'))

    const remembered = await client.callTool({
      name: 'mnemic_remember',
      arguments: {
        title: 'Temporal memory',
        content: 'Observed fact routed through MCP.',
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['mcp', 'temporal'],
        source: 'mcp-smoke',
        sourceKey: 'mcp-smoke-1',
        importance: 0.8,
        confidence: 0.82,
        observedAt: '2026-06-08T15:00:00Z',
        validFrom: '2026-06-08T00:00:00Z',
      },
    })
    assert.match(remembered.content[0].text, /confidence: 0.82/)
    assert.match(remembered.content[0].text, /observedAt: 2026-06-08T15:00:00Z/)
    assert.ok(requests.some(request => request.method === 'POST'
      && request.url === '/api/agent-memory/memories'
      && request.body.confidence === 0.82
      && request.body.validFrom === '2026-06-08T00:00:00Z'))
  } finally {
    await transport.close()
    await new Promise(resolve => backend.close(resolve))
  }
})

function sendJson(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function memoryFixture(title = 'Temporal memory') {
  return {
    entityUid: 'AgentMemory-1',
    title,
    content: 'Observed fact routed through MCP.',
    memoryType: 'decision',
    project: 'mnemic',
    tags: ['mcp', 'temporal'],
    source: 'mcp-smoke',
    sourceKey: 'mcp-smoke-1',
    actor: 'codex',
    importance: 0.8,
    confidence: 0.82,
    observedAt: '2026-06-08T15:00:00Z',
    validFrom: '2026-06-08T00:00:00Z',
    validTo: '',
    createdAt: '2026-06-08T14:00:00Z',
    updatedAt: '2026-06-08T15:00:00Z',
    metadata: {},
    relatedMemoryUids: [],
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
        customPatterns: [],
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
        title: 'Temporal memory',
        category: 'source-key',
        message: 'Memory has no sourceKey.',
        recommendation: 'Add a stable sourceKey.',
      },
    ],
  }
}
