import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AgentMemoryService } from '../dist/memoryService.js'
import { createMnemicServer, loadPolicyConfig } from '../dist/server.js'
import { FileMemoryStore } from '../dist/store.js'

test('Mnemic TypeScript backend preserves the agent-memory HTTP contract', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')))
  const server = createMnemicServer(service)
  let restoreServer

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const createPreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'TypeScript backend rewrite',
        content: 'Mnemic now exposes agent memory through a TypeScript backend.',
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['typescript', 'agent-memory'],
        source: 'test',
        sourceKey: 'mnemic-ts-backend',
        actor: 'codex',
        importance: 0.91,
        confidence: 0.96,
        observedAt: '2026-06-17T12:00:00Z',
      }),
    })
    assert.equal(createPreview.dryRun, true)
    assert.equal(createPreview.action, 'create')
    assert.equal(createPreview.eventType, 'memory-created')
    assert.equal(createPreview.wouldAppendEventUid, 'MemoryEvent-1')
    assert.equal(createPreview.memoryUid, 'AgentMemory-1')
    assert.equal(createPreview.sourceKeyMatched, false)
    assert.equal(createPreview.diff.subject, 'memory')
    assert.equal(createPreview.diff.before, null)
    assert.equal(createPreview.diff.after.title, 'TypeScript backend rewrite')
    assert.ok(createPreview.diff.changedFields.includes('title'))
    assert.equal(createPreview.before.memoryCount, 0)
    assert.equal(createPreview.after.memoryCount, 1)
    assert.equal(createPreview.before.eventCount, 0)
    assert.equal(createPreview.after.eventCount, 0)
    assert.deepEqual(createPreview.policyFindings, [])

    const defaultPolicy = await requestJson(`${apiBase}/api/agent-memory/policy`)
    assert.equal(defaultPolicy.source.kind, 'constructor')
    assert.equal(defaultPolicy.source.policyFile, '')
    assert.ok(defaultPolicy.config.requireSourceKey.memoryTypes.includes('release'))
    assert.ok(defaultPolicy.config.secrets.builtInPolicyIds.includes('secret-openai-key'))
    assert.equal(defaultPolicy.config.secrets.enabled, true)

    const statsAfterCreatePreview = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(statsAfterCreatePreview.totalMemories, 0)
    assert.equal(statsAfterCreatePreview.eventCount, 0)

    const created = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'TypeScript backend rewrite',
        content: 'Mnemic now exposes agent memory through a TypeScript backend.',
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['typescript', 'agent-memory'],
        source: 'test',
        sourceKey: 'mnemic-ts-backend',
        actor: 'codex',
        importance: 0.91,
        confidence: 0.96,
        observedAt: '2026-06-17T12:00:00Z',
      }),
    })

    assert.equal(created.entityUid, 'AgentMemory-1')
    assert.equal(created.memoryType, 'decision')
    assert.equal(created.confidence, 0.96)

    const updatePreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'TypeScript backend rewrite updated',
        content: 'sourceKey updates are idempotent in the Mnemic backend.',
        memoryType: 'decision',
        project: 'mnemic',
        sourceKey: 'mnemic-ts-backend',
        importance: 0.95,
      }),
    })
    assert.equal(updatePreview.action, 'update')
    assert.equal(updatePreview.eventType, 'memory-updated')
    assert.equal(updatePreview.wouldAppendEventUid, 'MemoryEvent-2')
    assert.equal(updatePreview.memoryUid, created.entityUid)
    assert.equal(updatePreview.sourceKeyMatched, true)
    assert.equal(updatePreview.beforeMemory.title, 'TypeScript backend rewrite')
    assert.equal(updatePreview.afterMemory.title, 'TypeScript backend rewrite updated')
    assert.ok(updatePreview.diff.changedFields.includes('title'))
    assert.ok(updatePreview.warnings.some((warning) => warning.includes('sourceKey matched existing memory')))

    const statsAfterUpdatePreview = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(statsAfterUpdatePreview.totalMemories, 1)
    assert.equal(statsAfterUpdatePreview.eventCount, 1)

    const updated = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'TypeScript backend rewrite updated',
        content: 'sourceKey updates are idempotent in the Mnemic backend.',
        memoryType: 'decision',
        project: 'mnemic',
        sourceKey: 'mnemic-ts-backend',
        importance: 0.95,
      }),
    })
    assert.equal(updated.entityUid, created.entityUid)
    assert.equal(updated.title, 'TypeScript backend rewrite updated')

    const blocker = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Storage adapter rollout risk',
        content: 'Mnemic keeps JSON as the demo default while SQLite is opt-in for local durability.',
        memoryType: 'risk',
        project: 'mnemic',
        sourceKey: 'mnemic-store-risk',
        importance: 0.8,
      }),
    })

    const relationPreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: updated.title,
        content: updated.content,
        memoryType: 'decision',
        project: 'mnemic',
        sourceKey: 'mnemic-ts-backend',
        relatedMemoryUids: [blocker.entityUid],
      }),
    })
    assert.equal(relationPreview.action, 'update')
    assert.equal(relationPreview.wouldAppendEventUid, 'MemoryEvent-4')
    assert.equal(relationPreview.relationPreviews.length, 1)
    assert.equal(relationPreview.relationPreviews[0].targetMemoryUid, blocker.entityUid)
    assert.equal(relationPreview.relationPreviews[0].alreadyExists, false)
    assert.equal(relationPreview.relationPreviews[0].diff.subject, 'relation')
    assert.equal(relationPreview.before.relationCount, 0)
    assert.equal(relationPreview.after.relationCount, 1)
    assert.equal(relationPreview.after.eventCount, 3)

    const linked = await requestJson(`${apiBase}/api/agent-memory/memories/${updated.entityUid}/relations`, {
      method: 'POST',
      body: JSON.stringify({
        targetMemoryUid: blocker.entityUid,
        attributes: { reason: 'store swap' },
      }),
    })
    assert.deepEqual(linked.relatedMemoryUids, [blocker.entityUid])

    const existingRelationPreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: updated.title,
        content: updated.content,
        memoryType: 'decision',
        project: 'mnemic',
        sourceKey: 'mnemic-ts-backend',
        relatedMemoryUids: [blocker.entityUid],
      }),
    })
    assert.equal(existingRelationPreview.relationPreviews.length, 1)
    assert.equal(existingRelationPreview.relationPreviews[0].alreadyExists, true)
    assert.equal(existingRelationPreview.relationPreviews[0].diff.subject, 'none')
    assert.ok(existingRelationPreview.warnings.some((warning) => warning.includes('already linked')))

    const search = await requestJson(`${apiBase}/api/agent-memory/memories?query=typescript&project=mnemic&memoryType=decision&limit=5`)
    assert.equal(search.length, 1)
    assert.equal(search[0].entityUid, updated.entityUid)

    const explained = await requestJson(`${apiBase}/api/agent-memory/explain?query=typescript&project=mnemic&limit=5`)
    assert.equal(explained.query, 'typescript')
    assert.equal(explained.project, 'mnemic')
    assert.equal(explained.entries.length, 1)
    assert.equal(explained.entries[0].memory.entityUid, updated.entityUid)
    assert.ok(explained.entries[0].score > 0)
    assert.ok(explained.entries[0].lexicalScore > 0)
    assert.ok(explained.entries[0].matchedTerms.includes('typescript'))
    assert.ok(explained.entries[0].matchedFields.includes('title'))
    assert.ok(explained.entries[0].fieldScores.title > 0)
    assert.equal(explained.entries[0].stale, false)
    assert.ok(explained.entries[0].reasons.some((reason) => reason.includes('Matched')))

    const relationExplained = await requestJson(`${apiBase}/api/agent-memory/explain?project=mnemic&limit=5`)
    const sourceExplanation = relationExplained.entries.find((entry) => entry.memory.entityUid === updated.entityUid)
    assert.ok(sourceExplanation)
    assert.ok(sourceExplanation.relationBoost > 0)
    assert.equal(sourceExplanation.relationPaths[0].nodeUids[0], updated.entityUid)
    assert.equal(sourceExplanation.relationPaths[0].nodeUids[1], blocker.entityUid)
    assert.equal(sourceExplanation.relationPaths[0].relationshipTypes[0], 'MEMORY_RELATED_TO')
    assert.ok(sourceExplanation.relationPaths[0].score > 0)

    const pack = await requestJson(`${apiBase}/api/agent-memory/context-pack?query=typescript&project=mnemic&limit=5`)
    assert.match(pack.context, /Mnemic Agent Memory Context Pack/)
    assert.match(pack.context, /sourceKey updates are idempotent/)

    const briefing = await requestJson(`${apiBase}/api/agent-memory/briefing?project=mnemic&limit=5`)
    assert.match(briefing.briefing, /Mnemic Agent Memory Session Briefing/)
    assert.equal(briefing.openProblemMemories.length, 1)

    const stats = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(stats.totalMemories, 2)
    assert.equal(stats.explicitRelationCount, 1)
    assert.equal(stats.eventCount, 4)
    assert.equal(stats.byProject.mnemic, 2)
    assert.match(stats.latestEventAt, /^\d{4}-\d{2}-\d{2}T/)

    const timeline = await requestJson(`${apiBase}/api/agent-memory/timeline?project=mnemic&limit=5`)
    assert.equal(timeline.entries.length, 4)
    const createdEvent = timeline.entries.find((entry) => entry.eventUid === 'MemoryEvent-1')
    assert.equal(createdEvent.diff.subject, 'memory')
    assert.equal(createdEvent.diff.before, null)
    assert.equal(createdEvent.diff.after.title, 'TypeScript backend rewrite')
    assert.ok(createdEvent.diff.changedFields.includes('title'))

    const updatedEvent = timeline.entries.find((entry) => entry.eventType === 'memory-updated')
    assert.equal(updatedEvent.memory.sourceKey, 'mnemic-ts-backend')
    assert.equal(updatedEvent.diff.subject, 'memory')
    assert.equal(updatedEvent.diff.before.title, 'TypeScript backend rewrite')
    assert.equal(updatedEvent.diff.after.title, 'TypeScript backend rewrite updated')
    assert.ok(updatedEvent.diff.changedFields.includes('title'))
    assert.ok(updatedEvent.diff.changedFields.includes('content'))

    assert.ok(timeline.entries.some((entry) =>
      entry.eventType === 'memory-created'
      && entry.memory.sourceKey === 'mnemic-store-risk'))

    const linkedEvent = timeline.entries.find((entry) => entry.eventType === 'memory-linked')
    assert.equal(linkedEvent.targetMemoryUid, blocker.entityUid)
    assert.equal(linkedEvent.relationshipType, 'MEMORY_RELATED_TO')
    assert.equal(linkedEvent.diff.subject, 'relation')
    assert.equal(linkedEvent.diff.before, null)
    assert.equal(linkedEvent.diff.after.relationshipType, 'MEMORY_RELATED_TO')

    const exported = await requestJson(`${apiBase}/api/agent-memory/export?project=mnemic&limit=10`)
    assert.equal(exported.format, 'jsonl')
    assert.equal(exported.lineCount, 4)
    const exportedLines = exported.jsonl.trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(exportedLines[0].kind, 'mnemic.memory_event')
    assert.equal(exportedLines[0].schemaVersion, 1)
    assert.deepEqual(exportedLines.map((line) => line.event.eventUid), [
      'MemoryEvent-1',
      'MemoryEvent-2',
      'MemoryEvent-3',
      'MemoryEvent-4',
    ])
    assert.equal(exportedLines[1].event.diff.subject, 'memory')
    assert.ok(exportedLines[1].event.diff.changedFields.includes('importance'))

    const duplicatePreview = await requestJson(`${apiBase}/api/agent-memory/import`, {
      method: 'POST',
      body: JSON.stringify({ jsonl: exported.jsonl }),
    })
    assert.equal(duplicatePreview.applied, false)
    assert.equal(duplicatePreview.dryRun, true)
    assert.equal(duplicatePreview.parsedEventCount, 4)
    assert.equal(duplicatePreview.importedEventCount, 0)
    assert.equal(duplicatePreview.skippedDuplicateEventCount, 4)
    assert.equal(duplicatePreview.after.eventCount, 4)

    const restoreService = new AgentMemoryService(new FileMemoryStore(join(dir, 'restore.json')))
    restoreServer = createMnemicServer(restoreService)
    await new Promise((resolve) => restoreServer.listen(0, '127.0.0.1', resolve))
    const restoreAddress = restoreServer.address()
    assert.equal(typeof restoreAddress, 'object')
    const restoreApiBase = `http://127.0.0.1:${restoreAddress.port}`

    const restorePreview = await requestJson(`${restoreApiBase}/api/agent-memory/import`, {
      method: 'POST',
      body: JSON.stringify({ jsonl: exported.jsonl }),
    })
    assert.equal(restorePreview.applied, false)
    assert.equal(restorePreview.dryRun, true)
    assert.equal(restorePreview.importedEventCount, 4)
    assert.equal(restorePreview.before.memoryCount, 0)
    assert.equal(restorePreview.after.memoryCount, 2)
    assert.equal(restorePreview.after.relationCount, 1)
    assert.equal(restorePreview.after.eventCount, 4)

    const restored = await requestJson(`${restoreApiBase}/api/agent-memory/import`, {
      method: 'POST',
      body: JSON.stringify({
        jsonl: exported.jsonl,
        confirm: true,
        actor: 'test',
      }),
    })
    assert.equal(restored.applied, true)
    assert.equal(restored.importedEventCount, 4)
    assert.deepEqual(restored.importedEventUids, ['MemoryEvent-1', 'MemoryEvent-2', 'MemoryEvent-3', 'MemoryEvent-4'])

    const restoredStats = await requestJson(`${restoreApiBase}/api/agent-memory/stats`)
    assert.equal(restoredStats.totalMemories, 2)
    assert.equal(restoredStats.explicitRelationCount, 1)
    assert.equal(restoredStats.eventCount, 4)

    const restoredSearch = await requestJson(`${restoreApiBase}/api/agent-memory/memories?query=updates&project=mnemic&limit=5`)
    assert.equal(restoredSearch.length, 1)
    assert.equal(restoredSearch[0].title, 'TypeScript backend rewrite updated')

    const idempotentRestore = await requestJson(`${restoreApiBase}/api/agent-memory/import`, {
      method: 'POST',
      body: JSON.stringify({
        jsonl: exported.jsonl,
        confirm: true,
      }),
    })
    assert.equal(idempotentRestore.applied, false)
    assert.equal(idempotentRestore.importedEventCount, 0)
    assert.equal(idempotentRestore.skippedDuplicateEventCount, 4)

    const rollback = await requestJson(`${apiBase}/api/agent-memory/rollback-preview?eventUid=MemoryEvent-2`)
    assert.equal(rollback.eventUid, 'MemoryEvent-2')
    assert.equal(rollback.targetEvent.eventType, 'memory-updated')
    assert.equal(rollback.operation.action, 'restore-memory')
    assert.equal(rollback.operation.previousMemory.title, 'TypeScript backend rewrite')
    assert.equal(rollback.operation.currentMemory.title, 'TypeScript backend rewrite updated')
    assert.equal(rollback.before.memoryCount, 1)
    assert.equal(rollback.after.memoryCount, 1)
    assert.equal(rollback.current.memoryCount, 2)
    assert.equal(rollback.laterEventCount, 2)
    assert.equal(rollback.isLatestEvent, false)

    const rejectedRollback = await fetch(`${apiBase}/api/agent-memory/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventUid: 'MemoryEvent-4', confirm: false }),
    })
    assert.equal(rejectedRollback.status, 400)

    const appliedRollback = await requestJson(`${apiBase}/api/agent-memory/rollback`, {
      method: 'POST',
      body: JSON.stringify({
        eventUid: 'MemoryEvent-4',
        confirm: true,
        actor: 'test',
        reason: 'remove test relation',
      }),
    })
    assert.equal(appliedRollback.applied, true)
    assert.equal(appliedRollback.rolledBackEventUid, 'MemoryEvent-4')
    assert.equal(appliedRollback.rollbackEvent.eventType, 'memory-rolled-back')
    assert.equal(appliedRollback.rollbackEvent.attributes.rollbackAction, 'remove-relation')
    assert.equal(appliedRollback.rollbackEvent.diff.subject, 'state')
    assert.ok(appliedRollback.rollbackEvent.diff.changedFields.includes('relationCount'))
    assert.equal(appliedRollback.operation.action, 'remove-relation')
    assert.equal(appliedRollback.before.relationCount, 1)
    assert.equal(appliedRollback.after.relationCount, 0)
    assert.equal(appliedRollback.after.eventCount, 5)

    const afterRollbackSource = await requestJson(`${apiBase}/api/agent-memory/memories/${updated.entityUid}`)
    assert.deepEqual(afterRollbackSource.relatedMemoryUids, [])

    const afterRollbackStats = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(afterRollbackStats.explicitRelationCount, 0)
    assert.equal(afterRollbackStats.eventCount, 5)
  } finally {
    if (restoreServer) {
      await new Promise((resolve) => restoreServer.close(resolve))
    }
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic backend filters recall by temporal asOf validity windows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-temporal-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')))
  const server = createMnemicServer(service)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const current = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Current temporal recall rule',
        content: 'Temporal recall should prefer the memory valid during 2026.',
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['temporal'],
        sourceKey: 'temporal/current-rule',
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2026-12-31T23:59:59Z',
      }),
    })
    const retired = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Retired temporal recall rule',
        content: 'Temporal recall should return this memory only for 2025.',
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['temporal'],
        sourceKey: 'temporal/retired-rule',
        validFrom: '2025-01-01T00:00:00Z',
        validTo: '2025-12-31T23:59:59Z',
      }),
    })

    const asOf2025 = encodeURIComponent('2025-06-01T00:00:00Z')
    const asOf2026 = encodeURIComponent('2026-06-01T00:00:00Z')
    const recalled2025 = await requestJson(`${apiBase}/api/agent-memory/memories?query=temporal&project=mnemic&asOf=${asOf2025}&limit=5`)
    assert.deepEqual(recalled2025.map((memory) => memory.entityUid), [retired.entityUid])

    const recalled2026 = await requestJson(`${apiBase}/api/agent-memory/memories?query=temporal&project=mnemic&asOf=${asOf2026}&limit=5`)
    assert.deepEqual(recalled2026.map((memory) => memory.entityUid), [current.entityUid])

    const explained2026 = await requestJson(`${apiBase}/api/agent-memory/explain?query=temporal&project=mnemic&asOf=${asOf2026}&limit=5`)
    assert.equal(explained2026.asOf, '2026-06-01T00:00:00.000Z')
    assert.deepEqual(explained2026.entries.map((entry) => entry.memory.entityUid), [current.entityUid])

    const pack2025 = await requestJson(`${apiBase}/api/agent-memory/context-pack?query=temporal&project=mnemic&asOf=${asOf2025}&limit=5`)
    assert.equal(pack2025.asOf, '2025-06-01T00:00:00.000Z')
    assert.match(pack2025.context, /As of: 2025-06-01T00:00:00.000Z/)
    assert.match(pack2025.context, /Retired temporal recall rule/)
    assert.doesNotMatch(pack2025.context, /Current temporal recall rule/)

    const noEarlyEvents = await requestJson(`${apiBase}/api/agent-memory/timeline?project=mnemic&asOf=${encodeURIComponent('2000-01-01T00:00:00Z')}&limit=5`)
    assert.equal(noEarlyEvents.asOf, '2000-01-01T00:00:00.000Z')
    assert.equal(noEarlyEvents.entries.length, 0)

    const noEarlyExport = await requestJson(`${apiBase}/api/agent-memory/export?project=mnemic&asOf=${encodeURIComponent('2000-01-01T00:00:00Z')}&limit=5`)
    assert.equal(noEarlyExport.asOf, '2000-01-01T00:00:00.000Z')
    assert.equal(noEarlyExport.lineCount, 0)
    assert.equal(noEarlyExport.jsonl, '')

    const badAsOf = await fetch(`${apiBase}/api/agent-memory/memories?asOf=not-a-date`)
    assert.equal(badAsOf.status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic backend reconstructs historical snapshots from the event log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-snapshot-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')))
  const server = createMnemicServer(service)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const sourceV1 = memoryEventSnapshot({
      entityUid: 'AgentMemory-1',
      title: 'Snapshot rule v1',
      content: 'The original historical rule is visible before the update.',
      updatedAt: '2026-01-01T00:00:00Z',
      sourceKey: 'snapshot/source',
      tags: ['snapshot'],
    })
    const target = memoryEventSnapshot({
      entityUid: 'AgentMemory-2',
      title: 'Snapshot dependency',
      content: 'A related memory appears before the link event.',
      updatedAt: '2026-02-01T00:00:00Z',
      sourceKey: 'snapshot/target',
      tags: ['snapshot'],
    })
    const sourceV2 = {
      ...sourceV1,
      title: 'Snapshot rule v2',
      content: 'The updated historical rule is visible after the update.',
      updatedAt: '2026-06-01T00:00:00Z',
    }
    const jsonl = [
      memoryEventLine('MemoryEvent-1', 'memory-created', '2026-01-01T00:00:00Z', sourceV1),
      memoryEventLine('MemoryEvent-2', 'memory-created', '2026-02-01T00:00:00Z', target),
      memoryEventLine('MemoryEvent-3', 'memory-linked', '2026-03-01T00:00:00Z', sourceV1, {
        targetMemoryUid: target.entityUid,
        relationshipType: 'SUPPORTS',
        attributes: { reason: 'historical dependency' },
      }),
      memoryEventLine('MemoryEvent-4', 'memory-updated', '2026-06-01T00:00:00Z', sourceV2),
    ].join('')

    const imported = await requestJson(`${apiBase}/api/agent-memory/import`, {
      method: 'POST',
      body: JSON.stringify({ jsonl, confirm: true, actor: 'snapshot-test' }),
    })
    assert.equal(imported.applied, true)
    assert.equal(imported.importedEventCount, 4)

    const january = await requestJson(`${apiBase}/api/agent-memory/snapshot?project=mnemic&asOf=${encodeURIComponent('2026-01-15T00:00:00Z')}`)
    assert.equal(january.asOf, '2026-01-15T00:00:00.000Z')
    assert.equal(january.eventCount, 1)
    assert.equal(january.memoryCount, 1)
    assert.equal(january.relationCount, 0)
    assert.equal(january.memories[0].title, 'Snapshot rule v1')

    const april = await requestJson(`${apiBase}/api/agent-memory/snapshot?project=mnemic&asOf=${encodeURIComponent('2026-04-01T00:00:00Z')}`)
    assert.equal(april.eventCount, 3)
    assert.equal(april.memoryCount, 2)
    assert.equal(april.relationCount, 1)
    assert.equal(april.relations[0].relationshipType, 'SUPPORTS')
    assert.equal(april.memories.find((memory) => memory.entityUid === sourceV1.entityUid).title, 'Snapshot rule v1')

    const july = await requestJson(`${apiBase}/api/agent-memory/snapshot?project=mnemic&asOf=${encodeURIComponent('2026-07-01T00:00:00Z')}`)
    assert.equal(july.eventCount, 4)
    assert.equal(july.memoryCount, 2)
    assert.equal(july.relationCount, 1)
    assert.equal(july.latestEventAt, '2026-06-01T00:00:00Z')
    assert.equal(july.memories.find((memory) => memory.entityUid === sourceV1.entityUid).title, 'Snapshot rule v2')

    const badAsOf = await fetch(`${apiBase}/api/agent-memory/snapshot?asOf=bad-date`)
    assert.equal(badAsOf.status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic backend enforces memory governance policy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-policy-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')))
  const server = createMnemicServer(service)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const secretPreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Leaked provider key',
        content: 'OPENAI_API_KEY=sk-123456789012345678901234567890',
        memoryType: 'note',
        project: 'mnemic',
      }),
    })
    assert.equal(secretPreview.dryRun, true)
    assert.equal(secretPreview.policyFindings[0].severity, 'block')
    assert.equal(secretPreview.policyFindings[0].policyId, 'secret-openai-key')
    assert.ok(secretPreview.warnings.some((warning) => warning.includes('Potential secret detected')))

    const blockedSecret = await fetch(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Leaked provider key',
        content: 'OPENAI_API_KEY=sk-123456789012345678901234567890',
        memoryType: 'note',
        project: 'mnemic',
      }),
    })
    assert.equal(blockedSecret.status, 400)
    const blockedSecretBody = await blockedSecret.json()
    assert.equal(blockedSecretBody.error, 'Memory write blocked by Mnemic policy.')
    assert.equal(blockedSecretBody.policyFindings[0].policyId, 'secret-openai-key')

    const releasePreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Production release rule',
        content: 'Production release memories must cite the release source.',
        memoryType: 'release',
        project: 'mnemic',
      }),
    })
    assert.equal(releasePreview.policyFindings[0].policyId, 'source-key-recommended')
    assert.equal(releasePreview.policyFindings[0].severity, 'block')

    const blockedRelease = await fetch(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Production release rule',
        content: 'Production release memories must cite the release source.',
        memoryType: 'release',
        project: 'mnemic',
      }),
    })
    assert.equal(blockedRelease.status, 400)
    const blockedReleaseBody = await blockedRelease.json()
    assert.equal(blockedReleaseBody.policyFindings[0].policyId, 'source-key-recommended')

    const statsAfterBlocks = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(statsAfterBlocks.totalMemories, 0)
    assert.equal(statsAfterBlocks.eventCount, 0)

    const lowConfidence = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Unverified local note',
        content: 'This memory is intentionally low confidence but not a secret.',
        memoryType: 'note',
        project: 'mnemic',
        confidence: 0.2,
      }),
    })
    assert.equal(lowConfidence.entityUid, 'AgentMemory-1')
    assert.equal(lowConfidence.policyFindings.some((finding) => finding.policyId === 'low-confidence-memory'), true)
    assert.equal(lowConfidence.policyFindings.some((finding) => finding.policyId === 'source-key-recommended'), true)

    const statsAfterWarningWrite = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(statsAfterWarningWrite.totalMemories, 1)
    assert.equal(statsAfterWarningWrite.eventCount, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic backend supports configurable governance policy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-policy-config-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')), {
    requireSourceKey: {
      memoryTypes: ['note'],
      tags: ['governed'],
      severity: 'block',
    },
    secrets: {
      enabled: true,
      severity: 'warning',
      customPatterns: [
        {
          policyId: 'secret-company-token',
          pattern: 'company_live_[A-Za-z0-9]{20,}',
          fields: ['content'],
          severity: 'block',
          message: 'Potential company token detected.',
          recommendation: 'Redact company tokens before writing memory.',
        },
      ],
    },
    confidence: {
      lowWarningBelow: 0.2,
    },
  })
  const server = createMnemicServer(service)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const policyStatus = await requestJson(`${apiBase}/api/agent-memory/policy`)
    assert.equal(policyStatus.source.kind, 'constructor')
    assert.deepEqual(policyStatus.config.requireSourceKey.memoryTypes, ['note'])
    assert.equal(policyStatus.config.secrets.severity, 'warning')
    assert.equal(policyStatus.config.secrets.customPatterns[0].policyId, 'secret-company-token')
    assert.equal(policyStatus.config.confidence.lowWarningBelow, 0.2)

    const notePreview = await requestJson(`${apiBase}/api/agent-memory/memories/preview`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Configured note policy',
        content: 'This note now requires a source key because policy config says so.',
        memoryType: 'note',
        project: 'mnemic',
      }),
    })
    assert.equal(notePreview.policyFindings[0].policyId, 'source-key-recommended')
    assert.equal(notePreview.policyFindings[0].severity, 'block')
    assert.match(notePreview.policyFindings[0].message, /note|governed/)

    const blockedNote = await fetch(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Configured note policy',
        content: 'This note now requires a source key because policy config says so.',
        memoryType: 'note',
        project: 'mnemic',
      }),
    })
    assert.equal(blockedNote.status, 400)

    const openAiWarning = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Provider key warning',
        content: 'OPENAI_API_KEY=sk-123456789012345678901234567890',
        memoryType: 'note',
        project: 'mnemic',
        sourceKey: 'policy-config/openai-warning',
      }),
    })
    assert.equal(openAiWarning.entityUid, 'AgentMemory-1')
    assert.equal(openAiWarning.policyFindings[0].policyId, 'secret-openai-key')
    assert.equal(openAiWarning.policyFindings[0].severity, 'warning')

    const customSecret = await fetch(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Custom token block',
        content: 'company_live_12345678901234567890',
        memoryType: 'note',
        project: 'mnemic',
        sourceKey: 'policy-config/custom-token',
      }),
    })
    assert.equal(customSecret.status, 400)
    const customSecretBody = await customSecret.json()
    assert.equal(customSecretBody.policyFindings[0].policyId, 'secret-company-token')

    const stats = await requestJson(`${apiBase}/api/agent-memory/stats`)
    assert.equal(stats.totalMemories, 1)
    assert.equal(stats.eventCount, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic server loads governance policy from MNEMIC_POLICY_FILE', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-policy-loader-'))
  const policyFile = join(dir, 'policy.json')
  const previousPolicyFile = process.env.MNEMIC_POLICY_FILE

  await writeFile(policyFile, JSON.stringify({
    requireSourceKey: {
      memoryTypes: ['decision'],
      tags: ['client-visible'],
      severity: 'warning',
    },
    confidence: {
      lowWarningBelow: 0.42,
    },
  }))

  try {
    process.env.MNEMIC_POLICY_FILE = policyFile
    const loaded = loadPolicyConfig()
    assert.deepEqual(loaded.requireSourceKey.memoryTypes, ['decision'])
    assert.deepEqual(loaded.requireSourceKey.tags, ['client-visible'])
    assert.equal(loaded.requireSourceKey.severity, 'warning')
    assert.equal(loaded.confidence.lowWarningBelow, 0.42)
  } finally {
    if (previousPolicyFile === undefined) {
      delete process.env.MNEMIC_POLICY_FILE
    } else {
      process.env.MNEMIC_POLICY_FILE = previousPolicyFile
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test('Mnemic backend audits memory hygiene', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-audit-'))
  const service = new AgentMemoryService(new FileMemoryStore(join(dir, 'memories.json')))
  const server = createMnemicServer(service)

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.equal(typeof address, 'object')
  const apiBase = `http://127.0.0.1:${address.port}`

  try {
    const first = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Duplicate audit title',
        content: 'Missing source key, low confidence, and expired validity should be audited.',
        memoryType: 'note',
        project: 'mnemic',
        confidence: 0.2,
        validTo: '2025-01-01T00:00:00Z',
      }),
    })
    const second = await requestJson(`${apiBase}/api/agent-memory/memories`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Duplicate audit title',
        content: 'This memory has a source key but duplicates the title.',
        memoryType: 'note',
        project: 'mnemic',
        sourceKey: 'audit/duplicate-title',
      }),
    })
    await requestJson(`${apiBase}/api/agent-memory/memories/${first.entityUid}/relations`, {
      method: 'POST',
      body: JSON.stringify({ targetMemoryUid: second.entityUid }),
    })

    const audit = await requestJson(`${apiBase}/api/agent-memory/audit?project=mnemic`)
    assert.equal(audit.project, 'mnemic')
    assert.equal(audit.totalMemories, 2)
    assert.ok(audit.healthScore < 100)
    assert.ok(audit.summary.warningCount >= 3)
    assert.equal(audit.summary.lowConfidenceCount, 1)
    assert.equal(audit.summary.staleCount, 1)
    assert.equal(audit.summary.duplicateTitleCount, 2)
    assert.equal(audit.summary.orphanCount, 0)
    assert.ok(audit.findings.some((finding) => finding.findingId === `missing-source-key-${first.entityUid}`))
    assert.ok(audit.findings.some((finding) => finding.findingId === `duplicate-title-${second.entityUid}`))
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    assert.fail(`${response.status} ${await response.text()}`)
  }
  return response.json()
}

function memoryEventSnapshot(overrides) {
  return {
    entityUid: 'AgentMemory-1',
    title: 'Snapshot fixture',
    content: 'Snapshot fixture content.',
    memoryType: 'decision',
    project: 'mnemic',
    tags: [],
    source: 'test',
    sourceKey: 'snapshot/fixture',
    actor: 'codex',
    importance: 0.8,
    confidence: 0.9,
    observedAt: overrides.updatedAt,
    validFrom: '',
    validTo: '',
    createdAt: overrides.updatedAt,
    updatedAt: overrides.updatedAt,
    metadata: {},
    relatedMemoryUids: [],
    ...overrides,
  }
}

function memoryEventLine(eventUid, eventType, eventAt, memorySnapshot, overrides = {}) {
  return `${JSON.stringify({
    kind: 'mnemic.memory_event',
    schemaVersion: 1,
    event: {
      eventUid,
      eventType,
      eventAt,
      memoryUid: memorySnapshot.entityUid,
      targetMemoryUid: '',
      relationshipType: '',
      actor: memorySnapshot.actor,
      source: memorySnapshot.source,
      sourceKey: memorySnapshot.sourceKey,
      project: memorySnapshot.project,
      memoryType: memorySnapshot.memoryType,
      tags: memorySnapshot.tags,
      attributes: {},
      diff: { subject: 'memory', before: null, after: { title: memorySnapshot.title }, changedFields: ['title'] },
      memorySnapshot,
      ...overrides,
    },
  })}\n`
}
