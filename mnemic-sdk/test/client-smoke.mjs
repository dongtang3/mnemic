import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MnemicClient, queryString } from '../dist/index.js'

test('queryString omits empty optional values', () => {
  assert.equal(queryString({ project: 'mnemic', query: '', asOf: '2026-06-18T00:00:00Z', limit: 5 }), '?project=mnemic&asOf=2026-06-18T00%3A00%3A00Z&limit=5')
})

test('MnemicClient forwards memory requests through fetch', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        totalMemories: 1,
        byMemoryType: { decision: 1 },
        byProject: { mnemic: 1 },
        averageImportance: 0.8,
        averageConfidence: 0.9,
        explicitRelationCount: 0,
        eventCount: 1,
        latestUpdatedAt: '2026-06-17T00:00:00Z',
        latestEventAt: '2026-06-17T00:00:00Z',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  const stats = await client.stats()
  assert.equal(stats.totalMemories, 1)
  assert.equal(requests[0].url, 'http://mnemic.local/api/agent-memory/stats')
})

test('MnemicClient forwards policy status requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url) => {
      requests.push(String(url))
      return new Response(JSON.stringify({
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
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const policy = await client.policy()
  assert.equal(policy.source.kind, 'file')
  assert.equal(policy.config.requireSourceKey.severity, 'block')
  assert.equal(policy.config.secrets.builtInPolicyIds[0], 'secret-openai-key')
  assert.deepEqual(requests, ['http://mnemic.local/api/agent-memory/policy'])
})

test('MnemicClient forwards audit requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url) => {
      requests.push(String(url))
      return new Response(JSON.stringify({
        generatedAt: '2026-06-18T00:00:00Z',
        project: 'mnemic',
        totalMemories: 1,
        healthScore: 92,
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
            title: 'SDK fixture',
            category: 'source-key',
            message: 'Missing source key.',
            recommendation: 'Add sourceKey.',
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const audit = await client.audit('mnemic')
  assert.equal(audit.healthScore, 92)
  assert.equal(audit.findings[0].category, 'source-key')
  assert.deepEqual(requests, ['http://mnemic.local/api/agent-memory/audit?project=mnemic'])
})

test('MnemicClient forwards memory write preview requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url, init) => {
      requests.push({ url: String(url), method: init.method, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        dryRun: true,
        action: 'create',
        eventType: 'memory-created',
        wouldAppendEventUid: 'MemoryEvent-1',
        memoryUid: 'AgentMemory-1',
        sourceKeyMatched: false,
        afterMemory: memoryFixture(),
        diff: {
          subject: 'memory',
          before: null,
          after: { entityUid: 'AgentMemory-1', title: 'SDK fixture' },
          changedFields: ['entityUid', 'title'],
        },
        relationPreviews: [],
        warnings: [],
        before: { memoryCount: 0, relationCount: 0, eventCount: 0, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 0, memories: [], relations: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const preview = await client.previewMemory({
    title: 'SDK fixture',
    content: 'SDK fixture content.',
    sourceKey: 'sdk-preview',
  })

  assert.equal(preview.dryRun, true)
  assert.equal(preview.wouldAppendEventUid, 'MemoryEvent-1')
  assert.deepEqual(requests, [
    {
      url: 'http://mnemic.local/api/agent-memory/memories/preview',
      method: 'POST',
      body: {
        title: 'SDK fixture',
        content: 'SDK fixture content.',
        sourceKey: 'sdk-preview',
      },
    },
  ])
})

test('MnemicClient forwards recall explanation requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url) => {
      requests.push(String(url))
      return new Response(JSON.stringify({
        query: 'typescript',
        project: 'mnemic',
        generatedAt: '2026-06-17T00:00:00Z',
        entries: [
          {
            memory: memoryFixture(),
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
                titles: ['SDK fixture', 'Related fixture'],
                relationshipTypes: ['MEMORY_RELATED_TO'],
                score: 1.2,
              },
            ],
            stale: false,
            reasons: ['Matched title.'],
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const explained = await client.explainRecall({
    query: 'typescript',
    project: 'mnemic',
    asOf: '2026-06-17T00:00:00Z',
    limit: 3,
  })

  assert.equal(explained.entries[0].matchedFields[0], 'title')
  assert.equal(explained.entries[0].relationPaths[0].score, 1.2)
  assert.deepEqual(requests, [
    'http://mnemic.local/api/agent-memory/explain?query=typescript&project=mnemic&asOf=2026-06-17T00%3A00%3A00Z&limit=3',
  ])
})

test('MnemicClient binds default fetch to globalThis', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async function (url) {
      assert.equal(this, globalThis)
      assert.equal(String(url), '/actuator/health')
      return new Response(JSON.stringify({ status: 'UP', service: 'mnemic-server' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new MnemicClient()
    const health = await client.health()
    assert.equal(health.status, 'UP')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MnemicClient forwards export and rollback preview requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url) => {
      requests.push(String(url))
      if (String(url).includes('/rollback-preview')) {
        return new Response(JSON.stringify({
          generatedAt: '2026-06-17T00:00:00Z',
          eventUid: 'MemoryEvent-2',
          targetEvent: {
            eventUid: 'MemoryEvent-2',
            eventType: 'memory-updated',
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
          },
          before: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
          after: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
          current: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (String(url).endsWith('/api/agent-memory/rollback')) {
        return new Response(JSON.stringify({
          generatedAt: '2026-06-17T00:00:00Z',
          applied: true,
          rolledBackEventUid: 'MemoryEvent-2',
          rollbackEvent: {
            eventUid: 'MemoryEvent-3',
            eventType: 'memory-rolled-back',
            eventAt: '2026-06-17T00:00:00Z',
            memoryUid: 'AgentMemory-1',
            targetMemoryUid: '',
            relationshipType: '',
            actor: 'sdk-test',
            source: 'mnemic-rollback',
            sourceKey: 'rollback/MemoryEvent-2',
            project: 'mnemic',
            memoryType: 'decision',
            tags: [],
            attributes: { rollbackAction: 'restore-memory' },
            memorySnapshot: memoryFixture(),
          },
          operation: {
            action: 'restore-memory',
            memoryUid: 'AgentMemory-1',
            targetMemoryUid: '',
            relationshipType: '',
            description: 'Restore memory AgentMemory-1.',
          },
          before: { memoryCount: 1, relationCount: 0, eventCount: 2, memories: [], relations: [] },
          after: { memoryCount: 1, relationCount: 0, eventCount: 3, memories: [], relations: [] },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (String(url).includes('/api/agent-memory/snapshot')) {
        return new Response(JSON.stringify({
          generatedAt: '2026-06-17T00:00:00Z',
          asOf: '2026-06-17T00:00:00.000Z',
          project: 'mnemic',
          memoryType: '',
          tag: '',
          eventCount: 2,
          latestEventAt: '2026-06-17T00:00:00Z',
          memoryCount: 1,
          relationCount: 0,
          memories: [memoryFixture()],
          relations: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        format: 'jsonl',
        generatedAt: '2026-06-17T00:00:00Z',
        project: 'mnemic',
        memoryType: '',
        tag: '',
        lineCount: 1,
        jsonl: '{"kind":"mnemic.memory_event"}\n',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const exported = await client.exportJsonl({ project: 'mnemic', asOf: '2026-06-17T00:00:00Z', limit: 5 })
  assert.equal(exported.lineCount, 1)
  const snapshot = await client.snapshot({ project: 'mnemic', asOf: '2026-06-17T00:00:00Z', limit: 5 })
  assert.equal(snapshot.memoryCount, 1)
  const preview = await client.rollbackPreview('MemoryEvent-2')
  assert.equal(preview.operation.action, 'restore-memory')
  const applied = await client.rollback({ eventUid: 'MemoryEvent-2', confirm: true, actor: 'sdk-test' })
  assert.equal(applied.rollbackEvent.eventType, 'memory-rolled-back')
  assert.deepEqual(requests, [
    'http://mnemic.local/api/agent-memory/export?project=mnemic&asOf=2026-06-17T00%3A00%3A00Z&limit=5',
    'http://mnemic.local/api/agent-memory/snapshot?project=mnemic&asOf=2026-06-17T00%3A00%3A00Z&limit=5',
    'http://mnemic.local/api/agent-memory/rollback-preview?eventUid=MemoryEvent-2',
    'http://mnemic.local/api/agent-memory/rollback',
  ])
})

test('MnemicClient forwards JSONL import requests', async () => {
  const requests = []
  const client = new MnemicClient({
    baseUrl: 'http://mnemic.local',
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) })
      return new Response(JSON.stringify({
        generatedAt: '2026-06-17T00:00:00Z',
        applied: false,
        dryRun: true,
        parsedEventCount: 1,
        importedEventCount: 1,
        skippedDuplicateEventCount: 0,
        importedEventUids: ['MemoryEvent-1'],
        skippedDuplicateEventUids: [],
        warning: 'Dry run only. Re-run with confirm=true to import these events.',
        before: { memoryCount: 0, relationCount: 0, eventCount: 0, memories: [], relations: [] },
        after: { memoryCount: 1, relationCount: 0, eventCount: 1, memories: [], relations: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })

  const imported = await client.importJsonl({
    jsonl: '{"kind":"mnemic.memory_event","schemaVersion":1,"event":{"eventUid":"MemoryEvent-1"}}\n',
    confirm: false,
    actor: 'sdk-test',
  })

  assert.equal(imported.dryRun, true)
  assert.deepEqual(requests, [
    {
      url: 'http://mnemic.local/api/agent-memory/import',
      body: {
        jsonl: '{"kind":"mnemic.memory_event","schemaVersion":1,"event":{"eventUid":"MemoryEvent-1"}}\n',
        confirm: false,
        actor: 'sdk-test',
      },
    },
  ])
})

function memoryFixture() {
  return {
    entityUid: 'AgentMemory-1',
    title: 'SDK fixture',
    content: 'SDK fixture content.',
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
  }
}
