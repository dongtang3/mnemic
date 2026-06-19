#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  MnemicClient,
  type AgentMemoryAudit,
  type AgentMemoryJsonlExport,
  type AgentMemoryPolicyStatus,
  type AgentMemoryRecord,
  type AgentMemoryRequest,
  type AgentMemoryRollbackPreview,
  type AgentMemoryStats,
  type AgentMemoryTimeline,
} from '@mnemic/sdk'
import { z } from 'zod'

const apiBase = (process.env.MNEMIC_API_BASE ?? 'http://localhost:8088').replace(/\/$/, '')
const client = new MnemicClient({ baseUrl: apiBase })

const server = new McpServer({
  name: 'mnemic-memory',
  version: '0.1.0',
})

server.tool(
  'mnemic_audit',
  'Audit Mnemic memory hygiene for missing source keys, low confidence, stale records, orphan nodes, duplicates, and policy risks.',
  {
    project: z.string().optional().describe('Restrict audit to a project/repo scope.'),
  },
  async ({ project }) => {
    const audit = await client.audit(project)
    return textResult(formatAudit(audit))
  },
)

server.tool(
  'mnemic_policy',
  'Inspect the active Mnemic memory governance policy, including source-key requirements and secret detection.',
  {},
  async () => {
    const policy = await client.policy()
    return textResult(formatPolicyStatus(policy))
  },
)

server.tool(
  'mnemic_remember',
  'Store or update a long-term LLM/agent memory in Mnemic. Use sourceKey to make writes idempotent.',
  {
    title: z.string().min(1).describe('Short searchable title.'),
    content: z.string().min(1).describe('Memory body, including the decision, fix, pattern, or operational fact.'),
    memoryType: z.string().optional().describe('Example: decision, fix, error, workflow, code_pattern, release.'),
    project: z.string().optional().describe('Repo or product scope, such as mnemic.'),
    tags: z.array(z.string()).optional().describe('Search tags such as typescript, mcp, graphrag.'),
    source: z.string().optional().describe('Where this memory came from, such as codex, claude-code, commit, ticket.'),
    sourceKey: z.string().optional().describe('Stable external key for idempotent upsert, such as commit SHA or ticket id.'),
    actor: z.string().optional().describe('Human or agent that recorded this memory.'),
    importance: z.number().min(0).max(1).optional().describe('0 to 1 ranking for recall priority.'),
    confidence: z.number().min(0).max(1).optional().describe('0 to 1 confidence that this memory is correct/current.'),
    observedAt: z.string().optional().describe('When the fact was observed, preferably ISO-8601.'),
    validFrom: z.string().optional().describe('When the fact starts being valid, preferably ISO-8601.'),
    validTo: z.string().optional().describe('When the fact stops being valid. Omit for open-ended memories.'),
    relatedMemoryUids: z.array(z.string()).optional().describe('Existing Mnemic AgentMemory entity UIDs to link.'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional structured metadata.'),
  },
  async (args) => {
    const memory = await client.remember(args as AgentMemoryRequest)
    return textResult(formatMemory(memory))
  },
)

server.tool(
  'mnemic_preview_memory',
  'Dry-run a Mnemic memory write. Returns the would-be record, diff, relation changes, and warnings without mutating memory.',
  {
    title: z.string().min(1).describe('Short searchable title.'),
    content: z.string().min(1).describe('Memory body, including the decision, fix, pattern, or operational fact.'),
    memoryType: z.string().optional().describe('Example: decision, fix, error, workflow, code_pattern, release.'),
    project: z.string().optional().describe('Repo or product scope, such as mnemic.'),
    tags: z.array(z.string()).optional().describe('Search tags such as typescript, mcp, graphrag.'),
    source: z.string().optional().describe('Where this memory came from, such as codex, claude-code, commit, ticket.'),
    sourceKey: z.string().optional().describe('Stable external key for idempotent upsert, such as commit SHA or ticket id.'),
    actor: z.string().optional().describe('Human or agent that recorded this memory.'),
    importance: z.number().min(0).max(1).optional().describe('0 to 1 ranking for recall priority.'),
    confidence: z.number().min(0).max(1).optional().describe('0 to 1 confidence that this memory is correct/current.'),
    observedAt: z.string().optional().describe('When the fact was observed, preferably ISO-8601.'),
    validFrom: z.string().optional().describe('When the fact starts being valid, preferably ISO-8601.'),
    validTo: z.string().optional().describe('When the fact stops being valid. Omit for open-ended memories.'),
    relatedMemoryUids: z.array(z.string()).optional().describe('Existing Mnemic AgentMemory entity UIDs to link.'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional structured metadata.'),
  },
  async (args) => {
    const preview = await client.previewMemory(args as AgentMemoryRequest)
    return textResult(formatWritePreview(preview))
  },
)

server.tool(
  'mnemic_recall',
  'Search Mnemic memories by query, project, memory type, or tag.',
  {
    query: z.string().optional().describe('Natural language or keyword query.'),
    project: z.string().optional().describe('Restrict to a project/repo scope.'),
    memoryType: z.string().optional().describe('Restrict to one memory type.'),
    tag: z.string().optional().describe('Restrict to one tag.'),
    asOf: z.string().optional().describe('Only return memories whose validity window includes this ISO-8601 timestamp.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum records to return.'),
  },
  async (args) => {
    const memories = await client.recall(args)
    return textResult(memories.length ? memories.map(formatMemory).join('\n\n') : 'No Mnemic memories matched.')
  },
)

server.tool(
  'mnemic_explain_recall',
  'Explain Mnemic recall ranking with matched fields, matched terms, scores, staleness, and relation paths.',
  {
    query: z.string().optional().describe('Natural language or keyword query.'),
    project: z.string().optional().describe('Restrict to a project/repo scope.'),
    memoryType: z.string().optional().describe('Restrict to one memory type.'),
    tag: z.string().optional().describe('Restrict to one tag.'),
    asOf: z.string().optional().describe('Only explain memories whose validity window includes this ISO-8601 timestamp.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum records to explain.'),
  },
  async (args) => {
    const explanation = await client.explainRecall(args)
    return textResult(formatRecallExplanation(explanation))
  },
)

server.tool(
  'mnemic_get_memory',
  'Fetch one Mnemic memory by entity UID.',
  {
    memoryUid: z.string().min(1).describe('AgentMemory entity UID.'),
  },
  async ({ memoryUid }) => {
    const memory = await client.getMemory(memoryUid)
    return textResult(formatMemory(memory))
  },
)

server.tool(
  'mnemic_context_pack',
  'Build a compact context pack from Mnemic memories for Codex, Claude Code, or another coding agent.',
  {
    query: z.string().optional().describe('The current task or question.'),
    project: z.string().optional().describe('Project/repo scope.'),
    asOf: z.string().optional().describe('Only include memories whose validity window includes this ISO-8601 timestamp.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum memories in the context pack.'),
  },
  async (args) => {
    const pack = await client.contextPack(args.query, args.project, args.limit, args.asOf)
    return textResult(pack.context)
  },
)

server.tool(
  'mnemic_session_briefing',
  'Get a session-start briefing from Mnemic memories: recent context, high-importance items, and problems or risks.',
  {
    project: z.string().optional().describe('Project/repo scope.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum memories per briefing section.'),
  },
  async (args) => {
    const briefing = await client.sessionBriefing(args.project, args.limit)
    return textResult(briefing.briefing)
  },
)

server.tool(
  'mnemic_memory_stats',
  'Get Mnemic memory statistics for coverage checks and maintenance.',
  {},
  async () => {
    const stats = await client.stats()
    return textResult(formatStats(stats))
  },
)

server.tool(
  'mnemic_memory_timeline',
  'Read a recent Mnemic memory timeline for audit, handoff, or session-start review.',
  {
    project: z.string().optional().describe('Restrict to a project/repo scope.'),
    memoryType: z.string().optional().describe('Restrict to one memory type.'),
    tag: z.string().optional().describe('Restrict to one tag.'),
    asOf: z.string().optional().describe('Only return events at or before this ISO-8601 timestamp.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum timeline entries to return.'),
  },
  async (args) => {
    const timeline = await client.timeline(args)
    return textResult(formatTimeline(timeline))
  },
)

server.tool(
  'mnemic_snapshot',
  'Reconstruct a Mnemic memory graph snapshot by replaying the append-only event log up to an optional asOf timestamp.',
  {
    project: z.string().optional().describe('Restrict to a project/repo scope.'),
    memoryType: z.string().optional().describe('Restrict to one memory type.'),
    tag: z.string().optional().describe('Restrict to one tag.'),
    asOf: z.string().optional().describe('Replay events at or before this ISO-8601 timestamp. Omit for current event-log state.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum memories to include in the snapshot.'),
  },
  async (args) => {
    const snapshot = await client.snapshot(args)
    return textResult(formatSnapshot(snapshot))
  },
)

server.tool(
  'mnemic_export_jsonl',
  'Export Mnemic memory events as JSONL for audit, handoff, or pull-request review.',
  {
    project: z.string().optional().describe('Restrict to a project/repo scope.'),
    memoryType: z.string().optional().describe('Restrict to one memory type.'),
    tag: z.string().optional().describe('Restrict to one tag.'),
    asOf: z.string().optional().describe('Only export events at or before this ISO-8601 timestamp.'),
    limit: z.number().int().min(1).max(10000).optional().describe('Maximum JSONL lines to return.'),
  },
  async (args) => {
    const exported = await client.exportJsonl(args)
    return textResult(formatJsonlExport(exported))
  },
)

server.tool(
  'mnemic_import_jsonl',
  'Import Mnemic memory events from JSONL. Defaults to dry-run; set confirm=true to mutate memory state.',
  {
    jsonl: z.string().min(1).describe('JSONL generated by mnemic_export_jsonl or GET /api/agent-memory/export.'),
    confirm: z.boolean().optional().describe('Set true to import. Omit or false for dry-run preview.'),
    actor: z.string().optional().describe('Human or agent importing the reviewed events.'),
  },
  async ({ jsonl, confirm, actor }) => {
    const result = await client.importJsonl({ jsonl, confirm, actor })
    return textResult(formatImportResult(result))
  },
)

server.tool(
  'mnemic_rollback_preview',
  'Preview the state change for rolling back one Mnemic memory event. This does not mutate memory.',
  {
    eventUid: z.string().min(1).describe('MemoryEvent UID to preview, such as MemoryEvent-3.'),
  },
  async ({ eventUid }) => {
    const preview = await client.rollbackPreview(eventUid)
    return textResult(formatRollbackPreview(preview))
  },
)

server.tool(
  'mnemic_rollback',
  'Apply a policy-gated rollback for the latest Mnemic memory event. Requires confirm=true and mutates memory state.',
  {
    eventUid: z.string().min(1).describe('Latest MemoryEvent UID to roll back, such as MemoryEvent-3.'),
    confirm: z.boolean().describe('Must be true to apply rollback.'),
    actor: z.string().optional().describe('Human or agent applying the rollback.'),
    reason: z.string().optional().describe('Short reason for the rollback.'),
  },
  async ({ eventUid, confirm, actor, reason }) => {
    const result = await client.rollback({ eventUid, confirm, actor, reason })
    return textResult(formatRollbackResult(result))
  },
)

server.tool(
  'mnemic_link_memories',
  'Create a graph relationship between two Mnemic memories.',
  {
    memoryUid: z.string().min(1).describe('Source AgentMemory entity UID.'),
    targetMemoryUid: z.string().min(1).describe('Target AgentMemory entity UID.'),
    relationshipType: z.string().optional().describe('Relationship type. Defaults to MEMORY_RELATED_TO.'),
    attributes: z.record(z.string(), z.unknown()).optional().describe('Relationship attributes.'),
  },
  async ({ memoryUid, targetMemoryUid, relationshipType, attributes }) => {
    const memory = await client.linkMemories(memoryUid, {
      targetMemoryUid,
      relationshipType,
      attributes: attributes as Record<string, string | number | boolean | null>,
    })
    return textResult(formatMemory(memory))
  },
)

function textResult(text: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  }
}

function formatMemory(memory: AgentMemoryRecord): string {
  const lines = [
    `[${memory.memoryType || 'note'}] ${memory.title}`,
    `uid: ${memory.entityUid}`,
    `project: ${memory.project || '(none)'}`,
    `importance: ${memory.importance}`,
    `confidence: ${memory.confidence}`,
  ]
  if (memory.tags?.length) {
    lines.push(`tags: ${memory.tags.join(', ')}`)
  }
  if (memory.source) {
    lines.push(`source: ${memory.source}`)
  }
  if (memory.sourceKey) {
    lines.push(`sourceKey: ${memory.sourceKey}`)
  }
  if (memory.relatedMemoryUids?.length) {
    lines.push(`related: ${memory.relatedMemoryUids.join(', ')}`)
  }
  if (memory.observedAt) {
    lines.push(`observedAt: ${memory.observedAt}`)
  }
  if (memory.validFrom || memory.validTo) {
    lines.push(`valid: ${memory.validFrom || 'unknown'} -> ${memory.validTo || 'open'}`)
  }
  lines.push(`updatedAt: ${memory.updatedAt}`)
  lines.push(`content: ${memory.content}`)
  return lines.join('\n')
}

function formatWritePreview(preview: Awaited<ReturnType<MnemicClient['previewMemory']>>): string {
  const policyFindings = preview.policyFindings ?? []
  const lines = [
    'Mnemic Memory Write Preview',
    `generatedAt: ${preview.generatedAt}`,
    `dryRun: ${preview.dryRun}`,
    `action: ${preview.action}`,
    `eventType: ${preview.eventType}`,
    `memoryUid: ${preview.memoryUid}`,
    `wouldAppendEventUid: ${preview.wouldAppendEventUid}`,
    `sourceKeyMatched: ${preview.sourceKeyMatched}`,
    `changedFields: ${preview.diff.changedFields.join(', ') || '(none)'}`,
    `relationPreviews: ${preview.relationPreviews.length}`,
    `policyFindings: ${policyFindings.length}`,
    `before: memories=${preview.before.memoryCount}, relations=${preview.before.relationCount}, events=${preview.before.eventCount}`,
    `after: memories=${preview.after.memoryCount}, relations=${preview.after.relationCount}, events=${preview.after.eventCount}`,
  ]
  for (const relation of preview.relationPreviews) {
    lines.push(`relation: ${relation.relationshipType} -> ${relation.targetMemoryUid} alreadyExists=${relation.alreadyExists}`)
  }
  for (const finding of policyFindings) {
    lines.push(`policy: ${finding.severity} ${finding.policyId} ${finding.field} - ${finding.message}`)
  }
  for (const warning of preview.warnings) {
    lines.push(`warning: ${warning}`)
  }
  return lines.join('\n')
}

function formatPolicyStatus(policy: AgentMemoryPolicyStatus): string {
  const lines = [
    'Mnemic Policy Status',
    `generatedAt: ${policy.generatedAt}`,
    `source: ${policy.source.kind}${policy.source.policyFile ? ` (${policy.source.policyFile})` : ''}`,
    `requireSourceKey.memoryTypes: ${policy.config.requireSourceKey.memoryTypes.join(', ') || '(none)'}`,
    `requireSourceKey.tags: ${policy.config.requireSourceKey.tags.join(', ') || '(none)'}`,
    `requireSourceKey.severity: ${policy.config.requireSourceKey.severity}`,
    `secrets.enabled: ${policy.config.secrets.enabled}`,
    `secrets.severity: ${policy.config.secrets.severity}`,
    `secrets.builtInPolicyIds: ${policy.config.secrets.builtInPolicyIds.join(', ') || '(none)'}`,
    `secrets.customPatterns: ${policy.config.secrets.customPatterns.length}`,
    `confidence.lowWarningBelow: ${policy.config.confidence.lowWarningBelow}`,
    `confidence.highImportanceThreshold: ${policy.config.confidence.highImportanceThreshold}`,
    `confidence.highImportanceLowWarningBelow: ${policy.config.confidence.highImportanceLowWarningBelow}`,
    `stale.staleOnArrivalSeverity: ${policy.config.stale.staleOnArrivalSeverity}`,
  ]
  for (const pattern of policy.config.secrets.customPatterns) {
    lines.push(`customPattern: ${pattern.policyId} fields=${pattern.fields?.join('|') || 'all'} severity=${pattern.severity ?? policy.config.secrets.severity}`)
  }
  return lines.join('\n')
}

function formatAudit(audit: AgentMemoryAudit): string {
  const lines = [
    'Mnemic Memory Audit',
    `generatedAt: ${audit.generatedAt}`,
    `project: ${audit.project || '(any)'}`,
    `totalMemories: ${audit.totalMemories}`,
    `healthScore: ${audit.healthScore}`,
    `blocks: ${audit.summary.blockCount}`,
    `warnings: ${audit.summary.warningCount}`,
    `info: ${audit.summary.infoCount}`,
    `missingSourceKeys: ${audit.summary.missingSourceKeyCount}`,
    `lowConfidence: ${audit.summary.lowConfidenceCount}`,
    `stale: ${audit.summary.staleCount}`,
    `orphans: ${audit.summary.orphanCount}`,
    `duplicateTitles: ${audit.summary.duplicateTitleCount}`,
  ]
  for (const finding of audit.findings.slice(0, 20)) {
    lines.push('')
    lines.push(`- ${finding.severity} ${finding.category} ${finding.memoryUid}`)
    lines.push(`  title: ${finding.title}`)
    lines.push(`  message: ${finding.message}`)
    lines.push(`  recommendation: ${finding.recommendation}`)
  }
  if (audit.findings.length > 20) {
    lines.push('')
    lines.push(`... ${audit.findings.length - 20} more findings`)
  }
  return lines.join('\n')
}

function formatStats(stats: AgentMemoryStats): string {
  return [
    'Mnemic Agent Memory Stats',
    `generatedAt: ${stats.generatedAt}`,
    `totalMemories: ${stats.totalMemories}`,
    `averageImportance: ${stats.averageImportance}`,
    `averageConfidence: ${stats.averageConfidence}`,
    `explicitRelationCount: ${stats.explicitRelationCount}`,
    `eventCount: ${stats.eventCount}`,
    `latestUpdatedAt: ${stats.latestUpdatedAt || '(none)'}`,
    `latestEventAt: ${stats.latestEventAt || '(none)'}`,
    `byMemoryType: ${formatCountMap(stats.byMemoryType)}`,
    `byProject: ${formatCountMap(stats.byProject)}`,
  ].join('\n')
}

function formatTimeline(timeline: AgentMemoryTimeline): string {
  const lines = [
    'Mnemic Agent Memory Timeline',
    `project: ${timeline.project || '(any)'}`,
    `generatedAt: ${timeline.generatedAt}`,
  ]
  if (!timeline.entries.length) {
    lines.push('entries: none')
    return lines.join('\n')
  }
  for (const entry of timeline.entries) {
    lines.push('')
    lines.push(`- ${entry.eventType} at ${entry.eventAt}`)
    lines.push(`  eventUid: ${entry.eventUid}`)
    lines.push(`  uid: ${entry.memory.entityUid}`)
    lines.push(`  title: ${entry.memory.title}`)
    lines.push(`  type: ${entry.memory.memoryType}`)
    if (entry.targetMemoryUid) lines.push(`  targetUid: ${entry.targetMemoryUid}`)
    if (entry.relationshipType) lines.push(`  relationship: ${entry.relationshipType}`)
    if (entry.memory.project) lines.push(`  project: ${entry.memory.project}`)
    if (entry.memory.sourceKey) lines.push(`  sourceKey: ${entry.memory.sourceKey}`)
    if (entry.memory.tags.length) lines.push(`  tags: ${entry.memory.tags.join(', ')}`)
    lines.push(`  importance: ${entry.memory.importance}`)
    lines.push(`  confidence: ${entry.memory.confidence}`)
    const changedFields = entry.diff?.changedFields ?? []
    if (changedFields.length) {
      lines.push(`  diff: ${entry.diff?.subject ?? 'none'} changed ${changedFields.join(', ')}`)
    }
  }
  return lines.join('\n')
}

function formatSnapshot(snapshot: Awaited<ReturnType<MnemicClient['snapshot']>>): string {
  const lines = [
    'Mnemic Memory Snapshot',
    `generatedAt: ${snapshot.generatedAt}`,
    `asOf: ${snapshot.asOf || '(current event log)'}`,
    `project: ${snapshot.project || '(any)'}`,
    `memoryType: ${snapshot.memoryType || '(any)'}`,
    `tag: ${snapshot.tag || '(any)'}`,
    `eventsReplayed: ${snapshot.eventCount}`,
    `latestEventAt: ${snapshot.latestEventAt || '(none)'}`,
    `memories: ${snapshot.memoryCount}`,
    `relations: ${snapshot.relationCount}`,
  ]
  for (const memory of snapshot.memories.slice(0, 20)) {
    lines.push('')
    lines.push(`- ${memory.title}`)
    lines.push(`  uid: ${memory.entityUid}`)
    lines.push(`  type: ${memory.memoryType}`)
    lines.push(`  updatedAt: ${memory.updatedAt || '(unknown)'}`)
    if (memory.project) lines.push(`  project: ${memory.project}`)
    if (memory.sourceKey) lines.push(`  sourceKey: ${memory.sourceKey}`)
    if (memory.tags.length) lines.push(`  tags: ${memory.tags.join(', ')}`)
    if (memory.validFrom || memory.validTo) lines.push(`  valid: ${memory.validFrom || 'unknown'} -> ${memory.validTo || 'open'}`)
    if (memory.relatedMemoryUids.length) lines.push(`  related: ${memory.relatedMemoryUids.join(', ')}`)
    lines.push(`  content: ${memory.content}`)
  }
  if (snapshot.memories.length > 20) {
    lines.push('')
    lines.push(`... ${snapshot.memories.length - 20} more memories`)
  }
  return lines.join('\n')
}

function formatRecallExplanation(explanation: Awaited<ReturnType<MnemicClient['explainRecall']>>): string {
  const lines = [
    'Mnemic Recall Explanation',
    `query: ${explanation.query || '(none)'}`,
    `project: ${explanation.project || '(any)'}`,
    `generatedAt: ${explanation.generatedAt}`,
  ]
  if (!explanation.entries.length) {
    lines.push('entries: none')
    return lines.join('\n')
  }
  for (const entry of explanation.entries) {
    lines.push('')
    lines.push(`- ${entry.memory.title}`)
    lines.push(`  uid: ${entry.memory.entityUid}`)
    lines.push(`  score: ${entry.score} lexical=${entry.lexicalScore} importance=${entry.importanceBoost} relation=${entry.relationBoost}`)
    lines.push(`  matchedFields: ${entry.matchedFields.join(', ') || '(none)'}`)
    lines.push(`  matchedTerms: ${entry.matchedTerms.join(', ') || '(none)'}`)
    lines.push(`  stale: ${entry.stale}`)
    lines.push(`  reasons: ${entry.reasons.join(' ')}`)
    if (entry.relationPaths.length) {
      lines.push(`  relationPaths: ${entry.relationPaths.map((path) => `${path.titles.join(' -> ')} (${path.score})`).join('; ')}`)
    }
  }
  return lines.join('\n')
}

function formatJsonlExport(exported: AgentMemoryJsonlExport): string {
  if (!exported.lineCount) {
    return 'No Mnemic memory events matched.'
  }
  return exported.jsonl.trimEnd()
}

function formatImportResult(result: Awaited<ReturnType<MnemicClient['importJsonl']>>): string {
  return [
    importResultTitle(result),
    `generatedAt: ${result.generatedAt}`,
    `applied: ${result.applied}`,
    `dryRun: ${result.dryRun}`,
    `parsedEventCount: ${result.parsedEventCount}`,
    `importedEventCount: ${result.importedEventCount}`,
    `skippedDuplicateEventCount: ${result.skippedDuplicateEventCount}`,
    `importedEventUids: ${result.importedEventUids.join(', ') || '(none)'}`,
    `skippedDuplicateEventUids: ${result.skippedDuplicateEventUids.join(', ') || '(none)'}`,
    `warning: ${result.warning}`,
    `before: memories=${result.before.memoryCount}, relations=${result.before.relationCount}, events=${result.before.eventCount}`,
    `after: memories=${result.after.memoryCount}, relations=${result.after.relationCount}, events=${result.after.eventCount}`,
  ].join('\n')
}

function importResultTitle(result: Awaited<ReturnType<MnemicClient['importJsonl']>>): string {
  if (result.applied) return 'Mnemic JSONL Import Applied'
  if (result.dryRun) return 'Mnemic JSONL Import Preview'
  return 'Mnemic JSONL Import No Changes'
}

function formatRollbackPreview(preview: AgentMemoryRollbackPreview): string {
  const lines = [
    'Mnemic Rollback Preview',
    `generatedAt: ${preview.generatedAt}`,
    `eventUid: ${preview.eventUid}`,
    `eventType: ${preview.targetEvent.eventType}`,
    `eventAt: ${preview.targetEvent.eventAt}`,
    `isLatestEvent: ${preview.isLatestEvent}`,
    `laterEventCount: ${preview.laterEventCount}`,
    `operation: ${preview.operation.action}`,
    `description: ${preview.operation.description}`,
    `warning: ${preview.warning}`,
    `before: memories=${preview.before.memoryCount}, relations=${preview.before.relationCount}, events=${preview.before.eventCount}`,
    `after: memories=${preview.after.memoryCount}, relations=${preview.after.relationCount}, events=${preview.after.eventCount}`,
    `current: memories=${preview.current.memoryCount}, relations=${preview.current.relationCount}, events=${preview.current.eventCount}`,
  ]
  if (preview.operation.previousMemory) {
    lines.push(`previousTitle: ${preview.operation.previousMemory.title}`)
  }
  if (preview.operation.currentMemory) {
    lines.push(`currentTitle: ${preview.operation.currentMemory.title}`)
  }
  return lines.join('\n')
}

function formatRollbackResult(result: Awaited<ReturnType<MnemicClient['rollback']>>): string {
  return [
    'Mnemic Rollback Applied',
    `generatedAt: ${result.generatedAt}`,
    `rolledBackEventUid: ${result.rolledBackEventUid}`,
    `rollbackEventUid: ${result.rollbackEvent.eventUid}`,
    `operation: ${result.operation.action}`,
    `description: ${result.operation.description}`,
    `before: memories=${result.before.memoryCount}, relations=${result.before.relationCount}, events=${result.before.eventCount}`,
    `after: memories=${result.after.memoryCount}, relations=${result.after.relationCount}, events=${result.after.eventCount}`,
  ].join('\n')
}

function formatCountMap(values: Record<string, number>): string {
  const entries = Object.entries(values ?? {})
  if (!entries.length) {
    return '(none)'
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(', ')
}

const transport = new StdioServerTransport()
await server.connect(transport)
