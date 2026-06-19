import type {
  AgentMemoryBriefing,
  AgentMemoryAudit,
  AgentMemoryContextPack,
  AgentMemoryJsonlExport,
  AgentMemoryJsonlImportRequest,
  AgentMemoryJsonlImportResult,
  AgentMemoryPolicyStatus,
  AgentMemoryRecallExplanation,
  AgentMemoryRecord,
  AgentMemoryRelationRequest,
  AgentMemoryRequest,
  AgentMemorySnapshot,
  AgentMemoryWritePreview,
  AgentMemoryRollbackPreview,
  AgentMemoryRollbackRequest,
  AgentMemoryRollbackResult,
  AgentMemoryStats,
  AgentMemoryTimeline,
  HealthStatus,
} from './types.js'

export type MnemicClientOptions = {
  baseUrl?: string
  fetch?: typeof fetch
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

export type MemoryExportParams = MemoryTimelineParams

export type MemorySnapshotParams = MemoryTimelineParams

export class MnemicClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: MnemicClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
    const defaultFetch = globalThis.fetch?.bind(globalThis)
    this.fetchImpl = options.fetch ?? defaultFetch
    if (!this.fetchImpl) {
      throw new Error('MnemicClient requires a fetch implementation.')
    }
  }

  health(): Promise<HealthStatus> {
    return this.requestJson<HealthStatus>('/actuator/health')
  }

  policy(): Promise<AgentMemoryPolicyStatus> {
    return this.requestJson<AgentMemoryPolicyStatus>('/api/agent-memory/policy')
  }

  remember(request: AgentMemoryRequest): Promise<AgentMemoryRecord> {
    return this.requestJson<AgentMemoryRecord>('/api/agent-memory/memories', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  previewMemory(request: AgentMemoryRequest): Promise<AgentMemoryWritePreview> {
    return this.requestJson<AgentMemoryWritePreview>('/api/agent-memory/memories/preview', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  recall(params: MemorySearchParams = {}): Promise<AgentMemoryRecord[]> {
    return this.requestJson<AgentMemoryRecord[]>(`/api/agent-memory/memories${queryString(params)}`)
  }

  explainRecall(params: MemorySearchParams = {}): Promise<AgentMemoryRecallExplanation> {
    return this.requestJson<AgentMemoryRecallExplanation>(`/api/agent-memory/explain${queryString(params)}`)
  }

  getMemory(memoryUid: string): Promise<AgentMemoryRecord> {
    return this.requestJson<AgentMemoryRecord>(`/api/agent-memory/memories/${encodeURIComponent(memoryUid)}`)
  }

  linkMemories(memoryUid: string, request: AgentMemoryRelationRequest): Promise<AgentMemoryRecord> {
    return this.requestJson<AgentMemoryRecord>(`/api/agent-memory/memories/${encodeURIComponent(memoryUid)}/relations`, {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  contextPack(query?: string, project?: string, limit?: number, asOf?: string): Promise<AgentMemoryContextPack> {
    return this.requestJson<AgentMemoryContextPack>(`/api/agent-memory/context-pack${queryString({ query, project, limit, asOf })}`)
  }

  sessionBriefing(project?: string, limit?: number): Promise<AgentMemoryBriefing> {
    return this.requestJson<AgentMemoryBriefing>(`/api/agent-memory/briefing${queryString({ project, limit })}`)
  }

  stats(): Promise<AgentMemoryStats> {
    return this.requestJson<AgentMemoryStats>('/api/agent-memory/stats')
  }

  audit(project?: string): Promise<AgentMemoryAudit> {
    return this.requestJson<AgentMemoryAudit>(`/api/agent-memory/audit${queryString({ project })}`)
  }

  timeline(params: MemoryTimelineParams = {}): Promise<AgentMemoryTimeline> {
    return this.requestJson<AgentMemoryTimeline>(`/api/agent-memory/timeline${queryString(params)}`)
  }

  exportJsonl(params: MemoryExportParams = {}): Promise<AgentMemoryJsonlExport> {
    return this.requestJson<AgentMemoryJsonlExport>(`/api/agent-memory/export${queryString(params)}`)
  }

  snapshot(params: MemorySnapshotParams = {}): Promise<AgentMemorySnapshot> {
    return this.requestJson<AgentMemorySnapshot>(`/api/agent-memory/snapshot${queryString(params)}`)
  }

  importJsonl(request: AgentMemoryJsonlImportRequest): Promise<AgentMemoryJsonlImportResult> {
    return this.requestJson<AgentMemoryJsonlImportResult>('/api/agent-memory/import', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  rollbackPreview(eventUid: string): Promise<AgentMemoryRollbackPreview> {
    return this.requestJson<AgentMemoryRollbackPreview>(`/api/agent-memory/rollback-preview${queryString({ eventUid })}`)
  }

  rollback(request: AgentMemoryRollbackRequest): Promise<AgentMemoryRollbackResult> {
    return this.requestJson<AgentMemoryRollbackResult>('/api/agent-memory/rollback', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        ...init,
      })
    } catch {
      throw new Error(`Cannot reach Mnemic backend at ${this.baseUrl || '(same origin)'}.`)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Mnemic backend returned HTTP ${response.status}`)
    }

    return response.json() as Promise<T>
  }
}

export function queryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    searchParams.set(key, String(value))
  }
  const value = searchParams.toString()
  return value ? `?${value}` : ''
}
