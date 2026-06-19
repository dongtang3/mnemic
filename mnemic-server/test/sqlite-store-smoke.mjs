import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { AgentMemoryService } from '../dist/memoryService.js'
import { SqliteMemoryStore } from '../dist/store.js'

test('SQLite store persists memories, relations, and append-only events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-sqlite-'))
  const dbPath = join(dir, 'mnemic-memory.sqlite')
  const store = new SqliteMemoryStore(dbPath)
  const service = new AgentMemoryService(store)

  try {
    const first = await service.remember({
      title: 'SQLite storage adapter',
      content: 'Mnemic can persist the memory graph in local SQLite.',
      memoryType: 'decision',
      project: 'mnemic',
      sourceKey: 'sqlite-adapter',
      tags: ['sqlite', 'local-first'],
      importance: 0.88,
      confidence: 0.93,
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2026-12-31T23:59:59Z',
    })
    const second = await service.remember({
      title: 'JSON store remains the demo default',
      content: 'SQLite is opt-in through MNEMIC_STORE=sqlite.',
      memoryType: 'workflow',
      project: 'mnemic',
      sourceKey: 'json-default',
    })
    const third = await service.remember({
      title: 'SQLite retention warning',
      content: 'The local store should support bounded reads as memory volume grows.',
      memoryType: 'note',
      project: 'mnemic',
      sourceKey: 'sqlite-retention-warning',
      tags: ['risk'],
      importance: 0.91,
      confidence: 0.86,
      validFrom: '2025-01-01T00:00:00Z',
      validTo: '2025-12-31T23:59:59Z',
    })
    await service.link(first.entityUid, {
      targetMemoryUid: second.entityUid,
      relationshipType: 'documents',
      attributes: { reason: 'storage mode' },
    })

    const reloadedStore = new SqliteMemoryStore(dbPath)
    try {
      reloadedStore.load = async () => {
        throw new Error('SQL-native SQLite reads should not call load()')
      }
      const reloadedService = new AgentMemoryService(reloadedStore)
      const stats = await reloadedService.stats()
      assert.equal(stats.totalMemories, 3)
      assert.equal(stats.explicitRelationCount, 1)
      assert.equal(stats.eventCount, 4)
      assert.deepEqual(stats.byProject, { mnemic: 3 })
      assert.deepEqual(stats.byMemoryType, { decision: 1, note: 1, workflow: 1 })

      const recalled = await reloadedService.search({ query: 'sqlite', project: 'mnemic', memoryType: 'decision', limit: 5 })
      assert.equal(recalled.length, 1)
      assert.equal(recalled[0].sourceKey, 'sqlite-adapter')
      assert.deepEqual(recalled[0].relatedMemoryUids, [second.entityUid])

      const recalledByTag = await reloadedService.search({ query: 'local-first', tag: 'sqlite', limit: 5 })
      assert.equal(recalledByTag.length, 1)
      assert.equal(recalledByTag[0].entityUid, first.entityUid)

      const recalledAsOf2025 = await reloadedService.search({
        query: 'retention',
        project: 'mnemic',
        asOf: '2025-06-01T00:00:00Z',
        limit: 5,
      })
      assert.deepEqual(recalledAsOf2025.map((memory) => memory.entityUid), [third.entityUid])

      const recalledAsOf2026 = await reloadedService.search({
        query: 'retention',
        project: 'mnemic',
        asOf: '2026-06-01T00:00:00Z',
        limit: 5,
      })
      assert.equal(recalledAsOf2026.length, 0)

      const fetched = await reloadedService.get(first.entityUid)
      assert.equal(fetched.title, 'SQLite storage adapter')
      assert.deepEqual(fetched.relatedMemoryUids, [second.entityUid])

      const briefing = await reloadedService.briefing('mnemic', 5)
      assert.equal(briefing.recentMemories.length, 3)
      assert.deepEqual(
        briefing.highImportanceMemories.map((memory) => memory.entityUid),
        [third.entityUid, first.entityUid],
      )
      assert.deepEqual(
        briefing.openProblemMemories.map((memory) => memory.entityUid),
        [third.entityUid],
      )
      assert.match(briefing.briefing, /SQLite retention warning/)

      const timeline = await reloadedService.timeline({ project: 'mnemic', limit: 5 })
      assert.equal(timeline.entries.length, 4)
      const linkedEvent = timeline.entries.find((entry) => entry.eventType === 'memory-linked')
      assert.ok(linkedEvent)
      assert.equal(linkedEvent.memory.entityUid, first.entityUid)
      assert.equal(linkedEvent.targetMemory?.entityUid, second.entityUid)
      assert.equal(linkedEvent.diff.subject, 'relation')
      assert.equal(linkedEvent.diff.after.relationshipType, 'DOCUMENTS')

      const taggedTimeline = await reloadedService.timeline({ project: 'mnemic', tag: 'sqlite', limit: 5 })
      assert.equal(taggedTimeline.entries.length, 2)
      assert.ok(taggedTimeline.entries.every((entry) => entry.tags.includes('sqlite')))

      const noEarlyTimeline = await reloadedService.timeline({
        project: 'mnemic',
        asOf: '2000-01-01T00:00:00Z',
        limit: 5,
      })
      assert.equal(noEarlyTimeline.asOf, '2000-01-01T00:00:00.000Z')
      assert.equal(noEarlyTimeline.entries.length, 0)
    } finally {
      reloadedStore.close()
    }

    const database = new DatabaseSync(dbPath)
    try {
      const memoryRows = database
        .prepare('SELECT count(*) AS count FROM memory_records WHERE project = ?')
        .get('mnemic')
      assert.equal(memoryRows.count, 3)

      const tagRows = database
        .prepare('SELECT count(*) AS count FROM memory_tags WHERE tag = ?')
        .get('sqlite')
      assert.equal(tagRows.count, 1)

      const relationRows = database
        .prepare('SELECT count(*) AS count FROM memory_relations WHERE relationship_type = ?')
        .get('DOCUMENTS')
      assert.equal(relationRows.count, 1)

      const eventRows = database
        .prepare('SELECT count(*) AS count FROM memory_events WHERE event_type = ?')
        .get('memory-linked')
      assert.equal(eventRows.count, 1)

      const linkedEventRow = database
        .prepare('SELECT diff_json AS diffJson FROM memory_events WHERE event_type = ?')
        .get('memory-linked')
      const linkedDiff = JSON.parse(linkedEventRow.diffJson)
      assert.equal(linkedDiff.subject, 'relation')
      assert.equal(linkedDiff.after.relationshipType, 'DOCUMENTS')
    } finally {
      database.close()
    }
  } finally {
    store.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('SQLite store migrates the older metadata-only table from memory_state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mnemic-sqlite-migration-'))
  const dbPath = join(dir, 'mnemic-memory.sqlite')
  const database = new DatabaseSync(dbPath)
  const createdAt = '2026-06-17T00:00:00.000Z'
  const legacyState = {
    version: 1,
    nextSequence: 2,
    nextEventSequence: 1,
    memories: [{
      entityUid: 'AgentMemory-1',
      title: 'Legacy SQLite snapshot',
      content: 'The old SQLite adapter only indexed metadata.',
      memoryType: 'decision',
      project: 'mnemic',
      tags: ['sqlite', 'migration'],
      source: 'test',
      sourceKey: 'legacy-sqlite-snapshot',
      actor: 'codex',
      importance: 0.8,
      confidence: 0.9,
      observedAt: createdAt,
      validFrom: '',
      validTo: '',
      createdAt,
      updatedAt: createdAt,
      metadata: { migratedFrom: 'metadata-only' },
      relatedMemoryUids: [],
    }],
    relations: [],
    events: [],
  }

  try {
    database.exec(`
      CREATE TABLE memory_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE memory_records (
        entity_uid TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        project TEXT NOT NULL,
        source_key TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL
      );
    `)
    database
      .prepare('INSERT INTO memory_state (id, state_json, updated_at) VALUES (1, ?, ?)')
      .run(JSON.stringify(legacyState), createdAt)
  } finally {
    database.close()
  }

  const store = new SqliteMemoryStore(dbPath)
  try {
    const service = new AgentMemoryService(store)
    const recalled = await service.search({ query: 'metadata', project: 'mnemic', limit: 5 })
    assert.equal(recalled.length, 1)
    assert.equal(recalled[0].content, 'The old SQLite adapter only indexed metadata.')

    const stats = await service.stats()
    assert.equal(stats.totalMemories, 1)
    assert.equal(stats.eventCount, 1)
  } finally {
    store.close()
    await rm(dir, { recursive: true, force: true })
  }
})
