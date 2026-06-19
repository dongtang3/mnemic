import { mkdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  AgentMemoryEvent,
  AgentMemoryRecord,
  AgentMemoryRelation,
  AgentMemoryStats,
  AgentMemoryTimeline,
  AgentMemoryTimelineEntry,
  JsonObject,
  MnemicMemoryState,
} from './types.js'

export interface MemoryStore {
  load(): Promise<MnemicMemoryState>
  save(state: MnemicMemoryState): Promise<void>
}

export type MemorySearchParams = {
  query?: string
  project?: string
  memoryType?: string
  tag?: string
  asOf?: string
  limit?: number
}

export type MemoryTimelineParams = {
  project?: string
  memoryType?: string
  tag?: string
  asOf?: string
  limit?: number
}

export type MemoryBriefingParams = {
  project?: string
  limit?: number
}

export type MemoryBriefingSlices = {
  recentMemories: AgentMemoryRecord[]
  highImportanceMemories: AgentMemoryRecord[]
  openProblemMemories: AgentMemoryRecord[]
}

export interface QueryableMemoryStore extends MemoryStore {
  searchMemories(params: MemorySearchParams): Promise<AgentMemoryRecord[]>
  getMemory(memoryUid: string): Promise<AgentMemoryRecord | undefined>
  briefingMemories(params: MemoryBriefingParams): Promise<MemoryBriefingSlices>
  memoryStats(): Promise<AgentMemoryStats>
  memoryTimeline(params: MemoryTimelineParams): Promise<AgentMemoryTimeline>
}

export function isQueryableMemoryStore(store: MemoryStore): store is QueryableMemoryStore {
  const candidate = store as Partial<QueryableMemoryStore>
  return typeof candidate.searchMemories === 'function'
    && typeof candidate.getMemory === 'function'
    && typeof candidate.briefingMemories === 'function'
    && typeof candidate.memoryStats === 'function'
    && typeof candidate.memoryTimeline === 'function'
}

export class FileMemoryStore implements MemoryStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<MnemicMemoryState> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return normalizeState(JSON.parse(raw) as Partial<MnemicMemoryState>)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return emptyState()
      }
      throw error
    }
  }

  async save(state: MnemicMemoryState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, 'utf8')
  }
}

export class SqliteMemoryStore implements QueryableMemoryStore {
  private readonly database: DatabaseSync

  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.database = new DatabaseSync(filePath)
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS memory_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_records (
        entity_uid TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        project TEXT NOT NULL,
        source TEXT NOT NULL,
        source_key TEXT NOT NULL,
        actor TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_tags (
        memory_uid TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (memory_uid, tag),
        FOREIGN KEY (memory_uid) REFERENCES memory_records(entity_uid) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS memory_relations (
        source_memory_uid TEXT NOT NULL,
        target_memory_uid TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_memory_uid, target_memory_uid, relationship_type),
        FOREIGN KEY (source_memory_uid) REFERENCES memory_records(entity_uid) ON DELETE CASCADE,
        FOREIGN KEY (target_memory_uid) REFERENCES memory_records(entity_uid) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS memory_events (
        event_uid TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        event_at TEXT NOT NULL,
        memory_uid TEXT NOT NULL,
        target_memory_uid TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        source TEXT NOT NULL,
        source_key TEXT NOT NULL,
        project TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        diff_json TEXT NOT NULL DEFAULT '{}',
        memory_snapshot_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project);
      CREATE INDEX IF NOT EXISTS idx_memory_records_type ON memory_records(memory_type);
      CREATE INDEX IF NOT EXISTS idx_memory_records_source_key ON memory_records(source_key);
      CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag);
      CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_memory_uid);
      CREATE INDEX IF NOT EXISTS idx_memory_events_memory_uid ON memory_events(memory_uid);
      CREATE INDEX IF NOT EXISTS idx_memory_events_project ON memory_events(project);
      CREATE INDEX IF NOT EXISTS idx_memory_events_at ON memory_events(event_at);
    `)
    this.migrateLegacySqliteMetadataTable()
    this.ensureSqliteEventDiffColumn()
  }

  async load(): Promise<MnemicMemoryState> {
    const memories = this.loadMemories()
    const relations = this.loadRelations()
    const events = this.loadEvents()

    if (memories.length || relations.length || events.length) {
      return normalizeState({
        memories,
        relations,
        events,
      })
    }

    const row = this.database
      .prepare('SELECT state_json FROM memory_state WHERE id = 1')
      .get() as { state_json?: string } | undefined

    if (!row?.state_json) {
      return emptyState()
    }

    const migrated = normalizeState(JSON.parse(row.state_json) as Partial<MnemicMemoryState>)
    await this.save(migrated)
    return migrated
  }

  async save(state: MnemicMemoryState): Promise<void> {
    this.saveSync(state)
  }

  async searchMemories(params: MemorySearchParams): Promise<AgentMemoryRecord[]> {
    const boundedLimit = boundLimit(params.limit ?? 12)
    const normalizedQuery = normalizeSearchText(params.query)
    const { conditions, values } = this.filteredMemoryConditions(params)

    if (normalizedQuery) {
      const terms = normalizedQuery.split(/\s+/).filter(Boolean)
      const queryConditions = terms.map((term) => {
        const escaped = `%${escapeLike(term)}%`
        values.push(escaped, escaped, escaped, escaped, escaped, escaped, escaped)
        return `(
          LOWER(title) LIKE ? ESCAPE '\\'
          OR LOWER(content) LIKE ? ESCAPE '\\'
          OR LOWER(memory_type) LIKE ? ESCAPE '\\'
          OR LOWER(project) LIKE ? ESCAPE '\\'
          OR LOWER(source) LIKE ? ESCAPE '\\'
          OR LOWER(source_key) LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1
            FROM memory_tags query_tags
            WHERE query_tags.memory_uid = memory_records.entity_uid
              AND LOWER(query_tags.tag) LIKE ? ESCAPE '\\'
          )
        )`
      })
      conditions.push(`(${queryConditions.join(' OR ')})`)
    }

    const rows = this.database
      .prepare(`
        SELECT
          entity_uid,
          title,
          content,
          memory_type,
          project,
          source,
          source_key,
          actor,
          observed_at,
          valid_from,
          valid_to,
          created_at,
          updated_at,
          importance,
          confidence,
          metadata_json
        FROM memory_records
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ${normalizedQuery ? 'ORDER BY updated_at DESC, entity_uid' : 'ORDER BY importance DESC, updated_at DESC, entity_uid'}
        ${normalizedQuery ? '' : 'LIMIT ?'}
      `)
      .all(...(normalizedQuery ? values : [...values, boundedLimit])) as SqliteMemoryRow[]

    const memories = this.hydrateMemoryRows(rows)
      .map((memory) => ({ memory, score: scoreMemory(memory, normalizedQuery) }))
      .filter((scored) => !normalizedQuery || scored.score > 0)
      .sort((left, right) => right.score - left.score || compareUpdatedAt(right.memory, left.memory))
      .slice(0, boundedLimit)
      .map((scored) => scored.memory)

    return memories
  }

  async getMemory(memoryUid: string): Promise<AgentMemoryRecord | undefined> {
    const row = this.database
      .prepare(`
        SELECT
          entity_uid,
          title,
          content,
          memory_type,
          project,
          source,
          source_key,
          actor,
          observed_at,
          valid_from,
          valid_to,
          created_at,
          updated_at,
          importance,
          confidence,
          metadata_json
        FROM memory_records
        WHERE entity_uid = ?
      `)
      .get(memoryUid) as SqliteMemoryRow | undefined

    return row ? this.hydrateMemoryRows([row])[0] : undefined
  }

  async memoryStats(): Promise<AgentMemoryStats> {
    const totalRow = this.database
      .prepare(`
        SELECT
          COUNT(*) AS total_memories,
          COALESCE(AVG(importance), 0) AS average_importance,
          COALESCE(AVG(confidence), 0) AS average_confidence,
          COALESCE(MAX(updated_at), '') AS latest_updated_at
        FROM memory_records
      `)
      .get() as {
        total_memories: number
        average_importance: number
        average_confidence: number
        latest_updated_at: string
      }
    const relationRow = this.database
      .prepare('SELECT COUNT(*) AS relation_count FROM memory_relations')
      .get() as { relation_count: number }
    const eventRow = this.database
      .prepare(`
        SELECT
          COUNT(*) AS event_count,
          COALESCE(MAX(event_at), '') AS latest_event_at
        FROM memory_events
      `)
      .get() as { event_count: number; latest_event_at: string }

    return {
      generatedAt: new Date().toISOString(),
      totalMemories: totalRow.total_memories,
      byMemoryType: this.countMemoryColumn('memory_type'),
      byProject: this.countMemoryColumn('project'),
      averageImportance: round(totalRow.average_importance),
      averageConfidence: round(totalRow.average_confidence),
      explicitRelationCount: relationRow.relation_count,
      eventCount: eventRow.event_count,
      latestUpdatedAt: totalRow.latest_updated_at,
      latestEventAt: eventRow.latest_event_at,
    }
  }

  async briefingMemories(params: MemoryBriefingParams): Promise<MemoryBriefingSlices> {
    const boundedLimit = boundLimit(params.limit ?? 8)
    const { conditions, values } = this.filteredProjectConditions(params.project)

    const recentMemories = this.hydrateMemoryRows(this.queryMemoryRows(
      conditions,
      values,
      'updated_at DESC, entity_uid ASC',
      boundedLimit,
    ))
    const highImportanceMemories = this.hydrateMemoryRows(this.queryMemoryRows(
      [...conditions, 'importance >= ?'],
      [...values, 0.75],
      'importance DESC, updated_at DESC, entity_uid ASC',
      boundedLimit,
    ))
    const problemClause = this.problemMemoryClause()
    const openProblemMemories = this.hydrateMemoryRows(this.queryMemoryRows(
      [...conditions, problemClause.condition],
      [...values, ...problemClause.values],
      'importance DESC, updated_at DESC, entity_uid ASC',
      boundedLimit,
    ))

    return {
      recentMemories,
      highImportanceMemories,
      openProblemMemories,
    }
  }

  async memoryTimeline(params: MemoryTimelineParams): Promise<AgentMemoryTimeline> {
    const boundedLimit = boundLimit(params.limit ?? 20)
    const normalizedProject = normalizeSearchText(params.project)
    const normalizedMemoryType = normalizeSearchText(params.memoryType)
    const normalizedTag = normalizeSearchText(params.tag)
    const asOf = params.asOf?.trim() ?? ''
    const conditions: string[] = []
    const values: Array<string | number> = []

    if (normalizedProject) {
      conditions.push('LOWER(memory_events.project) = ?')
      values.push(normalizedProject)
    }
    if (normalizedMemoryType) {
      conditions.push('LOWER(memory_events.memory_type) = ?')
      values.push(normalizedMemoryType)
    }
    if (normalizedTag) {
      conditions.push("LOWER(memory_events.tags_json) LIKE ? ESCAPE '\\'")
      values.push(`%"${escapeLike(normalizedTag)}"%`)
    }
    if (asOf) {
      conditions.push('julianday(memory_events.event_at) <= julianday(?)')
      values.push(asOf)
    }

    const rows = this.database
      .prepare(`
        SELECT
          memory_events.event_uid,
          memory_events.event_type,
          memory_events.event_at,
          memory_events.memory_uid,
          memory_events.target_memory_uid,
          memory_events.relationship_type,
          memory_events.actor,
          memory_events.source,
          memory_events.source_key,
          memory_events.project,
          memory_events.memory_type,
          memory_events.tags_json,
          memory_events.attributes_json,
          memory_events.diff_json,
          memory_events.memory_snapshot_json,
          COALESCE(memory_records.importance, 0) AS current_importance
        FROM memory_events
        LEFT JOIN memory_records ON memory_records.entity_uid = memory_events.memory_uid
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY memory_events.event_at DESC, current_importance DESC, memory_events.event_uid ASC
        LIMIT ?
      `)
      .all(...values, boundedLimit) as SqliteEventRow[]

    const events = rows.map((row) => rowToEvent(row))
    const memoryUids = [...new Set(events.flatMap((event) => [
      event.memoryUid,
      event.targetMemoryUid,
    ]).filter(Boolean))]
    const memoriesByUid = new Map(this.loadMemoriesByUids(memoryUids).map((memory) => [memory.entityUid, memory]))
    const entries: AgentMemoryTimelineEntry[] = events.map((event) => {
      const memory = memoriesByUid.get(event.memoryUid) ?? event.memorySnapshot
      const targetMemory = event.targetMemoryUid ? memoriesByUid.get(event.targetMemoryUid) : undefined
      return {
        ...event,
        memory,
        targetMemory,
      }
    })

    return {
      project: params.project ?? '',
      asOf: params.asOf ?? '',
      generatedAt: new Date().toISOString(),
      entries,
    }
  }

  close(): void {
    this.database.close()
  }

  private migrateLegacySqliteMetadataTable(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(memory_records)')
      .all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))

    if (columnNames.has('content')) return

    const snapshot = this.database
      .prepare('SELECT state_json FROM memory_state WHERE id = 1')
      .get() as { state_json?: string } | undefined

    this.database.prepare('DROP TABLE IF EXISTS memory_records').run()
    this.database.exec(`
      CREATE TABLE memory_records (
        entity_uid TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        project TEXT NOT NULL,
        source TEXT NOT NULL,
        source_key TEXT NOT NULL,
        actor TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        importance REAL NOT NULL,
        confidence REAL NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project);
      CREATE INDEX IF NOT EXISTS idx_memory_records_type ON memory_records(memory_type);
      CREATE INDEX IF NOT EXISTS idx_memory_records_source_key ON memory_records(source_key);
    `)

    if (snapshot?.state_json) {
      const migrated = normalizeState(JSON.parse(snapshot.state_json) as Partial<MnemicMemoryState>)
      this.saveSync(migrated)
    }
  }

  private ensureSqliteEventDiffColumn(): void {
    const columns = this.database
      .prepare('PRAGMA table_info(memory_events)')
      .all() as Array<{ name: string }>
    const columnNames = new Set(columns.map((column) => column.name))
    if (columnNames.has('diff_json')) return

    this.database.exec(`ALTER TABLE memory_events ADD COLUMN diff_json TEXT NOT NULL DEFAULT '{}'`)
  }

  private loadMemories(): AgentMemoryRecord[] {
    const rows = this.database
      .prepare(`
        SELECT
          entity_uid,
          title,
          content,
          memory_type,
          project,
          source,
          source_key,
          actor,
          observed_at,
          valid_from,
          valid_to,
          created_at,
          updated_at,
          importance,
          confidence,
          metadata_json
        FROM memory_records
        ORDER BY entity_uid
      `)
      .all() as Array<{
        entity_uid: string
        title: string
        content: string
        memory_type: string
        project: string
        source: string
        source_key: string
        actor: string
        observed_at: string
        valid_from: string
        valid_to: string
        created_at: string
        updated_at: string
        importance: number
        confidence: number
        metadata_json: string
      }>

    return this.hydrateMemoryRows(rows)
  }

  private hydrateMemoryRows(rows: SqliteMemoryRow[]): AgentMemoryRecord[] {
    const memoryUids = rows.map((row) => row.entity_uid)
    const tagsByMemoryUid = this.loadTagsByMemoryUid(memoryUids)
    const relatedUidsByMemoryUid = this.loadRelatedUidsByMemoryUid(memoryUids)

    return rows.map((row) => normalizeMemory({
      entityUid: row.entity_uid,
      title: row.title,
      content: row.content,
      memoryType: row.memory_type,
      project: row.project,
      tags: tagsByMemoryUid.get(row.entity_uid) ?? [],
      source: row.source,
      sourceKey: row.source_key,
      actor: row.actor,
      importance: row.importance,
      confidence: row.confidence,
      observedAt: row.observed_at,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: parseJsonObject(row.metadata_json),
      relatedMemoryUids: relatedUidsByMemoryUid.get(row.entity_uid) ?? [],
    }))
  }

  private loadMemoriesByUids(memoryUids: string[]): AgentMemoryRecord[] {
    if (!memoryUids.length) return []
    const placeholders = memoryUids.map(() => '?').join(', ')
    const rows = this.database
      .prepare(`
        SELECT
          entity_uid,
          title,
          content,
          memory_type,
          project,
          source,
          source_key,
          actor,
          observed_at,
          valid_from,
          valid_to,
          created_at,
          updated_at,
          importance,
          confidence,
          metadata_json
        FROM memory_records
        WHERE entity_uid IN (${placeholders})
      `)
      .all(...memoryUids) as SqliteMemoryRow[]

    return this.hydrateMemoryRows(rows)
  }

  private queryMemoryRows(
    conditions: string[],
    values: Array<string | number>,
    orderBy: string,
    limit: number,
  ): SqliteMemoryRow[] {
    return this.database
      .prepare(`
        SELECT
          entity_uid,
          title,
          content,
          memory_type,
          project,
          source,
          source_key,
          actor,
          observed_at,
          valid_from,
          valid_to,
          created_at,
          updated_at,
          importance,
          confidence,
          metadata_json
        FROM memory_records
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY ${orderBy}
        LIMIT ?
      `)
      .all(...values, limit) as SqliteMemoryRow[]
  }

  private loadTagsByMemoryUid(memoryUids: string[]): Map<string, string[]> {
    const tagsByMemoryUid = new Map<string, string[]>()
    if (!memoryUids.length) return tagsByMemoryUid

    const placeholders = memoryUids.map(() => '?').join(', ')
    const tagRows = this.database
      .prepare(`
        SELECT memory_uid, tag
        FROM memory_tags
        WHERE memory_uid IN (${placeholders})
        ORDER BY tag
      `)
      .all(...memoryUids) as Array<{ memory_uid: string; tag: string }>
    for (const row of tagRows) {
      const tags = tagsByMemoryUid.get(row.memory_uid) ?? []
      tags.push(row.tag)
      tagsByMemoryUid.set(row.memory_uid, tags)
    }

    return tagsByMemoryUid
  }

  private loadRelatedUidsByMemoryUid(memoryUids: string[]): Map<string, string[]> {
    const relatedUidsByMemoryUid = new Map<string, string[]>()
    if (!memoryUids.length) return relatedUidsByMemoryUid

    const placeholders = memoryUids.map(() => '?').join(', ')
    const relationRows = this.database
      .prepare(`
        SELECT source_memory_uid, target_memory_uid
        FROM memory_relations
        WHERE source_memory_uid IN (${placeholders})
        ORDER BY created_at, target_memory_uid
      `)
      .all(...memoryUids) as Array<{ source_memory_uid: string; target_memory_uid: string }>
    for (const row of relationRows) {
      const related = relatedUidsByMemoryUid.get(row.source_memory_uid) ?? []
      if (!related.includes(row.target_memory_uid)) {
        related.push(row.target_memory_uid)
      }
      relatedUidsByMemoryUid.set(row.source_memory_uid, related)
    }

    return relatedUidsByMemoryUid
  }

  private filteredMemoryConditions(params: MemorySearchParams): {
    conditions: string[]
    values: Array<string | number>
  } {
    const conditions: string[] = []
    const values: Array<string | number> = []
    const normalizedProject = normalizeSearchText(params.project)
    const normalizedMemoryType = normalizeSearchText(params.memoryType)
    const normalizedTag = normalizeSearchText(params.tag)
    const asOf = params.asOf?.trim() ?? ''

    if (normalizedProject) {
      conditions.push('LOWER(project) = ?')
      values.push(normalizedProject)
    }
    if (normalizedMemoryType) {
      conditions.push('LOWER(memory_type) = ?')
      values.push(normalizedMemoryType)
    }
    if (normalizedTag) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM memory_tags filter_tags
          WHERE filter_tags.memory_uid = memory_records.entity_uid
            AND LOWER(filter_tags.tag) = ?
        )
      `)
      values.push(normalizedTag)
    }
    if (asOf) {
      conditions.push("(valid_from = '' OR julianday(valid_from) <= julianday(?))")
      values.push(asOf)
      conditions.push("(valid_to = '' OR julianday(valid_to) >= julianday(?))")
      values.push(asOf)
    }

    return { conditions, values }
  }

  private filteredProjectConditions(project: string | undefined): {
    conditions: string[]
    values: Array<string | number>
  } {
    const normalizedProject = normalizeSearchText(project)
    if (!normalizedProject) {
      return { conditions: [], values: [] }
    }
    return {
      conditions: ['LOWER(project) = ?'],
      values: [normalizedProject],
    }
  }

  private problemMemoryClause(): {
    condition: string
    values: string[]
  } {
    const values: string[] = []
    const clauses = ['problem', 'error', 'bug', 'blocker', 'risk'].map((token) => {
      const escaped = `%${escapeLike(token)}%`
      values.push(escaped, escaped, escaped)
      return `(
        LOWER(memory_type) LIKE ? ESCAPE '\\'
        OR LOWER(title) LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM memory_tags problem_tags
          WHERE problem_tags.memory_uid = memory_records.entity_uid
            AND LOWER(problem_tags.tag) LIKE ? ESCAPE '\\'
        )
      )`
    })
    return {
      condition: `(${clauses.join(' OR ')})`,
      values,
    }
  }

  private countMemoryColumn(column: 'memory_type' | 'project'): Record<string, number> {
    const rows = this.database
      .prepare(`
        SELECT
          CASE WHEN ${column} = '' THEN '(none)' ELSE ${column} END AS key,
          COUNT(*) AS count
        FROM memory_records
        GROUP BY key
        ORDER BY key
      `)
      .all() as Array<{ key: string; count: number }>

    return Object.fromEntries(rows.map((row) => [row.key, row.count]))
  }

  private loadRelations(): AgentMemoryRelation[] {
    const rows = this.database
      .prepare(`
        SELECT
          source_memory_uid,
          target_memory_uid,
          relationship_type,
          attributes_json,
          created_at
        FROM memory_relations
        ORDER BY created_at, source_memory_uid, target_memory_uid, relationship_type
      `)
      .all() as Array<{
        source_memory_uid: string
        target_memory_uid: string
        relationship_type: string
        attributes_json: string
        created_at: string
      }>

    return rows.map((row) => normalizeRelation({
      sourceMemoryUid: row.source_memory_uid,
      targetMemoryUid: row.target_memory_uid,
      relationshipType: row.relationship_type,
      attributes: parseJsonObject(row.attributes_json),
      createdAt: row.created_at,
    }))
  }

  private loadEvents(): AgentMemoryEvent[] {
    const rows = this.database
      .prepare(`
        SELECT
          event_uid,
          event_type,
          event_at,
          memory_uid,
          target_memory_uid,
          relationship_type,
          actor,
          source,
          source_key,
          project,
          memory_type,
          tags_json,
          attributes_json,
          diff_json,
          memory_snapshot_json
        FROM memory_events
        ORDER BY event_at, event_uid
      `)
      .all() as Array<{
        event_uid: string
        event_type: AgentMemoryEvent['eventType']
        event_at: string
        memory_uid: string
        target_memory_uid: string
        relationship_type: string
        actor: string
        source: string
        source_key: string
        project: string
        memory_type: string
        tags_json: string
        attributes_json: string
        diff_json: string
        memory_snapshot_json: string
      }>

    return rows.map((row) => normalizeEvent({
      eventUid: row.event_uid,
      eventType: row.event_type,
      eventAt: row.event_at,
      memoryUid: row.memory_uid,
      targetMemoryUid: row.target_memory_uid,
      relationshipType: row.relationship_type,
      actor: row.actor,
      source: row.source,
      sourceKey: row.source_key,
      project: row.project,
      memoryType: row.memory_type,
      tags: parseJsonArray(row.tags_json),
      attributes: parseJsonObject(row.attributes_json),
      diff: parseEventDiff(row.diff_json),
      memorySnapshot: parseJsonObject(row.memory_snapshot_json) as unknown as AgentMemoryRecord,
    }))
  }

  private saveSync(state: MnemicMemoryState): void {
    const normalized = normalizeState(state)
    const serialized = JSON.stringify(normalized)
    const updatedAt = new Date().toISOString()

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database
        .prepare(`
          INSERT INTO memory_state (id, state_json, updated_at)
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            state_json = excluded.state_json,
            updated_at = excluded.updated_at
        `)
        .run(serialized, updatedAt)

      this.replaceNormalizedRows(normalized)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private replaceNormalizedRows(normalized: MnemicMemoryState): void {
    this.database.prepare('DELETE FROM memory_records').run()
    this.database.prepare('DELETE FROM memory_tags').run()
    this.database.prepare('DELETE FROM memory_relations').run()
    this.database.prepare('DELETE FROM memory_events').run()
    const insertMemory = this.database.prepare(`
      INSERT INTO memory_records (
        entity_uid,
        title,
        content,
        memory_type,
        project,
        source,
        source_key,
        actor,
        observed_at,
        valid_from,
        valid_to,
        created_at,
        updated_at,
        importance,
        confidence,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertTag = this.database.prepare(`
      INSERT INTO memory_tags (memory_uid, tag)
      VALUES (?, ?)
    `)
    const insertRelation = this.database.prepare(`
      INSERT INTO memory_relations (
        source_memory_uid,
        target_memory_uid,
        relationship_type,
        attributes_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `)
    const insertEvent = this.database.prepare(`
      INSERT INTO memory_events (
        event_uid,
        event_type,
        event_at,
        memory_uid,
        target_memory_uid,
        relationship_type,
        actor,
        source,
        source_key,
        project,
        memory_type,
        tags_json,
        attributes_json,
        diff_json,
        memory_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const memory of normalized.memories) {
      insertMemory.run(
        memory.entityUid,
        memory.title,
        memory.content,
        memory.memoryType,
        memory.project,
        memory.source,
        memory.sourceKey,
        memory.actor,
        memory.observedAt,
        memory.validFrom,
        memory.validTo,
        memory.createdAt,
        memory.updatedAt,
        memory.importance,
        memory.confidence,
        JSON.stringify(memory.metadata),
      )
      for (const tag of memory.tags) {
        insertTag.run(memory.entityUid, tag)
      }
    }

    for (const relation of normalized.relations) {
      insertRelation.run(
        relation.sourceMemoryUid,
        relation.targetMemoryUid,
        relation.relationshipType,
        JSON.stringify(relation.attributes),
        relation.createdAt,
      )
    }

    for (const event of normalized.events) {
      insertEvent.run(
        event.eventUid,
        event.eventType,
        event.eventAt,
        event.memoryUid,
        event.targetMemoryUid,
        event.relationshipType,
        event.actor,
        event.source,
        event.sourceKey,
        event.project,
        event.memoryType,
        JSON.stringify(event.tags),
        JSON.stringify(event.attributes),
        JSON.stringify(event.diff),
        JSON.stringify(event.memorySnapshot),
      )
    }
  }
}

type SqliteMemoryRow = {
  entity_uid: string
  title: string
  content: string
  memory_type: string
  project: string
  source: string
  source_key: string
  actor: string
  observed_at: string
  valid_from: string
  valid_to: string
  created_at: string
  updated_at: string
  importance: number
  confidence: number
  metadata_json: string
}

type SqliteEventRow = {
  event_uid: string
  event_type: AgentMemoryEvent['eventType']
  event_at: string
  memory_uid: string
  target_memory_uid: string
  relationship_type: string
  actor: string
  source: string
  source_key: string
  project: string
  memory_type: string
  tags_json: string
  attributes_json: string
  diff_json: string
  memory_snapshot_json: string
  current_importance: number
}

function rowToEvent(row: SqliteEventRow): AgentMemoryEvent {
  return normalizeEvent({
    eventUid: row.event_uid,
    eventType: row.event_type,
    eventAt: row.event_at,
    memoryUid: row.memory_uid,
    targetMemoryUid: row.target_memory_uid,
    relationshipType: row.relationship_type,
    actor: row.actor,
    source: row.source,
    sourceKey: row.source_key,
    project: row.project,
    memoryType: row.memory_type,
    tags: parseJsonArray(row.tags_json),
    attributes: parseJsonObject(row.attributes_json),
    diff: parseEventDiff(row.diff_json),
    memorySnapshot: parseJsonObject(row.memory_snapshot_json) as unknown as AgentMemoryRecord,
  })
}

export function emptyState(): MnemicMemoryState {
  return {
    version: 1,
    nextSequence: 1,
    nextEventSequence: 1,
    memories: [],
    relations: [],
    events: [],
  }
}

export function normalizeState(state: Partial<MnemicMemoryState>): MnemicMemoryState {
  const memories = Array.isArray(state.memories) ? state.memories.map(normalizeMemory) : []
  const relations = Array.isArray(state.relations) ? state.relations.map(normalizeRelation) : []
  const events = Array.isArray(state.events) && state.events.length
    ? state.events.map(normalizeEvent)
    : memories.map((memory, index) => migratedMemoryEvent(memory, index + 1))
  const maxSequence = memories.reduce((max, memory) => {
    const match = /^AgentMemory-(\d+)$/.exec(memory.entityUid)
    return match ? Math.max(max, Number(match[1]) + 1) : max
  }, 1)
  const maxEventSequence = events.reduce((max, event) => {
    const match = /^MemoryEvent-(\d+)$/.exec(event.eventUid)
    return match ? Math.max(max, Number(match[1]) + 1) : max
  }, 1)
  return {
    version: 1,
    nextSequence: Math.max(state.nextSequence ?? 1, maxSequence),
    nextEventSequence: Math.max(state.nextEventSequence ?? 1, maxEventSequence),
    memories,
    relations,
    events,
  }
}

function normalizeMemory(memory: Partial<AgentMemoryRecord>): AgentMemoryRecord {
  return {
    entityUid: stringValue(memory.entityUid),
    title: stringValue(memory.title),
    content: stringValue(memory.content),
    memoryType: stringValue(memory.memoryType, 'note'),
    project: stringValue(memory.project),
    tags: Array.isArray(memory.tags) ? memory.tags.map(String).filter(Boolean) : [],
    source: stringValue(memory.source),
    sourceKey: stringValue(memory.sourceKey),
    actor: stringValue(memory.actor),
    importance: numberValue(memory.importance, 0.5),
    confidence: numberValue(memory.confidence, 0.7),
    observedAt: stringValue(memory.observedAt),
    validFrom: stringValue(memory.validFrom),
    validTo: stringValue(memory.validTo),
    createdAt: stringValue(memory.createdAt),
    updatedAt: stringValue(memory.updatedAt),
    metadata: isPlainObject(memory.metadata) ? memory.metadata : {},
    relatedMemoryUids: Array.isArray(memory.relatedMemoryUids)
      ? memory.relatedMemoryUids.map(String).filter(Boolean)
      : [],
  }
}

function normalizeRelation(relation: Partial<AgentMemoryRelation>): AgentMemoryRelation {
  return {
    sourceMemoryUid: stringValue(relation.sourceMemoryUid),
    targetMemoryUid: stringValue(relation.targetMemoryUid),
    relationshipType: stringValue(relation.relationshipType, 'MEMORY_RELATED_TO'),
    attributes: isPlainObject(relation.attributes) ? relation.attributes : {},
    createdAt: stringValue(relation.createdAt),
  }
}

function normalizeEvent(event: Partial<AgentMemoryEvent>): AgentMemoryEvent {
  const memorySnapshot = normalizeMemory(event.memorySnapshot ?? {})
  return {
    eventUid: stringValue(event.eventUid),
    eventType: event.eventType === 'memory-updated'
      || event.eventType === 'memory-linked'
      || event.eventType === 'memory-rolled-back'
      ? event.eventType
      : 'memory-created',
    eventAt: stringValue(event.eventAt, memorySnapshot.updatedAt || memorySnapshot.createdAt),
    memoryUid: stringValue(event.memoryUid, memorySnapshot.entityUid),
    targetMemoryUid: stringValue(event.targetMemoryUid),
    relationshipType: stringValue(event.relationshipType),
    actor: stringValue(event.actor, memorySnapshot.actor),
    source: stringValue(event.source, memorySnapshot.source),
    sourceKey: stringValue(event.sourceKey, memorySnapshot.sourceKey),
    project: stringValue(event.project, memorySnapshot.project),
    memoryType: stringValue(event.memoryType, memorySnapshot.memoryType),
    tags: Array.isArray(event.tags) ? event.tags.map(String).filter(Boolean) : memorySnapshot.tags,
    attributes: isPlainObject(event.attributes) ? event.attributes : {},
    diff: normalizeEventDiff(event.diff),
    memorySnapshot,
  }
}

function parseEventDiff(value: string): AgentMemoryEvent['diff'] {
  return normalizeEventDiff(parseJsonObject(value))
}

function normalizeEventDiff(value: unknown): AgentMemoryEvent['diff'] {
  if (!isPlainObject(value)) {
    return emptyEventDiff()
  }

  const subject = value.subject === 'memory'
    || value.subject === 'relation'
    || value.subject === 'state'
    || value.subject === 'none'
    ? value.subject
    : 'none'

  return {
    subject,
    before: value.before === null || isPlainObject(value.before) ? value.before : null,
    after: value.after === null || isPlainObject(value.after) ? value.after : null,
    changedFields: Array.isArray(value.changedFields) ? value.changedFields.map(String).filter(Boolean) : [],
  }
}

function emptyEventDiff(): AgentMemoryEvent['diff'] {
  return {
    subject: 'none',
    before: null,
    after: null,
    changedFields: [],
  }
}

function migratedMemoryEvent(memory: AgentMemoryRecord, index: number): AgentMemoryEvent {
  return {
    eventUid: `MemoryEvent-${index}`,
    eventType: memory.updatedAt && memory.createdAt && memory.updatedAt !== memory.createdAt
      ? 'memory-updated'
      : 'memory-created',
    eventAt: memory.updatedAt || memory.createdAt || memory.observedAt,
    memoryUid: memory.entityUid,
    targetMemoryUid: '',
    relationshipType: '',
    actor: memory.actor,
    source: memory.source || 'migration',
    sourceKey: memory.sourceKey,
    project: memory.project,
    memoryType: memory.memoryType,
    tags: memory.tags,
    attributes: { migrated: true },
    diff: emptyEventDiff(),
    memorySnapshot: memory,
  }
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function scoreMemory(record: AgentMemoryRecord, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 1 + record.importance
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const haystack = normalizeSearchText([
    record.title,
    record.content,
    record.memoryType,
    record.project,
    record.source,
    record.sourceKey,
    ...record.tags,
  ].join(' '))
  let value = 0
  for (const term of terms) {
    if (haystack.includes(term)) value += 1
  }
  if (normalizeSearchText(record.title).includes(normalizedQuery)) value += 3
  if (normalizeSearchText(record.content).includes(normalizedQuery)) value += 2
  if (value === 0) return 0
  return value + Math.max(0, record.importance)
}

function compareUpdatedAt(left: AgentMemoryRecord, right: AgentMemoryRecord): number {
  return (left.updatedAt || '').localeCompare(right.updatedAt || '')
}

function boundLimit(limit: number): number {
  return Math.max(1, Math.min(limit, 50))
}

function normalizeSearchText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function parseJsonObject(raw: string): JsonObject {
  try {
    const value = JSON.parse(raw) as unknown
    return isPlainObject(value) ? value : {}
  } catch {
    return {}
  }
}

function parseJsonArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown
    return Array.isArray(value) ? value.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}
