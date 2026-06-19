import {
  MnemicClient,
  type AgentMemoryRecallExplanationEntry,
  type AgentMemoryRecord,
  type AgentMemoryRequest,
} from '@mnemic/sdk'

export type MemoryEvalOptions = {
  fixture?: string
  project?: string
  limit?: number
}

type EvalMemoryFixture = AgentMemoryRequest & {
  sourceKey: string
}

type EvalLinkFixture = {
  sourceKey: string
  targetSourceKey: string
  relationshipType: string
}

type EvalQueryFixture = {
  query: string
  expectedSourceKeys: string[]
  expectRelationPath?: boolean
  allowStale?: boolean
}

type EvalFixture = {
  name: string
  description: string
  memories: EvalMemoryFixture[]
  links: EvalLinkFixture[]
  queries: EvalQueryFixture[]
}

export type MemoryEvalQueryResult = {
  query: string
  expectedSourceKeys: string[]
  hit: boolean
  hitRank: number | null
  topSourceKey: string
  topTitle: string
  topScore: number
  staleFalsePositiveCount: number
  relationPathHit: boolean
  latencyMs: number
}

export type MemoryEvalResult = {
  fixture: string
  description: string
  project: string
  limit: number
  seededMemoryCount: number
  linkedRelationCount: number
  generatedAt: string
  metrics: {
    queryCount: number
    recallAtK: number
    meanHitRank: number
    staleFalsePositiveCount: number
    staleFalsePositiveRate: number
    relationPathCoverage: number
    meanLatencyMs: number
  }
  queries: MemoryEvalQueryResult[]
}

export async function runMemoryEval(client: MnemicClient, options: MemoryEvalOptions = {}): Promise<MemoryEvalResult> {
  const fixture = fixtureByName(options.fixture ?? 'coding-agent')
  const project = options.project ?? 'mnemic-eval'
  const limit = options.limit ?? 5
  const seeded = new Map<string, AgentMemoryRecord>()

  for (const memory of fixture.memories) {
    const record = await client.remember({
      ...memory,
      project,
      source: 'mnemic-eval',
      actor: 'eval-harness',
    })
    seeded.set(memory.sourceKey, record)
  }

  let linkedRelationCount = 0
  for (const link of fixture.links) {
    const source = seeded.get(link.sourceKey)
    const target = seeded.get(link.targetSourceKey)
    if (!source || !target) continue
    await client.linkMemories(source.entityUid, {
      targetMemoryUid: target.entityUid,
      relationshipType: link.relationshipType,
      attributes: { fixture: fixture.name },
    })
    linkedRelationCount += 1
  }

  const queryResults: MemoryEvalQueryResult[] = []
  for (const query of fixture.queries) {
    const startedAt = Date.now()
    const explanation = await client.explainRecall({
      query: query.query,
      project,
      limit,
    })
    const latencyMs = Date.now() - startedAt
    queryResults.push(scoreEvalQuery(query, explanation.entries, latencyMs))
  }

  const hitRanks = queryResults
    .map((result) => result.hitRank)
    .filter((rank): rank is number => rank !== null)
  const relationQueries = fixture.queries.filter((query) => query.expectRelationPath).length
  const relationHits = queryResults.filter((result, index) => fixture.queries[index]?.expectRelationPath && result.relationPathHit).length
  const staleFalsePositiveCount = queryResults.reduce((total, result) => total + result.staleFalsePositiveCount, 0)
  const totalReturnedRows = Math.max(1, queryResults.length * limit)

  return {
    fixture: fixture.name,
    description: fixture.description,
    project,
    limit,
    seededMemoryCount: seeded.size,
    linkedRelationCount,
    generatedAt: new Date().toISOString(),
    metrics: {
      queryCount: queryResults.length,
      recallAtK: round(queryResults.filter((result) => result.hit).length / Math.max(1, queryResults.length)),
      meanHitRank: round(hitRanks.length ? hitRanks.reduce((total, rank) => total + rank, 0) / hitRanks.length : 0),
      staleFalsePositiveCount,
      staleFalsePositiveRate: round(staleFalsePositiveCount / totalReturnedRows),
      relationPathCoverage: round(relationQueries ? relationHits / relationQueries : 1),
      meanLatencyMs: round(queryResults.reduce((total, result) => total + result.latencyMs, 0) / Math.max(1, queryResults.length)),
    },
    queries: queryResults,
  }
}

export function formatMemoryEvalResult(result: MemoryEvalResult): string {
  const lines = [
    'Mnemic Eval',
    `fixture: ${result.fixture}`,
    `project: ${result.project}`,
    `description: ${result.description}`,
    `generatedAt: ${result.generatedAt}`,
    `seededMemories: ${result.seededMemoryCount}`,
    `linkedRelations: ${result.linkedRelationCount}`,
    `queries: ${result.metrics.queryCount}`,
    `recall@${result.limit}: ${result.metrics.recallAtK.toFixed(2)}`,
    `meanHitRank: ${result.metrics.meanHitRank.toFixed(2)}`,
    `staleFalsePositiveRate: ${result.metrics.staleFalsePositiveRate.toFixed(2)} (${result.metrics.staleFalsePositiveCount})`,
    `relationPathCoverage: ${result.metrics.relationPathCoverage.toFixed(2)}`,
    `meanLatencyMs: ${result.metrics.meanLatencyMs.toFixed(1)}`,
  ]

  for (const query of result.queries) {
    lines.push('')
    lines.push(`- ${query.query}`)
    lines.push(`  hit: ${query.hit ? 'yes' : 'no'}${query.hitRank ? ` rank=${query.hitRank}` : ''}`)
    lines.push(`  expected: ${query.expectedSourceKeys.join(', ')}`)
    lines.push(`  top: ${query.topSourceKey || '(none)'}${query.topTitle ? ` - ${query.topTitle}` : ''}`)
    lines.push(`  topScore: ${query.topScore}`)
    lines.push(`  relationPathHit: ${query.relationPathHit}`)
    lines.push(`  staleFalsePositives: ${query.staleFalsePositiveCount}`)
    lines.push(`  latencyMs: ${query.latencyMs}`)
  }

  return lines.join('\n')
}

export function formatMemoryEvalMarkdown(result: MemoryEvalResult): string {
  const lines = [
    '# Mnemic Eval Report',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Fixture | \`${escapeMarkdown(result.fixture)}\` |`,
    `| Project | \`${escapeMarkdown(result.project)}\` |`,
    `| Generated at | ${escapeMarkdown(result.generatedAt)} |`,
    `| Description | ${escapeMarkdown(result.description)} |`,
    `| Seeded memories | ${result.seededMemoryCount} |`,
    `| Linked relations | ${result.linkedRelationCount} |`,
    `| Query limit | ${result.limit} |`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| recall@${result.limit} | ${result.metrics.recallAtK.toFixed(2)} |`,
    `| mean hit rank | ${result.metrics.meanHitRank.toFixed(2)} |`,
    `| stale false positive rate | ${result.metrics.staleFalsePositiveRate.toFixed(2)} |`,
    `| stale false positives | ${result.metrics.staleFalsePositiveCount} |`,
    `| relation path coverage | ${result.metrics.relationPathCoverage.toFixed(2)} |`,
    `| mean latency ms | ${result.metrics.meanLatencyMs.toFixed(1)} |`,
    '',
    '## Queries',
    '',
    '| Query | Hit | Rank | Expected | Top result | Relation path | Stale false positives | Latency ms |',
    '| --- | --- | ---: | --- | --- | --- | ---: | ---: |',
  ]

  for (const query of result.queries) {
    lines.push([
      escapeMarkdown(query.query),
      query.hit ? 'yes' : 'no',
      query.hitRank === null ? '' : String(query.hitRank),
      query.expectedSourceKeys.map((sourceKey) => `\`${escapeMarkdown(sourceKey)}\``).join('<br>'),
      query.topSourceKey ? `\`${escapeMarkdown(query.topSourceKey)}\`<br>${escapeMarkdown(query.topTitle)}` : '(none)',
      query.relationPathHit ? 'yes' : 'no',
      String(query.staleFalsePositiveCount),
      String(query.latencyMs),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }

  lines.push('')
  lines.push('This fixture is deterministic and model-free. It is intended as a local smoke benchmark before larger LoCoMo, LongMemEval, BEAM, or MemGym adapters are added.')

  return lines.join('\n')
}

function scoreEvalQuery(
  query: EvalQueryFixture,
  entries: AgentMemoryRecallExplanationEntry[],
  latencyMs: number,
): MemoryEvalQueryResult {
  const expected = new Set(query.expectedSourceKeys)
  const hitIndex = entries.findIndex((entry) => expected.has(entry.memory.sourceKey))
  const expectedEntry = hitIndex >= 0 ? entries[hitIndex] : undefined
  const top = entries[0]
  const staleFalsePositiveWindow = entries.slice(0, hitIndex >= 0 ? hitIndex : entries.length)
  const staleFalsePositiveCount = query.allowStale
    ? 0
    : staleFalsePositiveWindow.filter((entry) => entry.stale && !expected.has(entry.memory.sourceKey)).length

  return {
    query: query.query,
    expectedSourceKeys: query.expectedSourceKeys,
    hit: hitIndex >= 0,
    hitRank: hitIndex >= 0 ? hitIndex + 1 : null,
    topSourceKey: top?.memory.sourceKey ?? '',
    topTitle: top?.memory.title ?? '',
    topScore: top?.score ?? 0,
    staleFalsePositiveCount,
    relationPathHit: Boolean(expectedEntry?.relationPaths.length),
    latencyMs,
  }
}

function fixtureByName(name: string): EvalFixture {
  if (name !== 'coding-agent') {
    throw new Error(`Unknown eval fixture "${name}". Available fixtures: coding-agent.`)
  }
  return codingAgentFixture
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

const codingAgentFixture: EvalFixture = {
  name: 'coding-agent',
  description: 'Local-first coding-agent memory fixture covering source keys, previews, recall explanations, and runtime boundaries.',
  memories: [
    {
      title: 'TypeScript workspace is the active product path',
      content: 'Mnemic is a TypeScript workspace with SDK, CLI, server, MCP server, and React Studio packages.',
      memoryType: 'decision',
      sourceKey: 'eval/typescript-foundation',
      tags: ['typescript', 'workspace'],
      importance: 0.95,
      confidence: 0.95,
      observedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      title: 'Use source-keyed writes for durable agent memory',
      content: 'Repeated agent memory writes should use stable sourceKey values so updates are idempotent and auditable.',
      memoryType: 'workflow',
      sourceKey: 'eval/source-keyed-writes',
      tags: ['source-key', 'audit'],
      importance: 0.9,
      confidence: 0.9,
      observedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      title: 'Preview memory writes before committing them',
      content: 'Agents should dry-run memory writes with preview endpoints before applying durable remember operations.',
      memoryType: 'policy',
      sourceKey: 'eval/write-preview-policy',
      tags: ['preview', 'governance'],
      importance: 0.86,
      confidence: 0.88,
      observedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      title: 'Recall explanations must show why memory was retrieved',
      content: 'Recall output should include matched fields, matched terms, score parts, stale flags, and scored relation paths.',
      memoryType: 'feature',
      sourceKey: 'eval/recall-explanation',
      tags: ['recall', 'explainability'],
      importance: 0.88,
      confidence: 0.86,
      observedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      title: 'TypeScript runtime is the public product path',
      content: 'The public Mnemic product ships through the TypeScript SDK, CLI, server, MCP adapter, and Studio workspaces.',
      memoryType: 'risk',
      sourceKey: 'eval/runtime-boundary',
      tags: ['typescript', 'runtime'],
      importance: 0.82,
      confidence: 0.9,
      observedAt: '2026-06-18T00:00:00.000Z',
    },
    {
      title: 'Expired vector-only shortcut',
      content: 'Deprecated 2025 plan: hide memory only inside a hosted vector database without auditable records.',
      memoryType: 'deprecated',
      sourceKey: 'eval/expired-vector-shortcut',
      tags: ['deprecated', 'vector'],
      importance: 0.25,
      confidence: 0.5,
      observedAt: '2025-01-10T00:00:00.000Z',
      validTo: '2025-12-31T00:00:00.000Z',
    },
  ],
  links: [
    {
      sourceKey: 'eval/source-keyed-writes',
      targetSourceKey: 'eval/recall-explanation',
      relationshipType: 'supports',
    },
    {
      sourceKey: 'eval/write-preview-policy',
      targetSourceKey: 'eval/source-keyed-writes',
      relationshipType: 'enforces',
    },
    {
      sourceKey: 'eval/typescript-foundation',
      targetSourceKey: 'eval/write-preview-policy',
      relationshipType: 'supports',
    },
  ],
  queries: [
    {
      query: 'typescript workspace agent memory',
      expectedSourceKeys: ['eval/typescript-foundation'],
      expectRelationPath: true,
    },
    {
      query: 'source keys auditable repeated writes',
      expectedSourceKeys: ['eval/source-keyed-writes'],
      expectRelationPath: true,
    },
    {
      query: 'preview memory before remember',
      expectedSourceKeys: ['eval/write-preview-policy'],
      expectRelationPath: true,
    },
    {
      query: 'why was this memory recalled',
      expectedSourceKeys: ['eval/recall-explanation'],
    },
    {
      query: 'current TypeScript product path',
      expectedSourceKeys: ['eval/runtime-boundary'],
    },
  ],
}
