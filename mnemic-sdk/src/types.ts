export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type JsonObject = Record<string, JsonValue>

export type AgentMemoryRequest = {
  title: string
  content: string
  memoryType?: string
  project?: string
  tags?: string[]
  source?: string
  sourceKey?: string
  actor?: string
  importance?: number
  confidence?: number
  observedAt?: string
  validFrom?: string
  validTo?: string
  relatedMemoryUids?: string[]
  metadata?: JsonObject
}

export type AgentMemoryRelationRequest = {
  targetMemoryUid: string
  relationshipType?: string
  attributes?: JsonObject
}

export type AgentMemoryRecord = {
  entityUid: string
  title: string
  content: string
  memoryType: string
  project: string
  tags: string[]
  source: string
  sourceKey: string
  actor: string
  importance: number
  confidence: number
  observedAt: string
  validFrom: string
  validTo: string
  createdAt: string
  updatedAt: string
  metadata: JsonObject
  relatedMemoryUids: string[]
  policyFindings?: AgentMemoryPolicyFinding[]
}

export type AgentMemoryPolicySeverity = 'info' | 'warning' | 'block'

export type AgentMemoryPolicyFinding = {
  policyId: string
  severity: AgentMemoryPolicySeverity
  field: string
  message: string
  recommendation: string
}

export type AgentMemoryPolicyConfig = {
  requireSourceKey?: {
    memoryTypes?: string[]
    tags?: string[]
    severity?: AgentMemoryPolicySeverity
  }
  secrets?: {
    enabled?: boolean
    severity?: AgentMemoryPolicySeverity
    customPatterns?: AgentMemorySecretPattern[]
  }
  confidence?: {
    lowWarningBelow?: number
    highImportanceThreshold?: number
    highImportanceLowWarningBelow?: number
  }
  stale?: {
    staleOnArrivalSeverity?: AgentMemoryPolicySeverity
  }
}

export type AgentMemoryResolvedPolicyConfig = {
  requireSourceKey: {
    memoryTypes: string[]
    tags: string[]
    severity: AgentMemoryPolicySeverity
  }
  secrets: {
    enabled: boolean
    severity: AgentMemoryPolicySeverity
    builtInPolicyIds: string[]
    customPatterns: AgentMemorySecretPattern[]
  }
  confidence: {
    lowWarningBelow: number
    highImportanceThreshold: number
    highImportanceLowWarningBelow: number
  }
  stale: {
    staleOnArrivalSeverity: AgentMemoryPolicySeverity
  }
}

export type AgentMemoryPolicySource = {
  kind: 'default' | 'file' | 'constructor'
  policyFile: string
}

export type AgentMemoryPolicyStatus = {
  generatedAt: string
  source: AgentMemoryPolicySource
  config: AgentMemoryResolvedPolicyConfig
}

export type AgentMemorySecretPattern = {
  policyId: string
  pattern: string
  fields?: Array<'title' | 'content' | 'source' | 'sourceKey' | 'tags' | 'metadata'>
  severity?: AgentMemoryPolicySeverity
  message?: string
  recommendation?: string
}

export type AgentMemoryRelation = {
  sourceMemoryUid: string
  targetMemoryUid: string
  relationshipType: string
  attributes: JsonObject
  createdAt: string
}

export type AgentMemoryContextPack = {
  query: string
  project: string
  asOf: string
  generatedAt: string
  memories: AgentMemoryRecord[]
  context: string
}

export type AgentMemoryRelationPath = {
  nodeUids: string[]
  titles: string[]
  relationshipTypes: string[]
  score: number
}

export type AgentMemoryRecallExplanationEntry = {
  memory: AgentMemoryRecord
  score: number
  lexicalScore: number
  importanceBoost: number
  relationBoost: number
  matchedTerms: string[]
  matchedFields: string[]
  fieldScores: Record<string, number>
  relationPaths: AgentMemoryRelationPath[]
  stale: boolean
  reasons: string[]
}

export type AgentMemoryRecallExplanation = {
  query: string
  project: string
  asOf: string
  generatedAt: string
  entries: AgentMemoryRecallExplanationEntry[]
}

export type AgentMemoryBriefing = {
  project: string
  generatedAt: string
  recentMemories: AgentMemoryRecord[]
  highImportanceMemories: AgentMemoryRecord[]
  openProblemMemories: AgentMemoryRecord[]
  briefing: string
}

export type AgentMemoryStats = {
  generatedAt: string
  totalMemories: number
  byMemoryType: Record<string, number>
  byProject: Record<string, number>
  averageImportance: number
  averageConfidence: number
  explicitRelationCount: number
  eventCount: number
  latestUpdatedAt: string
  latestEventAt: string
}

export type AgentMemoryAuditSeverity = 'info' | 'warning' | 'block'

export type AgentMemoryAuditFinding = {
  findingId: string
  severity: AgentMemoryAuditSeverity
  memoryUid: string
  title: string
  category: 'policy' | 'source-key' | 'confidence' | 'staleness' | 'relations' | 'duplicate' | 'metadata'
  message: string
  recommendation: string
}

export type AgentMemoryAudit = {
  generatedAt: string
  project: string
  totalMemories: number
  healthScore: number
  summary: {
    blockCount: number
    warningCount: number
    infoCount: number
    missingSourceKeyCount: number
    lowConfidenceCount: number
    staleCount: number
    orphanCount: number
    duplicateTitleCount: number
  }
  findings: AgentMemoryAuditFinding[]
}

export type AgentMemoryEventType = 'memory-created' | 'memory-updated' | 'memory-linked' | 'memory-rolled-back'

export type AgentMemoryEventDiff = {
  subject: 'memory' | 'relation' | 'state' | 'none'
  before: JsonObject | null
  after: JsonObject | null
  changedFields: string[]
}

export type AgentMemoryEvent = {
  eventUid: string
  eventType: AgentMemoryEventType
  eventAt: string
  memoryUid: string
  targetMemoryUid: string
  relationshipType: string
  actor: string
  source: string
  sourceKey: string
  project: string
  memoryType: string
  tags: string[]
  attributes: JsonObject
  diff: AgentMemoryEventDiff
  memorySnapshot: AgentMemoryRecord
}

export type AgentMemoryTimelineEntry = AgentMemoryEvent & {
  memory: AgentMemoryRecord
  targetMemory?: AgentMemoryRecord
}

export type AgentMemoryTimeline = {
  project: string
  asOf: string
  generatedAt: string
  entries: AgentMemoryTimelineEntry[]
}

export type AgentMemoryJsonlExportLine = {
  kind: 'mnemic.memory_event'
  schemaVersion: 1
  exportedAt: string
  event: AgentMemoryEvent
}

export type AgentMemoryJsonlExport = {
  format: 'jsonl'
  generatedAt: string
  project: string
  memoryType: string
  tag: string
  asOf: string
  lineCount: number
  jsonl: string
}

export type AgentMemorySnapshot = {
  generatedAt: string
  asOf: string
  project: string
  memoryType: string
  tag: string
  eventCount: number
  latestEventAt: string
  memoryCount: number
  relationCount: number
  memories: AgentMemoryRecord[]
  relations: AgentMemoryRelation[]
}

export type AgentMemoryStateSummary = {
  memoryCount: number
  relationCount: number
  eventCount: number
  memories: Array<Pick<AgentMemoryRecord, 'entityUid' | 'title' | 'memoryType' | 'project' | 'sourceKey' | 'updatedAt'>>
  relations: AgentMemoryRelation[]
}

export type AgentMemoryRelationPreview = {
  targetMemoryUid: string
  relationshipType: string
  alreadyExists: boolean
  diff: AgentMemoryEventDiff
}

export type AgentMemoryWritePreview = {
  generatedAt: string
  dryRun: true
  action: 'create' | 'update'
  eventType: Extract<AgentMemoryEventType, 'memory-created' | 'memory-updated'>
  wouldAppendEventUid: string
  memoryUid: string
  sourceKeyMatched: boolean
  beforeMemory?: AgentMemoryRecord
  afterMemory: AgentMemoryRecord
  diff: AgentMemoryEventDiff
  relationPreviews: AgentMemoryRelationPreview[]
  policyFindings: AgentMemoryPolicyFinding[]
  warnings: string[]
  before: AgentMemoryStateSummary
  after: AgentMemoryStateSummary
}

export type AgentMemoryJsonlImportRequest = {
  jsonl: string
  confirm?: boolean
  actor?: string
}

export type AgentMemoryJsonlImportResult = {
  generatedAt: string
  applied: boolean
  dryRun: boolean
  parsedEventCount: number
  importedEventCount: number
  skippedDuplicateEventCount: number
  importedEventUids: string[]
  skippedDuplicateEventUids: string[]
  warning: string
  before: AgentMemoryStateSummary
  after: AgentMemoryStateSummary
}

export type AgentMemoryRollbackOperation = {
  action: 'remove-memory' | 'restore-memory' | 'remove-relation' | 'no-op'
  memoryUid: string
  targetMemoryUid: string
  relationshipType: string
  description: string
  previousMemory?: AgentMemoryRecord
  currentMemory?: AgentMemoryRecord
}

export type AgentMemoryRollbackStateSummary = AgentMemoryStateSummary

export type AgentMemoryRollbackPreview = {
  generatedAt: string
  eventUid: string
  targetEvent: AgentMemoryEvent
  targetEventIndex: number
  isLatestEvent: boolean
  laterEventCount: number
  laterEvents: AgentMemoryEvent[]
  warning: string
  operation: AgentMemoryRollbackOperation
  before: AgentMemoryRollbackStateSummary
  after: AgentMemoryRollbackStateSummary
  current: AgentMemoryRollbackStateSummary
}

export type AgentMemoryRollbackRequest = {
  eventUid: string
  confirm: boolean
  actor?: string
  reason?: string
}

export type AgentMemoryRollbackResult = {
  generatedAt: string
  applied: true
  rolledBackEventUid: string
  rollbackEvent: AgentMemoryEvent
  operation: AgentMemoryRollbackOperation
  before: AgentMemoryRollbackStateSummary
  after: AgentMemoryRollbackStateSummary
}

export type HealthStatus = {
  status: string
  service: string
}

export type MnemicMemoryState = {
  version: 1
  nextSequence: number
  nextEventSequence: number
  memories: AgentMemoryRecord[]
  relations: AgentMemoryRelation[]
  events: AgentMemoryEvent[]
}
