import type {
  AgentMemoryBriefing,
  AgentMemoryContextPack,
  AgentMemoryEvent,
  AgentMemoryEventDiff,
  AgentMemoryEventType,
  AgentMemoryJsonlExport,
  AgentMemoryJsonlExportLine,
  AgentMemoryJsonlImportRequest,
  AgentMemoryJsonlImportResult,
  AgentMemoryPolicyConfig,
  AgentMemoryPolicyFinding,
  AgentMemoryPolicySource,
  AgentMemoryPolicyStatus,
  AgentMemoryResolvedPolicyConfig,
  AgentMemoryAudit,
  AgentMemoryAuditFinding,
  AgentMemoryRecallExplanation,
  AgentMemoryRecallExplanationEntry,
  AgentMemoryRecord,
  AgentMemoryRelation,
  AgentMemoryRelationPath,
  AgentMemoryRelationRequest,
  AgentMemoryRequest,
  AgentMemoryRollbackOperation,
  AgentMemoryRollbackPreview,
  AgentMemoryRollbackRequest,
  AgentMemoryRollbackResult,
  AgentMemoryRollbackStateSummary,
  AgentMemoryStats,
  AgentMemoryTimeline,
  AgentMemoryWritePreview,
  AgentMemorySecretPattern,
  AgentMemorySnapshot,
  JsonObject,
  MnemicMemoryState,
} from './types.js'
import { isQueryableMemoryStore, type MemoryStore } from './store.js'

const maxContextContentChars = 900
const maxSearchLimit = 50
const defaultRelationType = 'MEMORY_RELATED_TO'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export class AgentMemoryService {
  private readonly policyConfig: ResolvedMemoryPolicyConfig

  constructor(
    private readonly store: MemoryStore,
    policyConfig: AgentMemoryPolicyConfig = {},
    private readonly policySource: AgentMemoryPolicySource = { kind: 'constructor', policyFile: '' },
  ) {
    this.policyConfig = resolvePolicyConfig(policyConfig)
  }

  policyStatus(): AgentMemoryPolicyStatus {
    return {
      generatedAt: new Date().toISOString(),
      source: this.policySource,
      config: serializePolicyConfig(this.policyConfig),
    }
  }

  async remember(request: AgentMemoryRequest): Promise<AgentMemoryRecord> {
    assertNonBlank(request.title, 'title is required')
    assertNonBlank(request.content, 'content is required')

    const state = await this.store.load()
    const now = new Date().toISOString()
    const policyFindings = evaluateMemoryPolicy(request, now, this.policyConfig)
    assertPolicyAllowsWrite(policyFindings)
    const plan = buildRememberPlan(state, request, now)

    if (plan.existingIndex >= 0) {
      state.memories[plan.existingIndex] = plan.record
    } else {
      state.memories.push(plan.record)
      state.nextSequence += 1
    }

    this.linkExistingTargets(state, plan.record.entityUid, request.relatedMemoryUids ?? [], now)
    this.applyDerivedRelations(state)
    const savedRecord = requireMemory(state, plan.record.entityUid)
    this.appendMemoryEvent(state, plan.eventType, savedRecord, now, {
      source: savedRecord.source,
      sourceKey: savedRecord.sourceKey,
      diff: memoryEventDiff(plan.previousMemory, savedRecord),
    })
    await this.store.save(state)
    return withPolicyFindings(savedRecord, policyFindings)
  }

  async previewRemember(request: AgentMemoryRequest): Promise<AgentMemoryWritePreview> {
    assertNonBlank(request.title, 'title is required')
    assertNonBlank(request.content, 'content is required')

    const state = await this.store.load()
    const normalized = normalizeLoadedState(state)
    const now = new Date().toISOString()
    const policyFindings = evaluateMemoryPolicy(request, now, this.policyConfig)
    const plan = buildRememberPlan(normalized, request, now)
    const previewState = normalizeLoadedState(normalized)

    if (plan.existingIndex >= 0) {
      previewState.memories[plan.existingIndex] = plan.record
    } else {
      previewState.memories.push(plan.record)
      previewState.nextSequence += 1
    }

    const relationPreviews = previewRelationLinks(previewState, plan.record.entityUid, request.relatedMemoryUids ?? [], now)
    const linkedTargetUids = relationPreviews
      .filter((relation) => !relation.alreadyExists)
      .map((relation) => relation.targetMemoryUid)
    this.linkExistingTargets(previewState, plan.record.entityUid, linkedTargetUids, now)
    this.applyDerivedRelations(previewState)
    const afterMemory = requireMemory(previewState, plan.record.entityUid)
    const warnings = previewWarnings(request, plan, relationPreviews, policyFindings)

    return {
      generatedAt: now,
      dryRun: true,
      action: plan.existing ? 'update' : 'create',
      eventType: plan.eventType,
      wouldAppendEventUid: `MemoryEvent-${normalized.nextEventSequence}`,
      memoryUid: afterMemory.entityUid,
      sourceKeyMatched: Boolean(plan.existing),
      beforeMemory: plan.previousMemory,
      afterMemory,
      diff: memoryEventDiff(plan.previousMemory, afterMemory),
      relationPreviews,
      policyFindings,
      warnings,
      before: summarizeState(normalized),
      after: summarizeState(previewState),
    }
  }

  async search(params: {
    query?: string
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
    limit?: number
  }): Promise<AgentMemoryRecord[]> {
    const asOf = parseOptionalInstant(params.asOf, 'asOf')
    if (isQueryableMemoryStore(this.store)) {
      return this.store.searchMemories({ ...params, asOf })
    }

    const state = await this.store.load()
    const boundedLimit = boundLimit(params.limit ?? 12)
    const normalizedQuery = normalize(params.query)
    const normalizedProject = normalize(params.project)
    const normalizedMemoryType = normalize(params.memoryType)
    const normalizedTag = normalize(params.tag)

    return state.memories
      .map((memory) => this.withDerivedRelations(memory, state))
      .filter((memory) => matches(memory.project, normalizedProject))
      .filter((memory) => matches(memory.memoryType, normalizedMemoryType))
      .filter((memory) => !normalizedTag || memory.tags.some((tag) => normalize(tag) === normalizedTag))
      .filter((memory) => isMemoryValidAt(memory, asOf))
      .map((memory) => ({ memory, score: score(memory, normalizedQuery) }))
      .filter((scored) => !normalizedQuery || scored.score > 0)
      .sort((left, right) => right.score - left.score || compareUpdatedAt(right.memory, left.memory))
      .slice(0, boundedLimit)
      .map((scored) => scored.memory)
  }

  async audit(project?: string): Promise<AgentMemoryAudit> {
    const state = withDerivedRelations(normalizeLoadedState(await this.store.load()))
    const normalizedProject = normalize(project)
    const memories = state.memories
      .filter((memory) => matches(memory.project, normalizedProject))
      .sort((left, right) => left.entityUid.localeCompare(right.entityUid))
    const findings = auditMemoryState(memories, state, this.policyConfig)
    const summary = summarizeAuditFindings(findings)

    return {
      generatedAt: new Date().toISOString(),
      project: project ?? '',
      totalMemories: memories.length,
      healthScore: auditHealthScore(memories.length, summary),
      summary,
      findings,
    }
  }

  async explainRecall(params: {
    query?: string
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
    limit?: number
  }): Promise<AgentMemoryRecallExplanation> {
    const asOf = parseOptionalInstant(params.asOf, 'asOf')
    const state = withDerivedRelations(normalizeLoadedState(await this.store.load()))
    const boundedLimit = boundLimit(params.limit ?? 8)
    const normalizedQuery = normalize(params.query)
    const normalizedProject = normalize(params.project)
    const normalizedMemoryType = normalize(params.memoryType)
    const normalizedTag = normalize(params.tag)
    const entries = state.memories
      .filter((memory) => matches(memory.project, normalizedProject))
      .filter((memory) => matches(memory.memoryType, normalizedMemoryType))
      .filter((memory) => !normalizedTag || memory.tags.some((tag) => normalize(tag) === normalizedTag))
      .filter((memory) => isMemoryValidAt(memory, asOf))
      .map((memory) => explainMemoryRecall(memory, state, normalizedQuery))
      .filter((entry) => !normalizedQuery || entry.lexicalScore > 0)
      .sort((left, right) => right.score - left.score || compareUpdatedAt(right.memory, left.memory))
      .slice(0, boundedLimit)

    return {
      query: params.query ?? '',
      project: params.project ?? '',
      asOf: asOf ?? '',
      generatedAt: new Date().toISOString(),
      entries,
    }
  }

  async get(memoryUid: string): Promise<AgentMemoryRecord> {
    if (isQueryableMemoryStore(this.store)) {
      const memory = await this.store.getMemory(memoryUid)
      if (!memory) {
        throw new HttpError(404, `Agent memory not found: ${memoryUid}`)
      }
      return memory
    }

    const state = await this.store.load()
    return this.withDerivedRelations(requireMemory(state, memoryUid), state)
  }

  async link(memoryUid: string, request: AgentMemoryRelationRequest): Promise<AgentMemoryRecord> {
    assertNonBlank(request.targetMemoryUid, 'targetMemoryUid is required')
    const state = await this.store.load()
    const source = requireMemory(state, memoryUid)
    const target = requireMemory(state, request.targetMemoryUid)
    const relationshipType = sanitizeRelationshipType(request.relationshipType)
    const exists = state.relations.some((relation) =>
      relation.sourceMemoryUid === source.entityUid
      && relation.targetMemoryUid === target.entityUid
      && relation.relationshipType === relationshipType)

    const now = new Date().toISOString()
    if (!exists) {
      const relation = {
        sourceMemoryUid: source.entityUid,
        targetMemoryUid: target.entityUid,
        relationshipType,
        attributes: isJsonObject(request.attributes) ? request.attributes : {},
        createdAt: now,
      }
      state.relations.push(relation)
    }

    this.applyDerivedRelations(state)
    const savedSource = requireMemory(state, source.entityUid)
    if (!exists) {
      const savedRelation = requireRelation(state, source.entityUid, target.entityUid, relationshipType)
      this.appendMemoryEvent(state, 'memory-linked', savedSource, now, {
        targetMemoryUid: target.entityUid,
        relationshipType,
        attributes: isJsonObject(request.attributes) ? request.attributes : {},
        diff: relationEventDiff(undefined, savedRelation),
      })
    }
    await this.store.save(state)
    return savedSource
  }

  async contextPack(query?: string, project?: string, limit?: number, asOfParam?: string): Promise<AgentMemoryContextPack> {
    const asOf = parseOptionalInstant(asOfParam, 'asOf')
    const memories = await this.search({ query, project, limit: limit ?? 8, asOf })
    const generatedAt = new Date().toISOString()
    const lines = [
      'Mnemic Agent Memory Context Pack',
      `Query: ${query && query.trim() ? query : '(none)'}`,
      `Project: ${project && project.trim() ? project : '(any)'}`,
      `As of: ${asOf || '(current validity)'}`,
      `Generated at: ${generatedAt}`,
      '',
    ]

    for (const memory of memories) {
      lines.push(`- [${memory.memoryType}] ${memory.title} (uid=${memory.entityUid}, importance=${memory.importance}${memory.project ? `, project=${memory.project}` : ''}${memory.tags.length ? `, tags=${memory.tags.join('|')}` : ''})`)
      lines.push(`  Content: ${truncate(memory.content, maxContextContentChars)}`)
      if (memory.source) lines.push(`  Source: ${memory.source}`)
      if (memory.sourceKey) lines.push(`  Source key: ${memory.sourceKey}`)
      if (memory.relatedMemoryUids.length) lines.push(`  Related: ${memory.relatedMemoryUids.join(', ')}`)
      lines.push(`  Confidence: ${memory.confidence}`)
      if (memory.observedAt) lines.push(`  Observed at: ${memory.observedAt}`)
      if (memory.validFrom || memory.validTo) {
        lines.push(`  Valid: ${memory.validFrom || 'unknown'} -> ${memory.validTo || 'open'}`)
      }
    }

    return {
      query: query ?? '',
      project: project ?? '',
      asOf: asOf ?? '',
      generatedAt,
      memories,
      context: lines.join('\n').trim(),
    }
  }

  async briefing(project?: string, limit?: number): Promise<AgentMemoryBriefing> {
    if (isQueryableMemoryStore(this.store)) {
      const generatedAt = new Date().toISOString()
      const slices = await this.store.briefingMemories({ project, limit })
      return {
        project: project ?? '',
        generatedAt,
        recentMemories: slices.recentMemories,
        highImportanceMemories: slices.highImportanceMemories,
        openProblemMemories: slices.openProblemMemories,
        briefing: formatBriefing(
          project,
          generatedAt,
          slices.recentMemories,
          slices.highImportanceMemories,
          slices.openProblemMemories,
        ),
      }
    }

    const state = await this.store.load()
    const boundedLimit = boundLimit(limit ?? 8)
    const normalizedProject = normalize(project)
    const projectMemories = state.memories
      .map((memory) => this.withDerivedRelations(memory, state))
      .filter((memory) => matches(memory.project, normalizedProject))

    const recentMemories = [...projectMemories]
      .sort((left, right) => compareUpdatedAt(right, left))
      .slice(0, boundedLimit)
    const highImportanceMemories = [...projectMemories]
      .filter((memory) => memory.importance >= 0.75)
      .sort((left, right) => right.importance - left.importance || compareUpdatedAt(right, left))
      .slice(0, boundedLimit)
    const openProblemMemories = [...projectMemories]
      .filter(isProblemMemory)
      .sort((left, right) => right.importance - left.importance || compareUpdatedAt(right, left))
      .slice(0, boundedLimit)
    const generatedAt = new Date().toISOString()

    return {
      project: project ?? '',
      generatedAt,
      recentMemories,
      highImportanceMemories,
      openProblemMemories,
      briefing: formatBriefing(project, generatedAt, recentMemories, highImportanceMemories, openProblemMemories),
    }
  }

  async stats(): Promise<AgentMemoryStats> {
    if (isQueryableMemoryStore(this.store)) {
      return this.store.memoryStats()
    }

    const state = await this.store.load()
    const memories = state.memories.map((memory) => this.withDerivedRelations(memory, state))
    return {
      generatedAt: new Date().toISOString(),
      totalMemories: memories.length,
      byMemoryType: countBy(memories, (memory) => valueOrDefault(memory.memoryType, '(none)')),
      byProject: countBy(memories, (memory) => valueOrDefault(memory.project, '(none)')),
      averageImportance: round(average(memories.map((memory) => memory.importance))),
      averageConfidence: round(average(memories.map((memory) => memory.confidence))),
      explicitRelationCount: state.relations.length,
      eventCount: state.events.length,
      latestUpdatedAt: memories.map((memory) => memory.updatedAt).filter(Boolean).sort().at(-1) ?? '',
      latestEventAt: state.events.map((event) => event.eventAt).filter(Boolean).sort().at(-1) ?? '',
    }
  }

  async timeline(params: {
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
    limit?: number
  }): Promise<AgentMemoryTimeline> {
    const asOf = parseOptionalInstant(params.asOf, 'asOf')
    if (isQueryableMemoryStore(this.store)) {
      return this.store.memoryTimeline({ ...params, asOf })
    }

    const state = await this.store.load()
    const boundedLimit = boundLimit(params.limit ?? 20)
    const normalizedProject = normalize(params.project)
    const normalizedMemoryType = normalize(params.memoryType)
    const normalizedTag = normalize(params.tag)
    const memoriesByUid = new Map(state.memories
      .map((memory) => this.withDerivedRelations(memory, state))
      .map((memory) => [memory.entityUid, memory]))
    const entries = state.events
      .map((event) => {
        const memory = memoriesByUid.get(event.memoryUid) ?? event.memorySnapshot
        const targetMemory = event.targetMemoryUid ? memoriesByUid.get(event.targetMemoryUid) : undefined
        return {
          ...event,
          memory,
          targetMemory,
        }
      })
      .filter((memory) => matches(memory.project, normalizedProject))
      .filter((memory) => matches(memory.memoryType, normalizedMemoryType))
      .filter((event) => !normalizedTag || event.tags.some((tag) => normalize(tag) === normalizedTag))
      .filter((event) => isInstantAtOrBefore(event.eventAt, asOf))
      .sort((left, right) => right.eventAt.localeCompare(left.eventAt) || right.memory.importance - left.memory.importance)
      .slice(0, boundedLimit)

    return {
      project: params.project ?? '',
      asOf: asOf ?? '',
      generatedAt: new Date().toISOString(),
      entries,
    }
  }

  async exportJsonl(params: {
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
    limit?: number
  }): Promise<AgentMemoryJsonlExport> {
    const asOf = parseOptionalInstant(params.asOf, 'asOf')
    const state = await this.store.load()
    const generatedAt = new Date().toISOString()
    const events = filterEvents(state.events, { ...params, asOf })
      .slice(0, exportLimit(params.limit))
    const lines: AgentMemoryJsonlExportLine[] = events.map((event) => ({
      kind: 'mnemic.memory_event',
      schemaVersion: 1,
      exportedAt: generatedAt,
      event,
    }))

    return {
      format: 'jsonl',
      generatedAt,
      project: params.project ?? '',
      memoryType: params.memoryType ?? '',
      tag: params.tag ?? '',
      asOf: asOf ?? '',
      lineCount: lines.length,
      jsonl: lines.map((line) => JSON.stringify(line)).join('\n') + (lines.length ? '\n' : ''),
    }
  }

  async snapshot(params: {
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
    limit?: number
  }): Promise<AgentMemorySnapshot> {
    const asOf = parseOptionalInstant(params.asOf, 'asOf')
    const state = normalizeLoadedState(await this.store.load())
    const replayed = replayEvents(state.events.filter((event) => isInstantAtOrBefore(event.eventAt, asOf)))
    const normalizedProject = normalize(params.project)
    const normalizedMemoryType = normalize(params.memoryType)
    const normalizedTag = normalize(params.tag)
    const boundedLimit = boundLimit(params.limit ?? maxSearchLimit)
    const matchingMemories = replayed.memories
      .filter((memory) => matches(memory.project, normalizedProject))
      .filter((memory) => matches(memory.memoryType, normalizedMemoryType))
      .filter((memory) => !normalizedTag || memory.tags.some((tag) => normalize(tag) === normalizedTag))
      .sort((left, right) => compareUpdatedAt(right, left) || left.entityUid.localeCompare(right.entityUid))
      .slice(0, boundedLimit)
    const visibleMemoryUids = new Set(matchingMemories.map((memory) => memory.entityUid))
    const relations = replayed.relations.filter((relation) =>
      visibleMemoryUids.has(relation.sourceMemoryUid) && visibleMemoryUids.has(relation.targetMemoryUid))

    return {
      generatedAt: new Date().toISOString(),
      asOf: asOf ?? '',
      project: params.project ?? '',
      memoryType: params.memoryType ?? '',
      tag: params.tag ?? '',
      eventCount: replayed.events.length,
      latestEventAt: replayed.events.map((event) => event.eventAt).filter(Boolean).sort().at(-1) ?? '',
      memoryCount: matchingMemories.length,
      relationCount: relations.length,
      memories: matchingMemories,
      relations,
    }
  }

  async importJsonl(request: AgentMemoryJsonlImportRequest): Promise<AgentMemoryJsonlImportResult> {
    assertNonBlank(request.jsonl, 'jsonl is required')
    const state = await this.store.load()
    const normalized = normalizeLoadedState(state)
    const parsedEvents = parseJsonlEvents(request.jsonl)
    const existingEventsByUid = new Map(normalized.events.map((event) => [event.eventUid, event]))
    const importedEvents: AgentMemoryEvent[] = []
    const skippedDuplicateEventUids: string[] = []

    for (const event of parsedEvents) {
      const existing = existingEventsByUid.get(event.eventUid)
      if (existing) {
        if (stableJson(existing) !== stableJson(event)) {
          throw new HttpError(409, `Imported event ${event.eventUid} conflicts with an existing event.`)
        }
        skippedDuplicateEventUids.push(event.eventUid)
        continue
      }
      existingEventsByUid.set(event.eventUid, event)
      importedEvents.push(event)
    }

    const mergedEvents = [...normalized.events, ...importedEvents]
    const afterState = stateFromEvents(mergedEvents, normalized)
    const confirmed = request.confirm === true
    const applied = confirmed && importedEvents.length > 0

    if (applied) {
      await this.store.save(afterState)
    }

    return {
      generatedAt: new Date().toISOString(),
      applied,
      dryRun: !confirmed,
      parsedEventCount: parsedEvents.length,
      importedEventCount: importedEvents.length,
      skippedDuplicateEventCount: skippedDuplicateEventUids.length,
      importedEventUids: importedEvents.map((event) => event.eventUid),
      skippedDuplicateEventUids,
      warning: confirmed
        ? (importedEvents.length ? 'Imported JSONL memory events.' : 'No new events were imported; all events already exist.')
        : 'Dry run only. Re-run with confirm=true to import these events.',
      before: summarizeState(normalized),
      after: summarizeState(afterState),
    }
  }

  async rollbackPreview(eventUid: string): Promise<AgentMemoryRollbackPreview> {
    assertNonBlank(eventUid, 'eventUid is required')
    const state = await this.store.load()
    const normalized = normalizeLoadedState(state)
    const targetIndex = normalized.events.findIndex((event) => event.eventUid === eventUid)
    if (targetIndex < 0) {
      throw new HttpError(404, `Memory event not found: ${eventUid}`)
    }

    const targetEvent = normalized.events[targetIndex]
    const beforeState = replayEvents(normalized.events.slice(0, targetIndex))
    const afterState = replayEvents(normalized.events.slice(0, targetIndex + 1))
    const laterEvents = normalized.events.slice(targetIndex + 1)
    const isLatestEvent = laterEvents.length === 0

    return {
      generatedAt: new Date().toISOString(),
      eventUid,
      targetEvent,
      targetEventIndex: targetIndex,
      isLatestEvent,
      laterEventCount: laterEvents.length,
      laterEvents,
      warning: isLatestEvent
        ? 'Clean rollback preview only. No state was changed.'
        : 'Target event is not the latest event. A real rollback would need to replay later events after removing or reversing this event.',
      operation: rollbackOperation(targetEvent, beforeState, normalized),
      before: summarizeState(beforeState),
      after: summarizeState(afterState),
      current: summarizeState(normalized),
    }
  }

  async rollback(request: AgentMemoryRollbackRequest): Promise<AgentMemoryRollbackResult> {
    assertNonBlank(request.eventUid, 'eventUid is required')
    if (!request.confirm) {
      throw new HttpError(400, 'Rollback requires confirm=true.')
    }

    const state = await this.store.load()
    const normalized = normalizeLoadedState(state)
    const targetIndex = normalized.events.findIndex((event) => event.eventUid === request.eventUid)
    if (targetIndex < 0) {
      throw new HttpError(404, `Memory event not found: ${request.eventUid}`)
    }
    if (targetIndex !== normalized.events.length - 1) {
      throw new HttpError(409, 'Only the latest memory event can be rolled back safely. Use rollback-preview to inspect older events.')
    }

    const targetEvent = normalized.events[targetIndex]
    const beforeTargetState = replayEvents(normalized.events.slice(0, targetIndex))
    const operation = rollbackOperation(targetEvent, beforeTargetState, normalized)
    if (operation.action === 'no-op') {
      throw new HttpError(400, operation.description)
    }

    const now = new Date().toISOString()
    const nextState = normalizeLoadedState(normalized)
    applyRollbackOperation(nextState, operation)
    const savedState = withDerivedRelations(nextState)
    const rollbackEvent: AgentMemoryEvent = {
      eventUid: `MemoryEvent-${nextState.nextEventSequence++}`,
      eventType: 'memory-rolled-back',
      eventAt: now,
      memoryUid: targetEvent.memoryUid,
      targetMemoryUid: targetEvent.targetMemoryUid,
      relationshipType: targetEvent.relationshipType,
      actor: blankToEmpty(request.actor) || 'mnemic-rollback',
      source: 'mnemic-rollback',
      sourceKey: `rollback/${targetEvent.eventUid}`,
      project: targetEvent.project,
      memoryType: targetEvent.memoryType,
      tags: targetEvent.tags,
      attributes: {
        rolledBackEventUid: targetEvent.eventUid,
        rolledBackEventType: targetEvent.eventType,
        rollbackAction: operation.action,
        reason: blankToEmpty(request.reason),
      },
      diff: stateEventDiff(normalized, savedState),
      memorySnapshot: operation.previousMemory ?? operation.currentMemory ?? targetEvent.memorySnapshot,
    }
    nextState.events.push(rollbackEvent)

    await this.store.save(savedState)

    return {
      generatedAt: now,
      applied: true,
      rolledBackEventUid: targetEvent.eventUid,
      rollbackEvent,
      operation,
      before: summarizeState(normalized),
      after: summarizeState(savedState),
    }
  }

  private linkExistingTargets(state: MnemicMemoryState, sourceMemoryUid: string, targetUids: string[], createdAt: string): void {
    for (const targetUid of targetUids) {
      if (!targetUid || targetUid === sourceMemoryUid) continue
      const target = state.memories.find((memory) => memory.entityUid === targetUid)
      if (!target) {
        throw new HttpError(404, `Agent memory not found: ${targetUid}`)
      }
      const exists = state.relations.some((relation) =>
        relation.sourceMemoryUid === sourceMemoryUid
        && relation.targetMemoryUid === target.entityUid
        && relation.relationshipType === defaultRelationType)
      if (!exists) {
        state.relations.push({
          sourceMemoryUid,
          targetMemoryUid: target.entityUid,
          relationshipType: defaultRelationType,
          attributes: { createdAt },
          createdAt,
        })
      }
    }
  }

  private applyDerivedRelations(state: MnemicMemoryState): void {
    const validMemoryUids = new Set(state.memories.map((memory) => memory.entityUid))
    state.relations = state.relations.filter((relation) =>
      validMemoryUids.has(relation.sourceMemoryUid) && validMemoryUids.has(relation.targetMemoryUid))
    state.memories = state.memories.map((memory) => this.withDerivedRelations(memory, state))
  }

  private withDerivedRelations(memory: AgentMemoryRecord, state: MnemicMemoryState): AgentMemoryRecord {
    const relatedMemoryUids = state.relations
      .filter((relation) => relation.sourceMemoryUid === memory.entityUid)
      .map((relation) => relation.targetMemoryUid)
      .filter((targetUid, index, values) => values.indexOf(targetUid) === index)
    return {
      ...memory,
      relatedMemoryUids,
    }
  }

  private appendMemoryEvent(
    state: MnemicMemoryState,
    eventType: AgentMemoryEventType,
    memory: AgentMemoryRecord,
    eventAt: string,
    options: {
      targetMemoryUid?: string
      relationshipType?: string
      attributes?: JsonObject
      source?: string
      sourceKey?: string
      diff?: AgentMemoryEventDiff
    } = {},
  ): void {
    state.events.push({
      eventUid: `MemoryEvent-${state.nextEventSequence++}`,
      eventType,
      eventAt,
      memoryUid: memory.entityUid,
      targetMemoryUid: options.targetMemoryUid ?? '',
      relationshipType: options.relationshipType ?? '',
      actor: memory.actor,
      source: options.source ?? memory.source,
      sourceKey: options.sourceKey ?? memory.sourceKey,
      project: memory.project,
      memoryType: memory.memoryType,
      tags: memory.tags,
      attributes: options.attributes ?? {},
      diff: options.diff ?? emptyEventDiff(),
      memorySnapshot: memory,
    })
  }
}

function requireMemory(state: MnemicMemoryState, memoryUid: string): AgentMemoryRecord {
  const memory = state.memories.find((candidate) => candidate.entityUid === memoryUid)
  if (!memory) {
    throw new HttpError(404, `Agent memory not found: ${memoryUid}`)
  }
  return memory
}

function requireRelation(
  state: MnemicMemoryState,
  sourceMemoryUid: string,
  targetMemoryUid: string,
  relationshipType: string,
): AgentMemoryRelation {
  const relation = state.relations.find((candidate) =>
    candidate.sourceMemoryUid === sourceMemoryUid
    && candidate.targetMemoryUid === targetMemoryUid
    && candidate.relationshipType === relationshipType)
  if (!relation) {
    throw new HttpError(404, `Agent memory relation not found: ${sourceMemoryUid} -> ${targetMemoryUid}`)
  }
  return relation
}

type RememberPlan = {
  existingIndex: number
  existing?: AgentMemoryRecord
  previousMemory?: AgentMemoryRecord
  eventType: Extract<AgentMemoryEventType, 'memory-created' | 'memory-updated'>
  record: AgentMemoryRecord
}

type ResolvedMemoryPolicyConfig = {
  requireSourceKey: {
    memoryTypes: string[]
    tags: string[]
    severity: AgentMemoryPolicyFinding['severity']
  }
  secrets: {
    enabled: boolean
    severity: AgentMemoryPolicyFinding['severity']
    customPatterns: ResolvedSecretPattern[]
  }
  confidence: {
    lowWarningBelow: number
    highImportanceThreshold: number
    highImportanceLowWarningBelow: number
  }
  stale: {
    staleOnArrivalSeverity: AgentMemoryPolicyFinding['severity']
  }
}

type ResolvedSecretPattern = {
  policyId: string
  sourcePattern: string
  pattern: RegExp
  fields: SecretPolicyField[]
  severity: AgentMemoryPolicyFinding['severity']
  message?: string
  recommendation?: string
}

type SecretPolicyField = 'title' | 'content' | 'source' | 'sourceKey' | 'tags' | 'metadata'

const defaultHighImpactMemoryTokens = ['release', 'security', 'incident', 'migration', 'rollback', 'production', 'prod']

const defaultPolicyConfig: ResolvedMemoryPolicyConfig = {
  requireSourceKey: {
    memoryTypes: defaultHighImpactMemoryTokens,
    tags: defaultHighImpactMemoryTokens,
    severity: 'block',
  },
  secrets: {
    enabled: true,
    severity: 'block',
    customPatterns: [],
  },
  confidence: {
    lowWarningBelow: 0.35,
    highImportanceThreshold: 0.85,
    highImportanceLowWarningBelow: 0.5,
  },
  stale: {
    staleOnArrivalSeverity: 'warning',
  },
}

const builtInSecretPolicyIds = [
  'secret-openai-key',
  'secret-github-token',
  'secret-aws-access-key',
  'secret-private-key',
  'secret-assignment',
]

function resolvePolicyConfig(config: AgentMemoryPolicyConfig): ResolvedMemoryPolicyConfig {
  return {
    requireSourceKey: {
      memoryTypes: normalizeTokenList(config.requireSourceKey?.memoryTypes, defaultPolicyConfig.requireSourceKey.memoryTypes),
      tags: normalizeTokenList(config.requireSourceKey?.tags, defaultPolicyConfig.requireSourceKey.tags),
      severity: severityValue(config.requireSourceKey?.severity, defaultPolicyConfig.requireSourceKey.severity),
    },
    secrets: {
      enabled: config.secrets?.enabled ?? defaultPolicyConfig.secrets.enabled,
      severity: severityValue(config.secrets?.severity, defaultPolicyConfig.secrets.severity),
      customPatterns: normalizeSecretPatterns(config.secrets?.customPatterns ?? [], severityValue(config.secrets?.severity, defaultPolicyConfig.secrets.severity)),
    },
    confidence: {
      lowWarningBelow: policyNumber(config.confidence?.lowWarningBelow, defaultPolicyConfig.confidence.lowWarningBelow),
      highImportanceThreshold: policyNumber(config.confidence?.highImportanceThreshold, defaultPolicyConfig.confidence.highImportanceThreshold),
      highImportanceLowWarningBelow: policyNumber(config.confidence?.highImportanceLowWarningBelow, defaultPolicyConfig.confidence.highImportanceLowWarningBelow),
    },
    stale: {
      staleOnArrivalSeverity: severityValue(config.stale?.staleOnArrivalSeverity, defaultPolicyConfig.stale.staleOnArrivalSeverity),
    },
  }
}

function serializePolicyConfig(config: ResolvedMemoryPolicyConfig): AgentMemoryResolvedPolicyConfig {
  return {
    requireSourceKey: {
      memoryTypes: config.requireSourceKey.memoryTypes,
      tags: config.requireSourceKey.tags,
      severity: config.requireSourceKey.severity,
    },
    secrets: {
      enabled: config.secrets.enabled,
      severity: config.secrets.severity,
      builtInPolicyIds: builtInSecretPolicyIds,
      customPatterns: config.secrets.customPatterns.map((pattern) => ({
        policyId: pattern.policyId,
        pattern: pattern.sourcePattern,
        fields: pattern.fields,
        severity: pattern.severity,
        message: pattern.message,
        recommendation: pattern.recommendation,
      })),
    },
    confidence: {
      lowWarningBelow: config.confidence.lowWarningBelow,
      highImportanceThreshold: config.confidence.highImportanceThreshold,
      highImportanceLowWarningBelow: config.confidence.highImportanceLowWarningBelow,
    },
    stale: {
      staleOnArrivalSeverity: config.stale.staleOnArrivalSeverity,
    },
  }
}

function normalizeTokenList(value: string[] | undefined, fallback: string[]): string[] {
  const tokens = cleanTags(value).map(normalize).filter(Boolean)
  return tokens.length ? tokens : fallback
}

function severityValue(
  value: AgentMemoryPolicyFinding['severity'] | undefined,
  fallback: AgentMemoryPolicyFinding['severity'],
): AgentMemoryPolicyFinding['severity'] {
  return value === 'info' || value === 'warning' || value === 'block' ? value : fallback
}

function policyNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : fallback
}

function normalizeSecretPatterns(
  patterns: AgentMemorySecretPattern[] = [],
  fallbackSeverity: AgentMemoryPolicyFinding['severity'],
): ResolvedSecretPattern[] {
  return patterns.map((pattern) => {
    if (!pattern.policyId?.trim()) {
      throw new Error('Mnemic policy customPatterns entries require policyId.')
    }
    if (!pattern.pattern?.trim()) {
      throw new Error(`Mnemic policy custom pattern ${pattern.policyId} requires pattern.`)
    }
    return {
      policyId: pattern.policyId.trim(),
      sourcePattern: pattern.pattern.trim(),
      pattern: new RegExp(pattern.pattern, 'i'),
      fields: normalizeSecretFields(pattern.fields),
      severity: severityValue(pattern.severity, fallbackSeverity),
      message: pattern.message?.trim(),
      recommendation: pattern.recommendation?.trim(),
    }
  })
}

function normalizeSecretFields(fields: unknown): SecretPolicyField[] {
  const allowed = new Set<SecretPolicyField>(['title', 'content', 'source', 'sourceKey', 'tags', 'metadata'])
  if (!Array.isArray(fields)) return [...allowed]
  const normalized = fields.filter((field): field is SecretPolicyField => allowed.has(field as SecretPolicyField))
  return normalized.length ? [...new Set(normalized)] : [...allowed]
}

function buildRememberPlan(state: MnemicMemoryState, request: AgentMemoryRequest, now: string): RememberPlan {
  const sourceKey = blankToEmpty(request.sourceKey)
  const existingIndex = sourceKey
    ? state.memories.findIndex((memory) => memory.sourceKey === sourceKey)
    : -1
  const existing = existingIndex >= 0 ? state.memories[existingIndex] : undefined
  const previousMemory = existing
    ? withDerivedRelations(state).memories.find((memory) => memory.entityUid === existing.entityUid) ?? existing
    : undefined
  const eventType = existing ? 'memory-updated' : 'memory-created'

  return {
    existingIndex,
    existing,
    previousMemory,
    eventType,
    record: {
      entityUid: existing?.entityUid ?? `AgentMemory-${state.nextSequence}`,
      title: request.title.trim(),
      content: request.content.trim(),
      memoryType: blankToEmpty(request.memoryType) || existing?.memoryType || 'note',
      project: blankToEmpty(request.project) || existing?.project || '',
      tags: cleanTags(request.tags ?? existing?.tags),
      source: blankToEmpty(request.source) || existing?.source || '',
      sourceKey,
      actor: blankToEmpty(request.actor) || existing?.actor || '',
      importance: clamp01(request.importance ?? existing?.importance ?? 0.5),
      confidence: clamp01(request.confidence ?? existing?.confidence ?? 0.7),
      observedAt: blankToEmpty(request.observedAt) || existing?.observedAt || now,
      validFrom: blankToEmpty(request.validFrom) || existing?.validFrom || '',
      validTo: blankToEmpty(request.validTo) || existing?.validTo || '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      metadata: isJsonObject(request.metadata) ? request.metadata : {},
      relatedMemoryUids: [],
    },
  }
}

function previewRelationLinks(
  state: MnemicMemoryState,
  sourceMemoryUid: string,
  targetUids: string[],
  createdAt: string,
): AgentMemoryWritePreview['relationPreviews'] {
  const previews: AgentMemoryWritePreview['relationPreviews'] = []
  const seenTargetUids = new Set<string>()

  for (const targetUidValue of targetUids) {
    const targetUid = targetUidValue?.trim()
    if (!targetUid || targetUid === sourceMemoryUid || seenTargetUids.has(targetUid)) continue
    seenTargetUids.add(targetUid)
    const target = state.memories.find((memory) => memory.entityUid === targetUid)
    if (!target) {
      throw new HttpError(404, `Agent memory not found: ${targetUid}`)
    }
    const existing = state.relations.find((relation) =>
      relation.sourceMemoryUid === sourceMemoryUid
      && relation.targetMemoryUid === target.entityUid
      && relation.relationshipType === defaultRelationType)
    const relation: AgentMemoryRelation = existing ?? {
      sourceMemoryUid,
      targetMemoryUid: target.entityUid,
      relationshipType: defaultRelationType,
      attributes: { createdAt },
      createdAt,
    }
    previews.push({
      targetMemoryUid: target.entityUid,
      relationshipType: defaultRelationType,
      alreadyExists: Boolean(existing),
      diff: existing ? emptyEventDiff() : relationEventDiff(undefined, relation),
    })
  }

  return previews
}

function previewWarnings(
  request: AgentMemoryRequest,
  plan: RememberPlan,
  relationPreviews: AgentMemoryWritePreview['relationPreviews'],
  policyFindings: AgentMemoryPolicyFinding[],
): string[] {
  const warnings: string[] = []
  if (!blankToEmpty(request.sourceKey)) {
    warnings.push('sourceKey is empty; repeated writes will create new memories.')
  }
  if (plan.existing) {
    warnings.push(`sourceKey matched existing memory ${plan.existing.entityUid}; write will update it.`)
  }
  if ((request.relatedMemoryUids ?? []).some((targetUid) => !targetUid?.trim() || targetUid.trim() === plan.record.entityUid)) {
    warnings.push('Blank or self related memory targets will be ignored.')
  }
  if (relationPreviews.some((relation) => relation.alreadyExists)) {
    warnings.push('Some requested related memories are already linked.')
  }
  if (plan.record.confidence < 0.5) {
    warnings.push('confidence is below 0.5.')
  }
  for (const finding of policyFindings) {
    if (finding.severity !== 'info') {
      warnings.push(finding.message)
    }
  }
  return [...new Set(warnings)]
}

function evaluateMemoryPolicy(
  request: AgentMemoryRequest,
  now: string,
  config: ResolvedMemoryPolicyConfig,
): AgentMemoryPolicyFinding[] {
  const findings: AgentMemoryPolicyFinding[] = []
  const sourceKey = blankToEmpty(request.sourceKey)
  const memoryType = normalize(request.memoryType || 'note')
  const tags = cleanTags(request.tags).map(normalize)
  const confidence = clamp01(request.confidence ?? 0.7)
  const importance = clamp01(request.importance ?? 0.5)
  const requiresSourceKey = sourceKeyRequired(memoryType, tags, config)

  if (!sourceKey) {
    findings.push({
      policyId: 'source-key-recommended',
      severity: requiresSourceKey ? config.requireSourceKey.severity : 'warning',
      field: 'sourceKey',
      message: requiresSourceKey
        ? sourceKeyRequiredMessage(config)
        : 'sourceKey is empty; repeated writes will create new memories.',
      recommendation: 'Use a stable key such as a commit SHA, issue ID, ticket ID, release ID, or session-summary ID.',
    })
  }

  if (confidence < config.confidence.lowWarningBelow) {
    findings.push({
      policyId: 'low-confidence-memory',
      severity: 'warning',
      field: 'confidence',
      message: `confidence is below ${config.confidence.lowWarningBelow}; this memory may be unreliable for future agent sessions.`,
      recommendation: 'Raise confidence after verification or store it as a temporary/problem memory with a clear source.',
    })
  } else if (importance >= config.confidence.highImportanceThreshold && confidence < config.confidence.highImportanceLowWarningBelow) {
    findings.push({
      policyId: 'important-low-confidence-memory',
      severity: 'warning',
      field: 'confidence',
      message: `high-importance memory has confidence below ${config.confidence.highImportanceLowWarningBelow}.`,
      recommendation: 'Verify the claim before making it a high-priority recall candidate.',
    })
  }

  const validTo = blankToEmpty(request.validTo)
  if (validTo) {
    const validToTime = Date.parse(validTo)
    if (Number.isFinite(validToTime) && validToTime < Date.parse(now)) {
      findings.push({
        policyId: 'stale-on-arrival',
        severity: config.stale.staleOnArrivalSeverity,
        field: 'validTo',
        message: `validTo is already in the past (${validTo}); this memory will be marked stale immediately.`,
        recommendation: 'Only set validTo in the past when intentionally preserving expired context.',
      })
    }
  }

  findings.push(...secretFindings(request, config))
  return findings.sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || left.policyId.localeCompare(right.policyId))
}

function sourceKeyRequired(memoryType: string, tags: string[], config: ResolvedMemoryPolicyConfig): boolean {
  const memoryTypes = new Set(config.requireSourceKey.memoryTypes)
  const requiredTags = new Set(config.requireSourceKey.tags)
  return memoryTypes.has(memoryType) || tags.some((tag) => requiredTags.has(tag))
}

function sourceKeyRequiredMessage(config: ResolvedMemoryPolicyConfig): string {
  const terms = [...new Set([...config.requireSourceKey.memoryTypes, ...config.requireSourceKey.tags])]
  return `sourceKey is required for configured high-impact memories (${terms.join(', ')}).`
}

function secretFindings(request: AgentMemoryRequest, config: ResolvedMemoryPolicyConfig): AgentMemoryPolicyFinding[] {
  if (!config.secrets.enabled) return []

  const fields: Array<{ field: SecretPolicyField; value: string }> = [
    { field: 'title', value: request.title ?? '' },
    { field: 'content', value: request.content ?? '' },
    { field: 'source', value: request.source ?? '' },
    { field: 'sourceKey', value: request.sourceKey ?? '' },
    { field: 'tags', value: (request.tags ?? []).join(' ') },
    { field: 'metadata', value: safeJsonString(request.metadata) },
  ]
  const findings: AgentMemoryPolicyFinding[] = []

  for (const field of fields) {
    for (const pattern of secretPatterns(config)) {
      if (!pattern.fields.includes(field.field)) continue
      if (!pattern.pattern.test(field.value)) continue
      findings.push({
        policyId: pattern.policyId,
        severity: pattern.severity,
        field: field.field,
        message: pattern.message ?? `Potential secret detected in ${field.field}; Mnemic will not store this memory.`,
        recommendation: pattern.recommendation ?? 'Remove or redact credentials before writing durable memory.',
      })
    }
  }

  return dedupePolicyFindings(findings)
}

function secretPatterns(config: ResolvedMemoryPolicyConfig): ResolvedSecretPattern[] {
  const fields: SecretPolicyField[] = ['title', 'content', 'source', 'sourceKey', 'tags', 'metadata']
  return [
    { policyId: 'secret-openai-key', sourcePattern: String.raw`\bsk-[A-Za-z0-9_-]{20,}\b`, pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/, fields, severity: config.secrets.severity },
    { policyId: 'secret-github-token', sourcePattern: String.raw`\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b`, pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/, fields, severity: config.secrets.severity },
    { policyId: 'secret-aws-access-key', sourcePattern: String.raw`\bAKIA[0-9A-Z]{16}\b`, pattern: /\bAKIA[0-9A-Z]{16}\b/, fields, severity: config.secrets.severity },
    { policyId: 'secret-private-key', sourcePattern: '-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/, fields, severity: config.secrets.severity },
    { policyId: 'secret-assignment', sourcePattern: String.raw`\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{12,}`, pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{12,}/i, fields, severity: config.secrets.severity },
    ...config.secrets.customPatterns,
  ]
}

function assertPolicyAllowsWrite(policyFindings: AgentMemoryPolicyFinding[]): void {
  const blocking = policyFindings.filter((finding) => finding.severity === 'block')
  if (!blocking.length) return
  throw new HttpError(400, 'Memory write blocked by Mnemic policy.', {
    policyFindings: blocking,
  })
}

function withPolicyFindings(memory: AgentMemoryRecord, policyFindings: AgentMemoryPolicyFinding[]): AgentMemoryRecord {
  return policyFindings.length
    ? { ...memory, policyFindings }
    : memory
}

function dedupePolicyFindings(findings: AgentMemoryPolicyFinding[]): AgentMemoryPolicyFinding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.policyId}:${finding.field}:${finding.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function severityRank(severity: AgentMemoryPolicyFinding['severity']): number {
  if (severity === 'block') return 3
  if (severity === 'warning') return 2
  return 1
}

function safeJsonString(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return ''
  }
}

function auditMemoryState(
  memories: AgentMemoryRecord[],
  state: MnemicMemoryState,
  policyConfig: ResolvedMemoryPolicyConfig,
): AgentMemoryAuditFinding[] {
  const findings: AgentMemoryAuditFinding[] = []
  const titleGroups = groupMemoriesByTitle(memories)
  const relationCounts = relationCountsByMemoryUid(state)

  for (const memory of memories) {
    const policyFindings = evaluateMemoryPolicy(memoryToPolicyRequest(memory), new Date().toISOString(), policyConfig)
    for (const finding of policyFindings) {
      findings.push({
        findingId: `policy-${finding.policyId}-${memory.entityUid}`,
        severity: finding.severity,
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'policy',
        message: finding.message,
        recommendation: finding.recommendation,
      })
    }

    if (!memory.sourceKey) {
      findings.push({
        findingId: `missing-source-key-${memory.entityUid}`,
        severity: 'warning',
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'source-key',
        message: 'Memory has no sourceKey, so repeated agent writes cannot update it idempotently.',
        recommendation: 'Add a stable sourceKey such as a commit SHA, issue ID, release ID, or session-summary ID.',
      })
    }

    if (memory.confidence < policyConfig.confidence.lowWarningBelow) {
      findings.push({
        findingId: `low-confidence-${memory.entityUid}`,
        severity: 'warning',
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'confidence',
        message: `Memory confidence ${memory.confidence} is below ${policyConfig.confidence.lowWarningBelow}.`,
        recommendation: 'Verify this memory, lower its importance, or mark it with a clearer validity window.',
      })
    }

    if (isStaleMemory(memory)) {
      findings.push({
        findingId: `stale-${memory.entityUid}`,
        severity: 'warning',
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'staleness',
        message: `Memory is stale because validTo is ${memory.validTo}.`,
        recommendation: 'Refresh the memory with current context or leave it as explicitly expired provenance.',
      })
    }

    const relationCount = relationCounts.get(memory.entityUid) ?? 0
    if (memories.length > 1 && relationCount === 0) {
      findings.push({
        findingId: `orphan-${memory.entityUid}`,
        severity: 'info',
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'relations',
        message: 'Memory has no incoming or outgoing relations in this project audit scope.',
        recommendation: 'Link this memory to related decisions, fixes, or risks when graph context would improve recall.',
      })
    }
  }

  for (const group of titleGroups.values()) {
    if (group.length < 2) continue
    for (const memory of group) {
      findings.push({
        findingId: `duplicate-title-${memory.entityUid}`,
        severity: 'info',
        memoryUid: memory.entityUid,
        title: memory.title,
        category: 'duplicate',
        message: `Memory title appears ${group.length} times in this audit scope.`,
        recommendation: 'Consider merging duplicates or using more specific titles.',
      })
    }
  }

  return dedupeAuditFindings(findings)
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity)
      || left.category.localeCompare(right.category)
      || left.memoryUid.localeCompare(right.memoryUid))
}

function memoryToPolicyRequest(memory: AgentMemoryRecord): AgentMemoryRequest {
  return {
    title: memory.title,
    content: memory.content,
    memoryType: memory.memoryType,
    project: memory.project,
    tags: memory.tags,
    source: memory.source,
    sourceKey: memory.sourceKey,
    actor: memory.actor,
    importance: memory.importance,
    confidence: memory.confidence,
    observedAt: memory.observedAt,
    validFrom: memory.validFrom,
    validTo: memory.validTo,
    relatedMemoryUids: memory.relatedMemoryUids,
    metadata: memory.metadata,
  }
}

function relationCountsByMemoryUid(state: MnemicMemoryState): Map<string, number> {
  const counts = new Map<string, number>()
  for (const relation of state.relations) {
    counts.set(relation.sourceMemoryUid, (counts.get(relation.sourceMemoryUid) ?? 0) + 1)
    counts.set(relation.targetMemoryUid, (counts.get(relation.targetMemoryUid) ?? 0) + 1)
  }
  return counts
}

function groupMemoriesByTitle(memories: AgentMemoryRecord[]): Map<string, AgentMemoryRecord[]> {
  const groups = new Map<string, AgentMemoryRecord[]>()
  for (const memory of memories) {
    const key = normalize(memory.title)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), memory])
  }
  return groups
}

function summarizeAuditFindings(findings: AgentMemoryAuditFinding[]): AgentMemoryAudit['summary'] {
  return {
    blockCount: findings.filter((finding) => finding.severity === 'block').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    infoCount: findings.filter((finding) => finding.severity === 'info').length,
    missingSourceKeyCount: findings.filter((finding) => finding.category === 'source-key').length,
    lowConfidenceCount: findings.filter((finding) => finding.category === 'confidence').length,
    staleCount: findings.filter((finding) => finding.category === 'staleness').length,
    orphanCount: findings.filter((finding) => finding.category === 'relations').length,
    duplicateTitleCount: findings.filter((finding) => finding.category === 'duplicate').length,
  }
}

function auditHealthScore(totalMemories: number, summary: AgentMemoryAudit['summary']): number {
  if (!totalMemories) return 100
  const penalty = summary.blockCount * 14
    + summary.warningCount * 5
    + summary.infoCount * 1
  return Math.max(0, Math.min(100, Math.round(100 - penalty)))
}

function dedupeAuditFindings(findings: AgentMemoryAuditFinding[]): AgentMemoryAuditFinding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.findingId}:${finding.memoryUid}:${finding.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeLoadedState(state: MnemicMemoryState): MnemicMemoryState {
  const replayed = {
    version: 1 as const,
    nextSequence: state.nextSequence,
    nextEventSequence: state.nextEventSequence,
    memories: state.memories.map((memory) => ({ ...memory })),
    relations: state.relations.map((relation) => ({ ...relation })),
    events: state.events.map((event) => ({ ...event })),
  }
  return withDerivedRelations(replayed)
}

function filterEvents(
  events: AgentMemoryEvent[],
  params: {
    project?: string
    memoryType?: string
    tag?: string
    asOf?: string
  },
): AgentMemoryEvent[] {
  const normalizedProject = normalize(params.project)
  const normalizedMemoryType = normalize(params.memoryType)
  const normalizedTag = normalize(params.tag)
  return events
    .filter((event) => matches(event.project, normalizedProject))
    .filter((event) => matches(event.memoryType, normalizedMemoryType))
    .filter((event) => !normalizedTag || event.tags.some((tag) => normalize(tag) === normalizedTag))
    .filter((event) => isInstantAtOrBefore(event.eventAt, params.asOf))
}

function exportLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.MAX_SAFE_INTEGER
  return Math.max(1, Math.min(limit, 10_000))
}

function replayEvents(events: AgentMemoryEvent[]): MnemicMemoryState {
  const state: MnemicMemoryState = {
    version: 1,
    nextSequence: 1,
    nextEventSequence: 1,
    memories: [],
    relations: [],
    events: [],
  }

  for (const event of events) {
    state.events.push(event)
    if (event.eventType === 'memory-created' || event.eventType === 'memory-updated' || event.eventType === 'memory-linked') {
      upsertMemory(state, event.memorySnapshot)
    }
    if (event.eventType === 'memory-linked' && event.targetMemoryUid) {
      const exists = state.relations.some((relation) =>
        relation.sourceMemoryUid === event.memoryUid
        && relation.targetMemoryUid === event.targetMemoryUid
        && relation.relationshipType === event.relationshipType)
      if (!exists) {
        state.relations.push({
          sourceMemoryUid: event.memoryUid,
          targetMemoryUid: event.targetMemoryUid,
          relationshipType: event.relationshipType || defaultRelationType,
          attributes: event.attributes,
          createdAt: event.eventAt,
        })
      }
    }
    if (event.eventType === 'memory-rolled-back') {
      applyRollbackEvent(state, event)
    }
  }

  return withDerivedRelations(state)
}

function stateFromEvents(events: AgentMemoryEvent[], previousState: MnemicMemoryState): MnemicMemoryState {
  const state = replayEvents(events)
  state.nextSequence = Math.max(previousState.nextSequence, nextSequenceAfterIds(state.memories.map((memory) => memory.entityUid), 'AgentMemory-'))
  state.nextEventSequence = Math.max(previousState.nextEventSequence, nextSequenceAfterIds(events.map((event) => event.eventUid), 'MemoryEvent-'))
  return withDerivedRelations(state)
}

function parseJsonlEvents(jsonl: string): AgentMemoryEvent[] {
  const events: AgentMemoryEvent[] = []
  const lines = jsonl.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const line = lines[index].trim()
    if (!line) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new HttpError(400, `JSONL line ${lineNumber} is not valid JSON.`)
    }

    if (!isJsonObject(parsed)) {
      throw new HttpError(400, `JSONL line ${lineNumber} must be an object.`)
    }
    if (parsed.kind !== 'mnemic.memory_event') {
      throw new HttpError(400, `JSONL line ${lineNumber} has unsupported kind.`)
    }
    if (parsed.schemaVersion !== 1) {
      throw new HttpError(400, `JSONL line ${lineNumber} has unsupported schemaVersion.`)
    }

    events.push(normalizeImportedEvent(parsed.event, lineNumber))
  }

  if (!events.length) {
    throw new HttpError(400, 'jsonl contains no memory events.')
  }

  return events
}

function normalizeImportedEvent(value: unknown, lineNumber: number): AgentMemoryEvent {
  if (!isJsonObject(value)) {
    throw new HttpError(400, `JSONL line ${lineNumber} event must be an object.`)
  }

  const eventUid = requiredString(value.eventUid, `JSONL line ${lineNumber} event.eventUid is required.`)
  const eventType = requiredEventType(value.eventType, lineNumber)
  const memorySnapshot = normalizeImportedMemory(value.memorySnapshot, lineNumber)
  const memoryUid = stringValue(value.memoryUid) || memorySnapshot.entityUid

  if (memoryUid !== memorySnapshot.entityUid) {
    throw new HttpError(400, `JSONL line ${lineNumber} event.memoryUid must match memorySnapshot.entityUid.`)
  }

  return {
    eventUid,
    eventType,
    eventAt: stringValue(value.eventAt) || memorySnapshot.updatedAt || memorySnapshot.createdAt,
    memoryUid,
    targetMemoryUid: stringValue(value.targetMemoryUid),
    relationshipType: stringValue(value.relationshipType),
    actor: stringValue(value.actor) || memorySnapshot.actor,
    source: stringValue(value.source) || memorySnapshot.source,
    sourceKey: stringValue(value.sourceKey) || memorySnapshot.sourceKey,
    project: stringValue(value.project) || memorySnapshot.project,
    memoryType: stringValue(value.memoryType) || memorySnapshot.memoryType,
    tags: stringArray(value.tags).length ? stringArray(value.tags) : memorySnapshot.tags,
    attributes: jsonObject(value.attributes),
    diff: normalizeImportedDiff(value.diff),
    memorySnapshot,
  }
}

function normalizeImportedDiff(value: unknown): AgentMemoryEventDiff {
  if (!isJsonObject(value)) {
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
    before: value.before === null || isJsonObject(value.before) ? value.before : null,
    after: value.after === null || isJsonObject(value.after) ? value.after : null,
    changedFields: stringArray(value.changedFields),
  }
}

function normalizeImportedMemory(value: unknown, lineNumber: number): AgentMemoryRecord {
  if (!isJsonObject(value)) {
    throw new HttpError(400, `JSONL line ${lineNumber} event.memorySnapshot must be an object.`)
  }

  const entityUid = requiredString(value.entityUid, `JSONL line ${lineNumber} memorySnapshot.entityUid is required.`)
  const title = requiredString(value.title, `JSONL line ${lineNumber} memorySnapshot.title is required.`)
  const content = requiredString(value.content, `JSONL line ${lineNumber} memorySnapshot.content is required.`)

  return {
    entityUid,
    title,
    content,
    memoryType: stringValue(value.memoryType) || 'note',
    project: stringValue(value.project),
    tags: stringArray(value.tags),
    source: stringValue(value.source),
    sourceKey: stringValue(value.sourceKey),
    actor: stringValue(value.actor),
    importance: clamp01(numberValue(value.importance, 0.5)),
    confidence: clamp01(numberValue(value.confidence, 0.7)),
    observedAt: stringValue(value.observedAt),
    validFrom: stringValue(value.validFrom),
    validTo: stringValue(value.validTo),
    createdAt: stringValue(value.createdAt),
    updatedAt: stringValue(value.updatedAt),
    metadata: jsonObject(value.metadata),
    relatedMemoryUids: stringArray(value.relatedMemoryUids),
  }
}

function requiredEventType(value: unknown, lineNumber: number): AgentMemoryEventType {
  const eventType = stringValue(value)
  if (
    eventType === 'memory-created'
    || eventType === 'memory-updated'
    || eventType === 'memory-linked'
    || eventType === 'memory-rolled-back'
  ) {
    return eventType
  }

  throw new HttpError(400, `JSONL line ${lineNumber} event.eventType is unsupported.`)
}

function requiredString(value: unknown, message: string): string {
  const text = stringValue(value)
  if (!text) {
    throw new HttpError(400, message)
  }
  return text
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
}

function jsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {}
}

function nextSequenceAfterIds(ids: string[], prefix: string): number {
  const maxSequence = ids.reduce((max, id) => {
    if (!id.startsWith(prefix)) return max
    const sequence = Number(id.slice(prefix.length))
    return Number.isInteger(sequence) && sequence > max ? sequence : max
  }, 0)
  return maxSequence + 1
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]))
  }
  return value
}

function upsertMemory(state: MnemicMemoryState, memory: AgentMemoryRecord): void {
  const index = state.memories.findIndex((candidate) => candidate.entityUid === memory.entityUid)
  const copy = {
    ...memory,
    relatedMemoryUids: [],
  }
  if (index >= 0) {
    state.memories[index] = copy
  } else {
    state.memories.push(copy)
  }
}

function applyRollbackEvent(state: MnemicMemoryState, event: AgentMemoryEvent): void {
  const action = typeof event.attributes.rollbackAction === 'string'
    ? event.attributes.rollbackAction
    : ''
  if (action === 'remove-memory') {
    removeMemory(state, event.memoryUid)
    return
  }
  if (action === 'restore-memory') {
    upsertMemory(state, event.memorySnapshot)
    return
  }
  if (action === 'remove-relation') {
    removeRelation(state, event.memoryUid, event.targetMemoryUid, event.relationshipType)
  }
}

function applyRollbackOperation(state: MnemicMemoryState, operation: AgentMemoryRollbackOperation): void {
  if (operation.action === 'remove-memory') {
    removeMemory(state, operation.memoryUid)
    return
  }
  if (operation.action === 'restore-memory' && operation.previousMemory) {
    upsertMemory(state, operation.previousMemory)
    return
  }
  if (operation.action === 'remove-relation') {
    removeRelation(state, operation.memoryUid, operation.targetMemoryUid, operation.relationshipType)
  }
}

function memoryEventDiff(before: AgentMemoryRecord | undefined, after: AgentMemoryRecord): AgentMemoryEventDiff {
  const beforeSnapshot = before ? memoryDiffSnapshot(before) : null
  const afterSnapshot = memoryDiffSnapshot(after)
  return {
    subject: 'memory',
    before: beforeSnapshot,
    after: afterSnapshot,
    changedFields: changedFields(beforeSnapshot, afterSnapshot),
  }
}

function relationEventDiff(before: AgentMemoryRelation | undefined, after: AgentMemoryRelation): AgentMemoryEventDiff {
  const beforeSnapshot = before ? relationDiffSnapshot(before) : null
  const afterSnapshot = relationDiffSnapshot(after)
  return {
    subject: 'relation',
    before: beforeSnapshot,
    after: afterSnapshot,
    changedFields: changedFields(beforeSnapshot, afterSnapshot),
  }
}

function stateEventDiff(before: MnemicMemoryState, after: MnemicMemoryState): AgentMemoryEventDiff {
  const beforeSnapshot = stateDiffSnapshot(before)
  const afterSnapshot = stateDiffSnapshot(after)
  return {
    subject: 'state',
    before: beforeSnapshot,
    after: afterSnapshot,
    changedFields: changedFields(beforeSnapshot, afterSnapshot),
  }
}

function emptyEventDiff(): AgentMemoryEventDiff {
  return {
    subject: 'none',
    before: null,
    after: null,
    changedFields: [],
  }
}

function memoryDiffSnapshot(memory: AgentMemoryRecord): JsonObject {
  return {
    entityUid: memory.entityUid,
    title: memory.title,
    content: memory.content,
    memoryType: memory.memoryType,
    project: memory.project,
    tags: memory.tags,
    source: memory.source,
    sourceKey: memory.sourceKey,
    actor: memory.actor,
    importance: memory.importance,
    confidence: memory.confidence,
    observedAt: memory.observedAt,
    validFrom: memory.validFrom,
    validTo: memory.validTo,
    metadata: memory.metadata,
    relatedMemoryUids: memory.relatedMemoryUids,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  }
}

function relationDiffSnapshot(relation: AgentMemoryRelation): JsonObject {
  return {
    sourceMemoryUid: relation.sourceMemoryUid,
    targetMemoryUid: relation.targetMemoryUid,
    relationshipType: relation.relationshipType,
    attributes: relation.attributes,
    createdAt: relation.createdAt,
  }
}

function stateDiffSnapshot(state: MnemicMemoryState): JsonObject {
  return {
    memoryCount: state.memories.length,
    relationCount: state.relations.length,
    eventCount: state.events.length,
    memoryUids: state.memories.map((memory) => memory.entityUid).sort(),
    relationKeys: state.relations
      .map((relation) => `${relation.sourceMemoryUid}->${relation.targetMemoryUid}:${relation.relationshipType}`)
      .sort(),
  }
}

function changedFields(before: JsonObject | null, after: JsonObject | null): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])
  return [...keys]
    .filter((key) => stableJson(before?.[key] ?? null) !== stableJson(after?.[key] ?? null))
    .sort()
}

function removeMemory(state: MnemicMemoryState, memoryUid: string): void {
  state.memories = state.memories.filter((memory) => memory.entityUid !== memoryUid)
  state.relations = state.relations.filter((relation) =>
    relation.sourceMemoryUid !== memoryUid && relation.targetMemoryUid !== memoryUid)
}

function removeRelation(
  state: MnemicMemoryState,
  memoryUid: string,
  targetMemoryUid: string,
  relationshipType: string,
): void {
  state.relations = state.relations.filter((relation) =>
    !(relation.sourceMemoryUid === memoryUid
      && relation.targetMemoryUid === targetMemoryUid
      && relation.relationshipType === relationshipType))
}

function withDerivedRelations(state: MnemicMemoryState): MnemicMemoryState {
  const validMemoryUids = new Set(state.memories.map((memory) => memory.entityUid))
  const relations = state.relations.filter((relation) =>
    validMemoryUids.has(relation.sourceMemoryUid) && validMemoryUids.has(relation.targetMemoryUid))
  const memories = state.memories.map((memory) => ({
    ...memory,
    relatedMemoryUids: relations
      .filter((relation) => relation.sourceMemoryUid === memory.entityUid)
      .map((relation) => relation.targetMemoryUid)
      .filter((targetUid, index, values) => values.indexOf(targetUid) === index),
  }))

  return {
    ...state,
    memories,
    relations,
  }
}

function summarizeState(state: MnemicMemoryState): AgentMemoryRollbackStateSummary {
  return {
    memoryCount: state.memories.length,
    relationCount: state.relations.length,
    eventCount: state.events.length,
    memories: state.memories
      .map((memory) => ({
        entityUid: memory.entityUid,
        title: memory.title,
        memoryType: memory.memoryType,
        project: memory.project,
        sourceKey: memory.sourceKey,
        updatedAt: memory.updatedAt,
      }))
      .sort((left, right) => left.entityUid.localeCompare(right.entityUid)),
    relations: [...state.relations].sort((left, right) =>
      left.sourceMemoryUid.localeCompare(right.sourceMemoryUid)
      || left.targetMemoryUid.localeCompare(right.targetMemoryUid)
      || left.relationshipType.localeCompare(right.relationshipType)),
  }
}

function rollbackOperation(
  event: AgentMemoryEvent,
  beforeState: MnemicMemoryState,
  currentState: MnemicMemoryState,
): AgentMemoryRollbackOperation {
  const previousMemory = beforeState.memories.find((memory) => memory.entityUid === event.memoryUid)
  const currentMemory = currentState.memories.find((memory) => memory.entityUid === event.memoryUid)

  if (event.eventType === 'memory-created') {
    return {
      action: 'remove-memory',
      memoryUid: event.memoryUid,
      targetMemoryUid: '',
      relationshipType: '',
      description: `Remove memory ${event.memoryUid} and any relations that depend on it.`,
      currentMemory,
    }
  }

  if (event.eventType === 'memory-updated') {
    if (previousMemory) {
      return {
        action: 'restore-memory',
        memoryUid: event.memoryUid,
        targetMemoryUid: '',
        relationshipType: '',
        description: `Restore memory ${event.memoryUid} to its snapshot before ${event.eventUid}.`,
        previousMemory,
        currentMemory,
      }
    }
    return {
      action: 'remove-memory',
      memoryUid: event.memoryUid,
      targetMemoryUid: '',
      relationshipType: '',
      description: `No previous snapshot exists, so rollback would remove memory ${event.memoryUid}.`,
      currentMemory,
    }
  }

  if (event.eventType === 'memory-linked') {
    return {
      action: 'remove-relation',
      memoryUid: event.memoryUid,
      targetMemoryUid: event.targetMemoryUid,
      relationshipType: event.relationshipType,
      description: `Remove relation ${event.relationshipType || defaultRelationType} from ${event.memoryUid} to ${event.targetMemoryUid}.`,
      previousMemory,
      currentMemory,
    }
  }

  return {
    action: 'no-op',
    memoryUid: event.memoryUid,
    targetMemoryUid: event.targetMemoryUid,
    relationshipType: event.relationshipType,
    description: `No rollback operation is defined for ${event.eventType}.`,
    previousMemory,
    currentMemory,
  }
}

function explainMemoryRecall(
  memory: AgentMemoryRecord,
  state: MnemicMemoryState,
  normalizedQuery: string,
): AgentMemoryRecallExplanationEntry {
  const relationPaths = scoredRelationPaths(state, memory.entityUid)
  const { lexicalScore, matchedTerms, matchedFields, fieldScores } = lexicalExplanation(memory, normalizedQuery)
  const importanceBoost = round(Math.max(0, memory.importance))
  const relationBoost = round(Math.min(2, relationPaths.reduce((total, path) => total + path.score, 0) * 0.12))
  const stale = isStaleMemory(memory)
  const scoreValue = round((normalizedQuery ? lexicalScore : 1) + importanceBoost + relationBoost - (stale ? 0.5 : 0))
  const reasons = recallReasons(memory, lexicalScore, importanceBoost, relationBoost, stale, matchedFields)

  return {
    memory,
    score: scoreValue,
    lexicalScore: round(lexicalScore),
    importanceBoost,
    relationBoost,
    matchedTerms,
    matchedFields,
    fieldScores,
    relationPaths,
    stale,
    reasons,
  }
}

function lexicalExplanation(
  memory: AgentMemoryRecord,
  normalizedQuery: string,
): {
  lexicalScore: number
  matchedTerms: string[]
  matchedFields: string[]
  fieldScores: Record<string, number>
} {
  if (!normalizedQuery) {
    return {
      lexicalScore: 0,
      matchedTerms: [],
      matchedFields: [],
      fieldScores: {},
    }
  }

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const fields: Array<{ name: string; value: string; weight: number }> = [
    { name: 'title', value: memory.title, weight: 3 },
    { name: 'content', value: memory.content, weight: 2 },
    { name: 'memoryType', value: memory.memoryType, weight: 1 },
    { name: 'project', value: memory.project, weight: 1 },
    { name: 'tags', value: memory.tags.join(' '), weight: 1 },
    { name: 'source', value: memory.source, weight: 1 },
    { name: 'sourceKey', value: memory.sourceKey, weight: 1 },
  ]
  const fieldScores: Record<string, number> = {}
  const matchedTerms = new Set<string>()

  for (const field of fields) {
    const normalizedValue = normalize(field.value)
    for (const term of terms) {
      if (!normalizedValue.includes(term)) continue
      fieldScores[field.name] = round((fieldScores[field.name] ?? 0) + field.weight)
      matchedTerms.add(term)
    }
    if (normalizedValue.includes(normalizedQuery)) {
      fieldScores[field.name] = round((fieldScores[field.name] ?? 0) + field.weight)
    }
  }

  const lexicalScore = Object.values(fieldScores).reduce((total, value) => total + value, 0)
  return {
    lexicalScore,
    matchedTerms: [...matchedTerms].sort(),
    matchedFields: Object.keys(fieldScores).sort(),
    fieldScores,
  }
}

function scoredRelationPaths(state: MnemicMemoryState, sourceMemoryUid: string): AgentMemoryRelationPath[] {
  const memoriesByUid = new Map(state.memories.map((memory) => [memory.entityUid, memory]))
  const directRelations = state.relations.filter((relation) => relation.sourceMemoryUid === sourceMemoryUid)
  const paths: AgentMemoryRelationPath[] = []

  for (const relation of directRelations) {
    const target = memoriesByUid.get(relation.targetMemoryUid)
    if (!target) continue
    paths.push({
      nodeUids: [sourceMemoryUid, relation.targetMemoryUid],
      titles: [memoriesByUid.get(sourceMemoryUid)?.title ?? sourceMemoryUid, target.title],
      relationshipTypes: [relation.relationshipType],
      score: round(1 + target.importance * 0.25),
    })
    const secondHopRelations = state.relations.filter((candidate) => candidate.sourceMemoryUid === relation.targetMemoryUid)
    for (const secondHop of secondHopRelations) {
      if (secondHop.targetMemoryUid === sourceMemoryUid) continue
      const secondTarget = memoriesByUid.get(secondHop.targetMemoryUid)
      if (!secondTarget) continue
      paths.push({
        nodeUids: [sourceMemoryUid, relation.targetMemoryUid, secondHop.targetMemoryUid],
        titles: [memoriesByUid.get(sourceMemoryUid)?.title ?? sourceMemoryUid, target.title, secondTarget.title],
        relationshipTypes: [relation.relationshipType, secondHop.relationshipType],
        score: round(0.6 + target.importance * 0.15 + secondTarget.importance * 0.1),
      })
    }
  }

  return paths
    .sort((left, right) => right.score - left.score || left.nodeUids.join('/').localeCompare(right.nodeUids.join('/')))
    .slice(0, 8)
}

function isStaleMemory(memory: AgentMemoryRecord): boolean {
  if (!memory.validTo) return false
  const validTo = new Date(memory.validTo)
  return Number.isFinite(validTo.getTime()) && validTo.getTime() < Date.now()
}

function isMemoryValidAt(memory: AgentMemoryRecord, asOf: string | undefined): boolean {
  if (!asOf) return true
  const asOfMs = Date.parse(asOf)
  if (!Number.isFinite(asOfMs)) return true
  const validFromMs = memory.validFrom ? Date.parse(memory.validFrom) : undefined
  const validToMs = memory.validTo ? Date.parse(memory.validTo) : undefined
  if (validFromMs !== undefined && Number.isFinite(validFromMs) && validFromMs > asOfMs) return false
  if (validToMs !== undefined && Number.isFinite(validToMs) && validToMs < asOfMs) return false
  return true
}

function isInstantAtOrBefore(value: string, asOf: string | undefined): boolean {
  if (!asOf) return true
  const valueMs = Date.parse(value)
  const asOfMs = Date.parse(asOf)
  if (!Number.isFinite(valueMs) || !Number.isFinite(asOfMs)) return true
  return valueMs <= asOfMs
}

function parseOptionalInstant(value: string | undefined, fieldName: string): string | undefined {
  const raw = blankToEmpty(value)
  if (!raw) return undefined
  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpError(400, `${fieldName} must be a valid ISO-8601 timestamp.`)
  }
  return parsed.toISOString()
}

function recallReasons(
  memory: AgentMemoryRecord,
  lexicalScore: number,
  importanceBoost: number,
  relationBoost: number,
  stale: boolean,
  matchedFields: string[],
): string[] {
  const reasons: string[] = []
  if (lexicalScore > 0) {
    reasons.push(`Matched ${matchedFields.join(', ')}.`)
  }
  if (importanceBoost >= 0.75) {
    reasons.push(`High importance ${memory.importance}.`)
  }
  if (relationBoost > 0) {
    reasons.push('Connected to related memories.')
  }
  if (stale) {
    reasons.push(`Marked stale after ${memory.validTo}.`)
  }
  if (!reasons.length) {
    reasons.push('Ranked by recency, importance, and graph context.')
  }
  return reasons
}

function score(record: AgentMemoryRecord, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 1 + record.importance
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const haystack = normalize([
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
  if (normalize(record.title).includes(normalizedQuery)) value += 3
  if (normalize(record.content).includes(normalizedQuery)) value += 2
  if (value === 0) return 0
  return value + Math.max(0, record.importance)
}

function isProblemMemory(memory: AgentMemoryRecord): boolean {
  const joined = normalize([memory.memoryType, memory.title, ...memory.tags].join(' '))
  return ['problem', 'error', 'bug', 'blocker', 'risk'].some((token) => joined.includes(token))
}

function formatBriefing(
  project: string | undefined,
  generatedAt: string,
  recent: AgentMemoryRecord[],
  highImportance: AgentMemoryRecord[],
  openProblems: AgentMemoryRecord[],
): string {
  return [
    'Mnemic Agent Memory Session Briefing',
    `Project: ${project && project.trim() ? project : '(any)'}`,
    `Generated at: ${generatedAt}`,
    '',
    formatBriefingSection('Recent memories', recent),
    formatBriefingSection('High-importance memories', highImportance),
    formatBriefingSection('Problems / risks to check', openProblems),
  ].join('\n').trim()
}

function formatBriefingSection(title: string, memories: AgentMemoryRecord[]): string {
  if (!memories.length) {
    return `${title}:\n- none\n`
  }
  return [
    `${title}:`,
    ...memories.flatMap((memory) => [
      `- [${memory.memoryType}] ${memory.title} (uid=${memory.entityUid}, importance=${memory.importance}, confidence=${memory.confidence})`,
      `  ${truncate(memory.content, 220)}`,
    ]),
    '',
  ].join('\n')
}

function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
}

function sanitizeRelationshipType(relationshipType: string | undefined): string {
  const sanitized = relationshipType?.trim().replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()
  return sanitized || defaultRelationType
}

function matches(value: string, normalizedFilter: string): boolean {
  return !normalizedFilter || normalize(value) === normalizedFilter
}

function countBy<T>(values: T[], getKey: (value: T) => string): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = getKey(value)
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function compareUpdatedAt(left: AgentMemoryRecord, right: AgentMemoryRecord): number {
  return (left.updatedAt || '').localeCompare(right.updatedAt || '')
}

function boundLimit(limit: number): number {
  return Math.max(1, Math.min(limit, maxSearchLimit))
}

function assertNonBlank(value: string | undefined, message: string): void {
  if (!value || !value.trim()) {
    throw new HttpError(400, message)
  }
}

function valueOrDefault(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback
}

function blankToEmpty(value: string | undefined): string {
  return value && value.trim() ? value.trim() : ''
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars - 3)}...`
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
