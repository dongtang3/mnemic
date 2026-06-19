#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import {
  MnemicClient,
  type AgentMemoryAudit,
  type AgentMemoryPolicyStatus,
  type AgentMemoryRecallExplanation,
  type AgentMemoryRecord,
  type AgentMemoryRequest,
  type AgentMemoryRollbackPreview,
  type AgentMemorySnapshot,
  type AgentMemoryTimelineEntry,
  type AgentMemoryWritePreview,
} from '@mnemic/sdk'
import { formatDoctorReport, runDoctor } from './doctor.js'
import { formatMemoryEvalMarkdown, formatMemoryEvalResult, runMemoryEval } from './eval.js'
import { formatInitResult, runInit } from './init.js'

type ParsedArgs = {
  command: string
  positionals: string[]
  options: Record<string, string | boolean>
}

const helpText = `Mnemic CLI

Usage:
  mnemic init [--root .] [--project mnemic] [--port 8088] [--force]
  mnemic health [--base-url http://localhost:8088]
  mnemic remember --title "Decision" --content "What changed" [--project mnemic] [--type decision] [--tag sdk --tag mcp] [--source-key key] [--related AgentMemory-1]
  mnemic preview --title "Decision" --content "What changed" [--project mnemic] [--type decision] [--source-key key] [--related AgentMemory-1]
  mnemic recall [query] [--project mnemic] [--type decision] [--tag sdk] [--as-of 2026-06-18T00:00:00Z] [--limit 10]
  mnemic explain [query] [--project mnemic] [--type decision] [--tag sdk] [--as-of 2026-06-18T00:00:00Z] [--limit 10]
  mnemic link AgentMemory-1 AgentMemory-2 [--relationship-type supports] [--reason "why"]
  mnemic context [query] [--project mnemic] [--as-of 2026-06-18T00:00:00Z] [--limit 8]
  mnemic briefing [--project mnemic] [--limit 8]
  mnemic stats
  mnemic policy
  mnemic audit [--project mnemic] [--max-blocks 0] [--max-warnings 10]
  mnemic doctor [--project mnemic] [--root .] [--require-backend]
  mnemic timeline [--project mnemic] [--as-of 2026-06-18T00:00:00Z] [--limit 10]
  mnemic export [--project mnemic] [--type decision] [--tag sdk] [--as-of 2026-06-18T00:00:00Z] [--limit 100]
  mnemic snapshot [--project mnemic] [--type decision] [--tag sdk] [--as-of 2026-06-18T00:00:00Z] [--limit 50]
  mnemic import events.jsonl [--confirm]
  mnemic eval [--fixture coding-agent] [--project mnemic-eval] [--limit 5] [--json | --markdown] [--fail-below 0.8]
  mnemic rollback-preview MemoryEvent-1
  mnemic rollback MemoryEvent-1 --confirm [--reason "bad memory"]

Environment:
  MNEMIC_API_BASE defaults to http://localhost:8088.
`

async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv)
  if (!parsed.command || parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h' || parsed.options.help || parsed.options.h) {
    process.stdout.write(helpText)
    return
  }

  const baseUrl = stringOption(parsed, 'base-url') ?? process.env.MNEMIC_API_BASE ?? 'http://localhost:8088'
  const client = new MnemicClient({ baseUrl })

  switch (parsed.command) {
    case 'init':
      await runInitCommand(parsed)
      break
    case 'health':
      await runHealth(client)
      break
    case 'remember':
      await runRemember(client, parsed)
      break
    case 'preview':
      await runPreview(client, parsed)
      break
    case 'recall':
      await runRecall(client, parsed)
      break
    case 'explain':
      await runExplain(client, parsed)
      break
    case 'link':
      await runLink(client, parsed)
      break
    case 'context':
      await runContext(client, parsed)
      break
    case 'briefing':
      await runBriefing(client, parsed)
      break
    case 'stats':
      process.stdout.write(`${JSON.stringify(await client.stats(), null, 2)}\n`)
      break
    case 'policy':
      await runPolicy(client)
      break
    case 'audit':
      await runAudit(client, parsed)
      break
    case 'doctor':
      await runDoctorCommand(client, baseUrl, parsed)
      break
    case 'timeline':
      await runTimeline(client, parsed)
      break
    case 'export':
      await runExport(client, parsed)
      break
    case 'snapshot':
      await runSnapshot(client, parsed)
      break
    case 'import':
      await runImport(client, parsed)
      break
    case 'eval':
      await runEval(client, parsed)
      break
    case 'rollback-preview':
      await runRollbackPreview(client, parsed)
      break
    case 'rollback':
      await runRollback(client, parsed)
      break
    default:
      throw new CliError(`Unknown command: ${parsed.command}`)
  }
}

async function runInitCommand(parsed: ParsedArgs): Promise<void> {
  const result = await runInit({
    rootDir: stringOption(parsed, 'root') ?? process.cwd(),
    port: numberOption(parsed, 'port') ?? 8088,
    project: stringOption(parsed, 'project') ?? 'mnemic',
    force: booleanOption(parsed, 'force'),
  })
  process.stdout.write(`${formatInitResult(result)}\n`)
}

async function runHealth(client: MnemicClient): Promise<void> {
  const health = await client.health()
  process.stdout.write(`${health.status} ${health.service}\n`)
}

async function runRemember(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const memory = await client.remember(memoryRequestFromArgs(parsed))
  process.stdout.write(`${formatMemory(memory)}\n`)
}

async function runPreview(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const preview = await client.previewMemory(memoryRequestFromArgs(parsed))
  process.stdout.write(`${formatWritePreview(preview)}\n`)
}

async function runRecall(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const query = queryFromArgs(parsed)
  const memories = await client.recall({
    query,
    project: stringOption(parsed, 'project'),
    memoryType: stringOption(parsed, 'type'),
    tag: stringOption(parsed, 'tag'),
    asOf: stringOption(parsed, 'as-of'),
    limit: numberOption(parsed, 'limit'),
  })
  process.stdout.write(memories.length ? `${memories.map(formatMemory).join('\n\n')}\n` : 'No memories matched.\n')
}

async function runExplain(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const query = queryFromArgs(parsed)
  const explanation = await client.explainRecall({
    query,
    project: stringOption(parsed, 'project'),
    memoryType: stringOption(parsed, 'type'),
    tag: stringOption(parsed, 'tag'),
    asOf: stringOption(parsed, 'as-of'),
    limit: numberOption(parsed, 'limit'),
  })
  process.stdout.write(`${formatRecallExplanation(explanation)}\n`)
}

async function runLink(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const memoryUid = stringOption(parsed, 'memory') ?? blankToUndefined(parsed.positionals[0] ?? '')
  const targetMemoryUid = stringOption(parsed, 'target') ?? blankToUndefined(parsed.positionals[1] ?? '')
  if (!memoryUid || !targetMemoryUid) {
    throw new CliError('Missing memory UID or target UID. Usage: mnemic link AgentMemory-1 AgentMemory-2 [--relationship-type supports]')
  }

  const relationshipType = stringOption(parsed, 'relationship-type') ?? 'MEMORY_RELATED_TO'
  const reason = stringOption(parsed, 'reason')
  const linked = await client.linkMemories(memoryUid, {
    targetMemoryUid,
    relationshipType,
    attributes: {
      ...(reason ? { reason } : {}),
      linkedBy: 'mnemic-cli',
    },
  })
  process.stdout.write(`${formatLinkResult(linked, targetMemoryUid, relationshipType)}\n`)
}

async function runContext(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const query = queryFromArgs(parsed)
  const pack = await client.contextPack(query, stringOption(parsed, 'project'), numberOption(parsed, 'limit'), stringOption(parsed, 'as-of'))
  process.stdout.write(`${pack.context}\n`)
}

async function runBriefing(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const briefing = await client.sessionBriefing(stringOption(parsed, 'project'), numberOption(parsed, 'limit'))
  process.stdout.write(`${briefing.briefing}\n`)
}

async function runPolicy(client: MnemicClient): Promise<void> {
  const policy = await client.policy()
  process.stdout.write(`${formatPolicyStatus(policy)}\n`)
}

async function runAudit(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const audit = await client.audit(stringOption(parsed, 'project'))
  process.stdout.write(`${formatAudit(audit)}\n`)

  const maxBlocks = numberOption(parsed, 'max-blocks')
  const maxWarnings = numberOption(parsed, 'max-warnings')
  if (maxBlocks !== undefined && audit.summary.blockCount > maxBlocks) {
    process.exitCode = 1
  }
  if (maxWarnings !== undefined && audit.summary.warningCount > maxWarnings) {
    process.exitCode = 1
  }
}

async function runDoctorCommand(client: MnemicClient, baseUrl: string, parsed: ParsedArgs): Promise<void> {
  const report = await runDoctor({
    client,
    baseUrl,
    project: stringOption(parsed, 'project') ?? 'mnemic',
    rootDir: stringOption(parsed, 'root') ?? process.cwd(),
    requireBackend: booleanOption(parsed, 'require-backend'),
  })
  process.stdout.write(`${formatDoctorReport(report)}\n`)
  if (report.summary.fail > 0) {
    process.exitCode = 1
  }
}

async function runTimeline(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const timeline = await client.timeline({
    project: stringOption(parsed, 'project'),
    memoryType: stringOption(parsed, 'type'),
    tag: stringOption(parsed, 'tag'),
    asOf: stringOption(parsed, 'as-of'),
    limit: numberOption(parsed, 'limit'),
  })
  process.stdout.write(timeline.entries.length ? `${timeline.entries.map(formatEvent).join('\n\n')}\n` : 'No memory events matched.\n')
}

async function runExport(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const exported = await client.exportJsonl({
    project: stringOption(parsed, 'project'),
    memoryType: stringOption(parsed, 'type'),
    tag: stringOption(parsed, 'tag'),
    asOf: stringOption(parsed, 'as-of'),
    limit: numberOption(parsed, 'limit'),
  })
  process.stdout.write(exported.jsonl)
}

async function runSnapshot(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const snapshot = await client.snapshot({
    project: stringOption(parsed, 'project'),
    memoryType: stringOption(parsed, 'type'),
    tag: stringOption(parsed, 'tag'),
    asOf: stringOption(parsed, 'as-of'),
    limit: numberOption(parsed, 'limit'),
  })
  process.stdout.write(`${formatSnapshot(snapshot)}\n`)
}

async function runImport(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const path = stringOption(parsed, 'file') ?? blankToUndefined(parsed.positionals[0] ?? '')
  if (!path) throw new CliError('Missing JSONL file. Usage: mnemic import events.jsonl [--confirm]')
  const jsonl = path === '-' ? await readStdin() : await readFile(path, 'utf8')
  const result = await client.importJsonl({
    jsonl,
    confirm: booleanOption(parsed, 'confirm'),
    actor: stringOption(parsed, 'actor') ?? 'cli-user',
  })
  process.stdout.write(`${formatImportResult(result)}\n`)
}

async function runEval(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const result = await runMemoryEval(client, {
    fixture: stringOption(parsed, 'fixture') ?? 'coding-agent',
    project: stringOption(parsed, 'project') ?? 'mnemic-eval',
    limit: numberOption(parsed, 'limit') ?? 5,
  })
  const formatted = booleanOption(parsed, 'json')
    ? JSON.stringify(result, null, 2)
    : booleanOption(parsed, 'markdown')
      ? formatMemoryEvalMarkdown(result)
      : formatMemoryEvalResult(result)
  process.stdout.write(`${formatted}\n`)

  const failBelow = numberOption(parsed, 'fail-below')
  if (failBelow !== undefined && result.metrics.recallAtK < failBelow) {
    process.exitCode = 1
  }
}

async function runRollbackPreview(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const eventUid = stringOption(parsed, 'event-uid') ?? blankToUndefined(parsed.positionals[0] ?? '')
  if (!eventUid) throw new CliError('Missing event UID. Usage: mnemic rollback-preview MemoryEvent-1')
  const preview = await client.rollbackPreview(eventUid)
  process.stdout.write(`${formatRollbackPreview(preview)}\n`)
}

async function runRollback(client: MnemicClient, parsed: ParsedArgs): Promise<void> {
  const eventUid = stringOption(parsed, 'event-uid') ?? blankToUndefined(parsed.positionals[0] ?? '')
  if (!eventUid) throw new CliError('Missing event UID. Usage: mnemic rollback MemoryEvent-1 --confirm')
  const result = await client.rollback({
    eventUid,
    confirm: booleanOption(parsed, 'confirm'),
    actor: stringOption(parsed, 'actor') ?? 'cli-user',
    reason: stringOption(parsed, 'reason'),
  })
  process.stdout.write(`${formatRollbackResult(result)}\n`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...rest] = argv
  const parsed: ParsedArgs = { command, positionals: [], options: {} }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) {
      parsed.positionals.push(arg)
      continue
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    const key = rawKey.trim()
    if (!key) continue

    if (inlineValue !== undefined) {
      assignOption(parsed, key, inlineValue)
      continue
    }

    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      assignOption(parsed, key, next)
      index += 1
    } else {
      assignOption(parsed, key, true)
    }
  }

  return parsed
}

function assignOption(parsed: ParsedArgs, key: string, value: string | boolean): void {
  if ((key === 'tag' || key === 'related') && parsed.options[key]) {
    parsed.options[key] = `${parsed.options[key]},${value}`
    return
  }
  parsed.options[key] = value
}

function requiredOption(parsed: ParsedArgs, key: string): string {
  const value = stringOption(parsed, key)
  if (!value) throw new CliError(`Missing required option --${key}`)
  return value
}

function stringOption(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.options[key]
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim()
}

function numberOption(parsed: ParsedArgs, key: string): number | undefined {
  const value = stringOption(parsed, key)
  if (value === undefined) return undefined
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) throw new CliError(`--${key} must be a number`)
  return parsedValue
}

function booleanOption(parsed: ParsedArgs, key: string): boolean {
  return parsed.options[key] === true || parsed.options[key] === 'true'
}

function tagsOption(parsed: ParsedArgs): string[] {
  const value = stringOption(parsed, 'tag')
  return value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : []
}

function relatedOption(parsed: ParsedArgs): string[] {
  const value = stringOption(parsed, 'related')
  return value ? value.split(',').map((uid) => uid.trim()).filter(Boolean) : []
}

function memoryRequestFromArgs(parsed: ParsedArgs): AgentMemoryRequest {
  return {
    title: requiredOption(parsed, 'title'),
    content: requiredOption(parsed, 'content'),
    memoryType: stringOption(parsed, 'type') ?? 'note',
    project: stringOption(parsed, 'project') ?? 'mnemic',
    tags: tagsOption(parsed),
    source: stringOption(parsed, 'source') ?? 'mnemic-cli',
    sourceKey: stringOption(parsed, 'source-key'),
    actor: stringOption(parsed, 'actor') ?? 'cli-user',
    importance: numberOption(parsed, 'importance'),
    confidence: numberOption(parsed, 'confidence'),
    observedAt: stringOption(parsed, 'observed-at') ?? new Date().toISOString(),
    validFrom: stringOption(parsed, 'valid-from'),
    validTo: stringOption(parsed, 'valid-to'),
    relatedMemoryUids: relatedOption(parsed),
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function queryFromArgs(parsed: ParsedArgs): string | undefined {
  return stringOption(parsed, 'query') ?? blankToUndefined(parsed.positionals.join(' '))
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function formatMemory(memory: AgentMemoryRecord): string {
  const meta = [
    memory.memoryType,
    memory.project,
    memory.sourceKey ? `sourceKey=${memory.sourceKey}` : '',
    `importance=${memory.importance.toFixed(2)}`,
    `confidence=${memory.confidence.toFixed(2)}`,
  ].filter(Boolean).join(' | ')

  return `${memory.title}\n${meta}\n${memory.content}`
}

function formatEvent(event: AgentMemoryTimelineEntry): string {
  const changedFields = event.diff?.changedFields ?? []
  const diff = changedFields.length
    ? `\ndiff: ${event.diff?.subject ?? 'none'} changed ${changedFields.join(', ')}`
    : ''
  return `${event.eventType} ${event.memory.title}\n${event.eventAt} | ${event.eventUid}\n${event.memory.content}${diff}`
}

function formatSnapshot(snapshot: AgentMemorySnapshot): string {
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
    if (memory.sourceKey) lines.push(`  sourceKey: ${memory.sourceKey}`)
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

function formatRecallExplanation(explanation: AgentMemoryRecallExplanation): string {
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

function formatLinkResult(memory: AgentMemoryRecord, targetMemoryUid: string, relationshipType: string): string {
  return [
    'Mnemic Memories Linked',
    `source: ${memory.entityUid}`,
    `title: ${memory.title}`,
    `target: ${targetMemoryUid}`,
    `relationshipType: ${relationshipType}`,
    `related: ${memory.relatedMemoryUids.join(', ') || '(none)'}`,
  ].join('\n')
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

function formatWritePreview(preview: AgentMemoryWritePreview): string {
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

function formatRollbackPreview(preview: AgentMemoryRollbackPreview): string {
  const lines = [
    'Mnemic Rollback Preview',
    `eventUid: ${preview.eventUid}`,
    `eventType: ${preview.targetEvent.eventType}`,
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

function formatImportResult(result: Awaited<ReturnType<MnemicClient['importJsonl']>>): string {
  return [
    importResultTitle(result),
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

function formatRollbackResult(result: Awaited<ReturnType<MnemicClient['rollback']>>): string {
  return [
    'Mnemic Rollback Applied',
    `rolledBackEventUid: ${result.rolledBackEventUid}`,
    `rollbackEventUid: ${result.rollbackEvent.eventUid}`,
    `operation: ${result.operation.action}`,
    `description: ${result.operation.description}`,
    `before: memories=${result.before.memoryCount}, relations=${result.before.relationCount}, events=${result.before.eventCount}`,
    `after: memories=${result.after.memoryCount}, relations=${result.after.relationCount}, events=${result.after.eventCount}`,
  ].join('\n')
}

class CliError extends Error {}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = error instanceof CliError ? 2 : 1
})
