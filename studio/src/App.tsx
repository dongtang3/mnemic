import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  explainAgentMemoryRecall,
  fetchAgentMemoryAudit,
  fetchAgentMemoryBriefing,
  fetchAgentMemoryContextPack,
  fetchAgentMemoryPolicy,
  fetchAgentMemoryStats,
  fetchAgentMemoryTimeline,
  fetchHealth,
  previewAgentMemory,
  rememberAgentMemory,
  searchAgentMemories,
} from './api'
import type {
  AgentMemoryBriefing,
  AgentMemoryAudit,
  AgentMemoryContextPack,
  AgentMemoryEventDiff,
  AgentMemoryPolicyStatus,
  AgentMemoryRecord,
  AgentMemoryRecallExplanation,
  AgentMemoryRequest,
  AgentMemoryStats,
  AgentMemoryTimeline,
  AgentMemoryTimelineEntry,
  AgentMemoryWritePreview,
} from './types'

type BackendStatus = {
  state: 'checking' | 'up' | 'down'
  detail: string
  checkedAt: string
}

type NavItem = {
  path: string
  label: string
  summary: string
}

type MemoryFilters = {
  query: string
  project: string
  memoryType: string
  tag: string
  asOf: string
}

type MemoryDraft = {
  title: string
  content: string
  memoryType: string
  project: string
  tags: string
  sourceKey: string
  relatedMemoryUids: string
  importance: string
  confidence: string
}

type GraphEdge = {
  sourceMemoryUid: string
  targetMemoryUid: string
  relationshipType: string
}

type GraphNode = AgentMemoryRecord & {
  incomingCount: number
  outgoingCount: number
}

type RelationPath = {
  nodeUids: string[]
  relationshipTypes: string[]
  score: number
}

const navItems: NavItem[] = [
  { path: '/overview', label: 'Overview', summary: 'Memory posture, coverage, and briefing.' },
  { path: '/memories', label: 'Memories', summary: 'Create, filter, and inspect durable records.' },
  { path: '/graph', label: 'Graph', summary: 'Relations, paths, and memory neighborhoods.' },
  { path: '/context', label: 'Context Pack', summary: 'Prompt-ready recall for agent sessions.' },
  { path: '/timeline', label: 'Timeline', summary: 'Recent memory writes and updates.' },
  { path: '/runtime', label: 'Runtime', summary: 'Backend, MCP, and local store status.' },
]

const defaultFilters: MemoryFilters = {
  query: '',
  project: 'mnemic',
  memoryType: '',
  tag: '',
  asOf: '',
}

const emptyDraft: MemoryDraft = {
  title: '',
  content: '',
  memoryType: 'decision',
  project: 'mnemic',
  tags: 'typescript, agent-memory',
  sourceKey: '',
  relatedMemoryUids: '',
  importance: '0.75',
  confidence: '0.85',
}

export default function App() {
  const location = useLocation()
  const backend = useBackendStatus()
  const activeNav = useMemo(
    () => navItems.find((item) => location.pathname === item.path) ?? navItems[0],
    [location.pathname],
  )
  const [filters, setFilters] = useState<MemoryFilters>(defaultFilters)
  const [draft, setDraft] = useState<MemoryDraft>(emptyDraft)
  const [contextQuery, setContextQuery] = useState('TypeScript rewrite direction for Mnemic agent memory')
  const [memories, setMemories] = useState<AgentMemoryRecord[]>([])
  const [graphMemories, setGraphMemories] = useState<AgentMemoryRecord[]>([])
  const [stats, setStats] = useState<AgentMemoryStats | null>(null)
  const [audit, setAudit] = useState<AgentMemoryAudit | null>(null)
  const [policy, setPolicy] = useState<AgentMemoryPolicyStatus | null>(null)
  const [briefing, setBriefing] = useState<AgentMemoryBriefing | null>(null)
  const [contextPack, setContextPack] = useState<AgentMemoryContextPack | null>(null)
  const [recallExplanation, setRecallExplanation] = useState<AgentMemoryRecallExplanation | null>(null)
  const [timeline, setTimeline] = useState<AgentMemoryTimeline | null>(null)
  const [writePreview, setWritePreview] = useState<AgentMemoryWritePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')

  async function refreshSurface() {
    setLoading(true)
    setError('')
    try {
      const [nextStats, nextPolicy, nextAudit, nextMemories, nextGraphMemories, nextBriefing, nextTimeline] = await Promise.all([
        fetchAgentMemoryStats(),
        fetchAgentMemoryPolicy(),
        fetchAgentMemoryAudit(filters.project),
        searchAgentMemories({ ...filters, limit: 24 }),
        searchAgentMemories({ project: filters.project, asOf: filters.asOf, limit: 50 }),
        fetchAgentMemoryBriefing(filters.project, 8),
        fetchAgentMemoryTimeline({ project: filters.project, memoryType: filters.memoryType, tag: filters.tag, asOf: filters.asOf, limit: 50 }),
      ])
      setStats(nextStats)
      setPolicy(nextPolicy)
      setAudit(nextAudit)
      setMemories(nextMemories)
      setGraphMemories(nextGraphMemories)
      setBriefing(nextBriefing)
      setTimeline(nextTimeline)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Unable to load Mnemic state.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshSurface()
  }, [filters.query, filters.project, filters.memoryType, filters.tag, filters.asOf])

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await rememberAgentMemory(memoryRequestFromDraft(draft))
      setWritePreview(null)
      setDraft({ ...emptyDraft, project: draft.project })
      setFilters((current) => ({ ...current, project: draft.project }))
      await refreshSurface()
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Unable to save memory.')
    } finally {
      setSaving(false)
    }
  }

  async function previewMemoryWrite() {
    setPreviewing(true)
    setError('')
    try {
      setWritePreview(await previewAgentMemory(memoryRequestFromDraft(draft)))
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Unable to preview memory write.')
    } finally {
      setPreviewing(false)
    }
  }

  async function buildContextPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const [nextContextPack, nextExplanation] = await Promise.all([
        fetchAgentMemoryContextPack(contextQuery, filters.project, 8, filters.asOf),
        explainAgentMemoryRecall({ query: contextQuery, project: filters.project, asOf: filters.asOf, limit: 8 }),
      ])
      setContextPack(nextContextPack)
      setRecallExplanation(nextExplanation)
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Unable to build context pack.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mnemic-shell">
      <Sidebar />
      <main className="mnemic-main">
        <Topbar activeNav={activeNav} backend={backend} loading={loading} onRefresh={refreshSurface} />
        {error ? <div className="alert alert-error">{error}</div> : null}
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview audit={audit} stats={stats} briefing={briefing} memories={memories} />} />
          <Route
            path="/memories"
            element={(
              <Memories
                draft={draft}
                filters={filters}
                memories={memories}
                saving={saving}
                preview={writePreview}
                previewing={previewing}
                setDraft={setDraft}
                setFilters={setFilters}
                onPreview={previewMemoryWrite}
                onSave={saveMemory}
              />
            )}
          />
          <Route
            path="/graph"
            element={<GraphPanel memories={graphMemories} project={filters.project} timeline={timeline} />}
          />
          <Route
            path="/context"
            element={(
              <ContextPackPanel
                contextPack={contextPack}
                contextQuery={contextQuery}
                recallExplanation={recallExplanation}
                onBuild={buildContextPack}
                setContextQuery={setContextQuery}
              />
            )}
          />
          <Route path="/timeline" element={<TimelinePanel timeline={timeline} />} />
          <Route path="/runtime" element={<RuntimePanel backend={backend} policy={policy} stats={stats} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="mnemic-sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <p>Mnemic</p>
          <span>Agent Memory Kernel</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Mnemic sections">
        {navItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`}>
            <span>{item.label}</span>
            <small>{item.summary}</small>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-status">
        <span>Default project</span>
        <strong>mnemic</strong>
      </div>
    </aside>
  )
}

function Topbar({
  activeNav,
  backend,
  loading,
  onRefresh,
}: {
  activeNav: NavItem
  backend: BackendStatus
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <header className="topbar">
      <div>
        <h1>{activeNav.label}</h1>
        <p>{activeNav.summary}</p>
      </div>
      <div className="topbar-actions">
        <div className={`status-pill ${backend.state}`}>
          <span />
          <strong>{backend.state === 'up' ? 'Backend online' : backend.state === 'down' ? 'Backend offline' : 'Checking'}</strong>
          <small>{backend.checkedAt}</small>
        </div>
        <button className="button secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
    </header>
  )
}

function Overview({
  audit,
  stats,
  briefing,
  memories,
}: {
  audit: AgentMemoryAudit | null
  stats: AgentMemoryStats | null
  briefing: AgentMemoryBriefing | null
  memories: AgentMemoryRecord[]
}) {
  const latestMemory = memories[0]
  return (
    <div className="page-grid">
      <Metric label="Memories" value={stats?.totalMemories ?? 0} />
      <Metric label="Relations" value={stats?.explicitRelationCount ?? 0} />
      <Metric label="Events" value={stats?.eventCount ?? 0} />
      <Metric label="Avg importance" value={formatNumber(stats?.averageImportance ?? 0)} />
      <Metric label="Audit health" value={audit?.healthScore ?? 'n/a'} />
      <Metric label="Audit warnings" value={audit?.summary.warningCount ?? 0} />
      <Panel title="Session Briefing" wide>
        <PreBlock value={briefing?.briefing || 'No briefing available yet.'} />
      </Panel>
      <Panel title="Memory Audit">
        {audit ? <AuditSummary audit={audit} /> : <EmptyState title="No audit available" />}
      </Panel>
      <Panel title="Latest Memory">
        {latestMemory ? <MemoryCard memory={latestMemory} compact /> : <EmptyState title="No memories yet" />}
      </Panel>
    </div>
  )
}

function AuditSummary({ audit }: { audit: AgentMemoryAudit }) {
  return (
    <div className="audit-summary">
      <div><span>Blocks</span><strong>{audit.summary.blockCount}</strong></div>
      <div><span>Warnings</span><strong>{audit.summary.warningCount}</strong></div>
      <div><span>Missing sourceKey</span><strong>{audit.summary.missingSourceKeyCount}</strong></div>
      <div><span>Low confidence</span><strong>{audit.summary.lowConfidenceCount}</strong></div>
      <div><span>Stale</span><strong>{audit.summary.staleCount}</strong></div>
      <div><span>Orphans</span><strong>{audit.summary.orphanCount}</strong></div>
      {audit.findings.slice(0, 4).map((finding) => (
        <article key={finding.findingId}>
          <code>{finding.severity}</code>
          <strong>{finding.category}</strong>
          <p>{finding.title}</p>
        </article>
      ))}
    </div>
  )
}

function Memories({
  draft,
  filters,
  memories,
  preview,
  previewing,
  saving,
  setDraft,
  setFilters,
  onPreview,
  onSave,
}: {
  draft: MemoryDraft
  filters: MemoryFilters
  memories: AgentMemoryRecord[]
  preview: AgentMemoryWritePreview | null
  previewing: boolean
  saving: boolean
  setDraft: (draft: MemoryDraft) => void
  setFilters: (filters: MemoryFilters) => void
  onPreview: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="memory-workspace">
      <div className="write-column">
        <section className="surface">
          <h2>Write Memory</h2>
          <form className="form-stack" onSubmit={onSave}>
            <label>
              <span>Title</span>
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
            </label>
            <label>
              <span>Content</span>
              <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={8} required />
            </label>
            <div className="form-grid">
              <label>
                <span>Type</span>
                <select value={draft.memoryType} onChange={(event) => setDraft({ ...draft, memoryType: event.target.value })}>
                  <option value="decision">decision</option>
                  <option value="workflow">workflow</option>
                  <option value="fix">fix</option>
                  <option value="risk">risk</option>
                  <option value="note">note</option>
                </select>
              </label>
              <label>
                <span>Project</span>
                <input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} />
              </label>
              <label>
                <span>Importance</span>
                <input min="0" max="1" step="0.05" type="number" value={draft.importance} onChange={(event) => setDraft({ ...draft, importance: event.target.value })} />
              </label>
              <label>
                <span>Confidence</span>
                <input min="0" max="1" step="0.05" type="number" value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: event.target.value })} />
              </label>
            </div>
            <label>
              <span>Tags</span>
              <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
            </label>
            <label>
              <span>Source key</span>
              <input value={draft.sourceKey} onChange={(event) => setDraft({ ...draft, sourceKey: event.target.value })} />
            </label>
            <label>
              <span>Related memory UIDs</span>
              <input value={draft.relatedMemoryUids} onChange={(event) => setDraft({ ...draft, relatedMemoryUids: event.target.value })} placeholder="AgentMemory-2, AgentMemory-7" />
            </label>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={onPreview} disabled={previewing || saving || !draft.title.trim() || !draft.content.trim()}>
                {previewing ? 'Previewing' : 'Preview Write'}
              </button>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? 'Saving' : 'Save Memory'}
              </button>
            </div>
          </form>
        </section>
        <WritePreviewPanel preview={preview} previewing={previewing} />
      </div>
      <section className="surface">
        <div className="section-head">
          <h2>Recall</h2>
          <span>{memories.length} shown</span>
        </div>
        <FilterBar filters={filters} setFilters={setFilters} />
        <div className="memory-list">
          {memories.length ? memories.map((memory) => <MemoryCard key={memory.entityUid} memory={memory} />) : <EmptyState title="No matching memories" />}
        </div>
      </section>
    </div>
  )
}

function GraphPanel({
  memories,
  project,
  timeline,
}: {
  memories: AgentMemoryRecord[]
  project: string
  timeline: AgentMemoryTimeline | null
}) {
  const graph = useMemo(() => buildMemoryGraph(memories, timeline?.entries ?? []), [memories, timeline])
  const [selectedUid, setSelectedUid] = useState('')
  const selected = graph.nodes.find((node) => node.entityUid === selectedUid) ?? graph.nodes[0]
  const positions = useMemo(
    () => new Map(graph.nodes.map((node, index) => [node.entityUid, graphPosition(index, graph.nodes.length)])),
    [graph.nodes],
  )
  const relationPaths = useMemo(
    () => (selected ? buildRelationPaths(graph.edges, selected.entityUid) : []),
    [graph.edges, selected],
  )

  useEffect(() => {
    if (!graph.nodes.length) {
      setSelectedUid('')
      return
    }
    if (!graph.nodes.some((node) => node.entityUid === selectedUid)) {
      setSelectedUid(graph.nodes[0].entityUid)
    }
  }, [graph.nodes, selectedUid])

  if (!graph.nodes.length) {
    return (
      <section className="surface">
        <div className="section-head">
          <h2>Memory Graph</h2>
          <span>{project || 'all projects'}</span>
        </div>
        <EmptyState title="No memories available for this graph." />
      </section>
    )
  }

  return (
    <div className="graph-layout">
      <section className="surface graph-panel">
        <div className="section-head">
          <h2>Memory Graph</h2>
          <span>{graph.nodes.length} nodes / {graph.edges.length} edges</span>
        </div>
        <div className="graph-canvas" aria-label="Memory relationship graph">
          <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {graph.edges.map((edge) => {
              const source = positions.get(edge.sourceMemoryUid)
              const target = positions.get(edge.targetMemoryUid)
              if (!source || !target) return null
              const isActive = selected
                ? edge.sourceMemoryUid === selected.entityUid || edge.targetMemoryUid === selected.entityUid
                : false
              return (
                <line
                  className={isActive ? 'active' : ''}
                  key={`${edge.sourceMemoryUid}-${edge.targetMemoryUid}-${edge.relationshipType}`}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
              )
            })}
          </svg>
          {graph.nodes.map((node, index) => {
            const position = positions.get(node.entityUid) ?? graphPosition(index, graph.nodes.length)
            const isSelected = node.entityUid === selected?.entityUid
            return (
              <button
                className={`graph-node${isSelected ? ' selected' : ''}`}
                key={node.entityUid}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                type="button"
                onClick={() => setSelectedUid(node.entityUid)}
              >
                <strong>{node.title}</strong>
                <span>{node.memoryType} · {node.outgoingCount} out / {node.incomingCount} in</span>
              </button>
            )
          })}
        </div>
      </section>
      <section className="surface graph-details">
        <div className="section-head">
          <h2>Neighborhood</h2>
          <span>{selected?.entityUid ?? 'none'}</span>
        </div>
        {selected ? (
          <>
            <MemoryCard memory={selected} compact />
            <div className="graph-stats">
              <Metric label="Outgoing" value={selected.outgoingCount} />
              <Metric label="Incoming" value={selected.incomingCount} />
            </div>
            <div className="path-list">
              <h3>Relation Paths</h3>
              {relationPaths.length ? relationPaths.map((path) => (
                <div className="path-row" key={`${path.nodeUids.join('-')}-${path.relationshipTypes.join('-')}`}>
                  <span>{path.nodeUids.map((uid) => graph.nodes.find((node) => node.entityUid === uid)?.title ?? uid).join(' -> ')}</span>
                  <small>{path.relationshipTypes.join(' / ')} · score {path.score}</small>
                </div>
              )) : <EmptyState title="No outgoing relation paths from this memory." />}
            </div>
            <div className="edge-list">
              <h3>Edges</h3>
              {graph.edges
                .filter((edge) => edge.sourceMemoryUid === selected.entityUid || edge.targetMemoryUid === selected.entityUid)
                .map((edge) => (
                  <div className="edge-row" key={`${edge.sourceMemoryUid}-${edge.targetMemoryUid}-${edge.relationshipType}`}>
                    <code>{edge.relationshipType}</code>
                    <span>{edge.sourceMemoryUid === selected.entityUid ? 'to' : 'from'}</span>
                    <strong>{graph.nodes.find((node) => node.entityUid === (edge.sourceMemoryUid === selected.entityUid ? edge.targetMemoryUid : edge.sourceMemoryUid))?.title}</strong>
                  </div>
                ))}
            </div>
          </>
        ) : <EmptyState title="Select a memory node." />}
      </section>
    </div>
  )
}

function WritePreviewPanel({
  preview,
  previewing,
}: {
  preview: AgentMemoryWritePreview | null
  previewing: boolean
}) {
  const policyFindings = preview?.policyFindings ?? []

  if (!preview) {
    return (
      <section className="surface preview-surface">
        <div className="section-head">
          <h2>Write Preview</h2>
          <span>{previewing ? 'running' : 'dry run'}</span>
        </div>
        <EmptyState title="Preview a write to inspect the diff before saving." />
      </section>
    )
  }

  return (
    <section className="surface preview-surface">
      <div className="section-head">
        <h2>Write Preview</h2>
        <span>{preview.action}</span>
      </div>
      <div className="preview-summary">
        <Metric label="Memory" value={preview.memoryUid} />
        <Metric label="Would append" value={preview.wouldAppendEventUid} />
        <Metric label="Event" value={preview.eventType} />
      </div>
      <div className="preview-state">
        <div>
          <span>Before</span>
          <strong>{preview.before.memoryCount} memories / {preview.before.relationCount} relations / {preview.before.eventCount} events</strong>
        </div>
        <div>
          <span>After</span>
          <strong>{preview.after.memoryCount} memories / {preview.after.relationCount} relations / {preview.after.eventCount} events</strong>
        </div>
      </div>
      <div className="diff-table">
        <div className="diff-header">
          <span>Field</span>
          <span>Before</span>
          <span>After</span>
        </div>
        {preview.diff.changedFields.length
          ? preview.diff.changedFields.map((field) => (
            <DiffRow diff={preview.diff} field={field} key={field} />
          ))
          : <div className="diff-empty">No memory fields would change.</div>}
      </div>
      {preview.relationPreviews.length ? (
        <div className="relation-preview-list">
          {preview.relationPreviews.map((relation) => (
            <div className="relation-preview" key={`${relation.relationshipType}-${relation.targetMemoryUid}`}>
              <strong>{relation.relationshipType}</strong>
              <span>{relation.targetMemoryUid}</span>
              <code>{relation.alreadyExists ? 'already linked' : 'new link'}</code>
            </div>
          ))}
        </div>
      ) : null}
      {policyFindings.length ? (
        <div className="policy-finding-list">
          {policyFindings.map((finding) => (
            <div className={`policy-finding ${finding.severity}`} key={`${finding.policyId}-${finding.field}`}>
              <code>{finding.severity}</code>
              <strong>{finding.policyId}</strong>
              <span>{finding.field}</span>
              <p>{finding.message}</p>
            </div>
          ))}
        </div>
      ) : null}
      {preview.warnings.length ? (
        <div className="warning-list">
          {preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      ) : null}
    </section>
  )
}

function DiffRow({ diff, field }: { diff: AgentMemoryEventDiff; field: string }) {
  return (
    <div className="diff-row">
      <strong>{field}</strong>
      <span>{formatDiffValue(diff.before?.[field])}</span>
      <span>{formatDiffValue(diff.after?.[field])}</span>
    </div>
  )
}

function FilterBar({
  filters,
  setFilters,
}: {
  filters: MemoryFilters
  setFilters: (filters: MemoryFilters) => void
}) {
  return (
    <div className="filter-grid">
      <label>
        <span>Query</span>
        <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
      </label>
      <label>
        <span>Project</span>
        <input value={filters.project} onChange={(event) => setFilters({ ...filters, project: event.target.value })} />
      </label>
      <label>
        <span>Type</span>
        <input value={filters.memoryType} onChange={(event) => setFilters({ ...filters, memoryType: event.target.value })} />
      </label>
      <label>
        <span>Tag</span>
        <input value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} />
      </label>
      <label>
        <span>As Of</span>
        <input value={filters.asOf} placeholder="2026-06-18T00:00:00Z" onChange={(event) => setFilters({ ...filters, asOf: event.target.value })} />
      </label>
    </div>
  )
}

function ContextPackPanel({
  contextPack,
  contextQuery,
  recallExplanation,
  onBuild,
  setContextQuery,
}: {
  contextPack: AgentMemoryContextPack | null
  contextQuery: string
  recallExplanation: AgentMemoryRecallExplanation | null
  onBuild: (event: FormEvent<HTMLFormElement>) => void
  setContextQuery: (query: string) => void
}) {
  return (
    <div className="single-column">
      <section className="surface">
        <h2>Context Builder</h2>
        <form className="query-row" onSubmit={onBuild}>
          <input value={contextQuery} onChange={(event) => setContextQuery(event.target.value)} />
          <button className="button primary" type="submit">Build Pack</button>
        </form>
      </section>
      <Panel title="Context Pack" wide>
        <PreBlock value={contextPack?.context || 'No context pack built in this session.'} />
      </Panel>
      <RecallExplanationPanel explanation={recallExplanation} />
    </div>
  )
}

function RecallExplanationPanel({ explanation }: { explanation: AgentMemoryRecallExplanation | null }) {
  return (
    <section className="surface">
      <div className="section-head">
        <h2>Recall Explanation</h2>
        <span>{explanation?.entries.length ?? 0} ranked</span>
      </div>
      <div className="explanation-list">
        {explanation?.entries.length ? explanation.entries.map((entry) => (
          <article className="explanation-row" key={entry.memory.entityUid}>
            <div className="explanation-head">
              <div>
                <h3>{entry.memory.title}</h3>
                <small>{entry.memory.entityUid}</small>
              </div>
              <strong>{entry.score}</strong>
            </div>
            <div className="score-breakdown">
              <span>lexical {entry.lexicalScore}</span>
              <span>importance {entry.importanceBoost}</span>
              <span>relations {entry.relationBoost}</span>
              <span>{entry.stale ? 'stale' : 'current'}</span>
            </div>
            <div className="tag-row">
              {entry.matchedFields.map((field) => <code key={field}>{field} {entry.fieldScores[field]}</code>)}
              {entry.matchedTerms.map((term) => <code key={term}>{term}</code>)}
            </div>
            <p>{entry.reasons.join(' ')}</p>
            {entry.relationPaths.length ? (
              <div className="explanation-paths">
                {entry.relationPaths.map((path) => (
                  <span key={`${entry.memory.entityUid}-${path.nodeUids.join('-')}`}>
                    {path.titles.join(' -> ')}
                    {' '}
                    ({path.score})
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        )) : <EmptyState title="Build a context pack to inspect recall ranking." />}
      </div>
    </section>
  )
}

function TimelinePanel({ timeline }: { timeline: AgentMemoryTimeline | null }) {
  return (
    <section className="surface">
      <div className="section-head">
        <h2>Memory Timeline</h2>
        <span>{timeline?.entries.length ?? 0} events</span>
      </div>
      <div className="timeline">
        {timeline?.entries.length
          ? timeline.entries.map((entry) => (
            <article className="timeline-row" key={`${entry.eventType}-${entry.eventAt}-${entry.memory.entityUid}`}>
              <div className="timeline-marker" />
              <div>
                <span>{entry.eventType}</span>
                <h3>{entry.memory.title}</h3>
                <p>{entry.memory.content}</p>
                <small>
                  {formatDate(entry.eventAt)}
                  {' · '}
                  {entry.relationshipType ? `${entry.relationshipType} · ` : ''}
                  {entry.eventUid}
                </small>
              </div>
            </article>
          ))
          : <EmptyState title="No timeline events" />}
      </div>
    </section>
  )
}

function RuntimePanel({
  backend,
  policy,
  stats,
}: {
  backend: BackendStatus
  policy: AgentMemoryPolicyStatus | null
  stats: AgentMemoryStats | null
}) {
  return (
    <div className="page-grid">
      <Metric label="Backend" value={backend.state} />
      <Metric label="Service" value={backend.detail || 'mnemic-server'} />
      <Metric label="Latest update" value={stats?.latestUpdatedAt ? formatDate(stats.latestUpdatedAt) : 'none'} />
      <Metric label="Latest event" value={stats?.latestEventAt ? formatDate(stats.latestEventAt) : 'none'} />
      <Panel title="Policy" wide>
        <div className="policy-runtime">
          <div>
            <span>Source</span>
            <strong>{policy ? `${policy.source.kind}${policy.source.policyFile ? ` (${policy.source.policyFile})` : ''}` : 'loading'}</strong>
          </div>
          <div>
            <span>SourceKey Types</span>
            <strong>{policy?.config.requireSourceKey.memoryTypes.join(', ') || 'none'}</strong>
          </div>
          <div>
            <span>SourceKey Tags</span>
            <strong>{policy?.config.requireSourceKey.tags.join(', ') || 'none'}</strong>
          </div>
          <div>
            <span>Secrets</span>
            <strong>{policy ? `${policy.config.secrets.enabled ? 'enabled' : 'disabled'} / ${policy.config.secrets.severity}` : 'loading'}</strong>
          </div>
          <div>
            <span>Built-in Rules</span>
            <strong>{policy?.config.secrets.builtInPolicyIds.length ?? 0}</strong>
          </div>
          <div>
            <span>Custom Rules</span>
            <strong>{policy?.config.secrets.customPatterns.length ?? 0}</strong>
          </div>
          <div>
            <span>Low Confidence</span>
            <strong>{policy?.config.confidence.lowWarningBelow ?? 'loading'}</strong>
          </div>
          <div>
            <span>Stale Severity</span>
            <strong>{policy?.config.stale.staleOnArrivalSeverity ?? 'loading'}</strong>
          </div>
        </div>
      </Panel>
      <Panel title="MCP Tools" wide>
        <div className="tool-grid">
          {[
            'mnemic_audit',
            'mnemic_policy',
            'mnemic_remember',
            'mnemic_preview_memory',
            'mnemic_recall',
            'mnemic_get_memory',
            'mnemic_context_pack',
            'mnemic_session_briefing',
            'mnemic_memory_stats',
            'mnemic_memory_timeline',
            'mnemic_export_jsonl',
            'mnemic_import_jsonl',
            'mnemic_rollback_preview',
            'mnemic_rollback',
            'mnemic_link_memories',
          ].map((tool) => <code key={tool}>{tool}</code>)}
        </div>
      </Panel>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

function Panel({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`surface${wide ? ' wide' : ''}`}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function MemoryCard({ memory, compact = false }: { memory: AgentMemoryRecord; compact?: boolean }) {
  return (
    <article className="memory-card">
      <div className="memory-card-head">
        <span>{memory.memoryType}</span>
        <small>{formatDate(memory.updatedAt)}</small>
      </div>
      <h3>{memory.title}</h3>
      <p>{memory.content}</p>
      {!compact ? (
        <div className="tag-row">
          {memory.project ? <code>{memory.project}</code> : null}
          {memory.sourceKey ? <code>{memory.sourceKey}</code> : null}
          {memory.tags.map((tag) => <code key={tag}>{tag}</code>)}
        </div>
      ) : null}
      <div className="score-row">
        <span>importance {formatNumber(memory.importance)}</span>
        <span>confidence {formatNumber(memory.confidence)}</span>
      </div>
    </article>
  )
}

function EmptyState({ title }: { title: string }) {
  return <div className="empty-state">{title}</div>
}

function PreBlock({ value }: { value: string }) {
  return <pre className="pre-block">{value}</pre>
}

function useBackendStatus(): BackendStatus {
  const [backend, setBackend] = useState<BackendStatus>({
    state: 'checking',
    detail: '',
    checkedAt: 'not checked',
  })

  useEffect(() => {
    let cancelled = false
    async function checkBackend() {
      try {
        const health = await fetchHealth()
        if (!cancelled) {
          setBackend({
            state: health.status === 'UP' ? 'up' : 'down',
            detail: health.service,
            checkedAt: new Date().toLocaleTimeString(),
          })
        }
      } catch (exception) {
        if (!cancelled) {
          setBackend({
            state: 'down',
            detail: exception instanceof Error ? exception.message : 'Backend unavailable',
            checkedAt: new Date().toLocaleTimeString(),
          })
        }
      }
    }

    void checkBackend()
    const timer = window.setInterval(() => {
      void checkBackend()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return backend
}

function buildMemoryGraph(memories: AgentMemoryRecord[], events: AgentMemoryTimelineEntry[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const memoriesByUid = new Map(memories.map((memory) => [memory.entityUid, memory]))
  const relationTypeByKey = new Map(
    events
      .filter((event) => event.eventType === 'memory-linked' && event.targetMemoryUid)
      .map((event) => [`${event.memoryUid}->${event.targetMemoryUid}`, event.relationshipType || 'MEMORY_RELATED_TO']),
  )
  const seenEdges = new Set<string>()
  const edges: GraphEdge[] = []

  for (const memory of memories) {
    for (const targetMemoryUid of memory.relatedMemoryUids) {
      if (!memoriesByUid.has(targetMemoryUid)) continue
      const relationshipType = relationTypeByKey.get(`${memory.entityUid}->${targetMemoryUid}`) ?? 'MEMORY_RELATED_TO'
      const edgeKey = `${memory.entityUid}->${targetMemoryUid}:${relationshipType}`
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)
      edges.push({
        sourceMemoryUid: memory.entityUid,
        targetMemoryUid,
        relationshipType,
      })
    }
  }

  const nodes = memories.map((memory) => ({
    ...memory,
    incomingCount: edges.filter((edge) => edge.targetMemoryUid === memory.entityUid).length,
    outgoingCount: edges.filter((edge) => edge.sourceMemoryUid === memory.entityUid).length,
  }))

  return { nodes, edges }
}

function graphPosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 50, y: 50 }
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  const radiusX = total < 4 ? 26 : 38
  const radiusY = total < 4 ? 22 : 34
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
  }
}

function buildRelationPaths(edges: GraphEdge[], sourceMemoryUid: string): RelationPath[] {
  const outgoing = edges.filter((edge) => edge.sourceMemoryUid === sourceMemoryUid)
  const paths: RelationPath[] = []

  for (const edge of outgoing) {
    paths.push({
      nodeUids: [sourceMemoryUid, edge.targetMemoryUid],
      relationshipTypes: [edge.relationshipType],
      score: 1,
    })
    for (const secondHop of edges.filter((candidate) => candidate.sourceMemoryUid === edge.targetMemoryUid)) {
      if (secondHop.targetMemoryUid === sourceMemoryUid) continue
      paths.push({
        nodeUids: [sourceMemoryUid, edge.targetMemoryUid, secondHop.targetMemoryUid],
        relationshipTypes: [edge.relationshipType, secondHop.relationshipType],
        score: 0.6,
      })
    }
  }

  return paths
    .sort((left, right) => right.score - left.score || left.nodeUids.join('/').localeCompare(right.nodeUids.join('/')))
    .slice(0, 12)
}

function parseTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

function parseUidList(value: string): string[] {
  return value.split(',').map((uid) => uid.trim()).filter(Boolean)
}

function memoryRequestFromDraft(draft: MemoryDraft): AgentMemoryRequest {
  return {
    title: draft.title,
    content: draft.content,
    memoryType: draft.memoryType,
    project: draft.project,
    tags: parseTags(draft.tags),
    source: 'mnemic-studio',
    sourceKey: draft.sourceKey || undefined,
    actor: 'studio-user',
    importance: Number(draft.importance),
    confidence: Number(draft.confidence),
    observedAt: new Date().toISOString(),
    relatedMemoryUids: parseUidList(draft.relatedMemoryUids),
  }
}

function formatDate(value: string): string {
  if (!value) return 'none'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'none'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
