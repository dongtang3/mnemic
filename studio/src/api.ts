import { MnemicClient, type MemorySearchParams, type MemoryTimelineParams } from '@mnemic/sdk'
import type {
  AgentMemoryBriefing,
  AgentMemoryAudit,
  AgentMemoryContextPack,
  AgentMemoryPolicyStatus,
  AgentMemoryRecord,
  AgentMemoryRecallExplanation,
  AgentMemoryRequest,
  AgentMemoryStats,
  AgentMemoryTimeline,
  AgentMemoryWritePreview,
  HealthStatus,
} from './types'

const API_ROOT = import.meta.env.VITE_API_BASE ?? ''
const client = new MnemicClient({ baseUrl: API_ROOT })

export function fetchHealth(): Promise<HealthStatus> {
  return client.health()
}

export function fetchAgentMemoryPolicy(): Promise<AgentMemoryPolicyStatus> {
  return client.policy()
}

export function rememberAgentMemory(request: AgentMemoryRequest): Promise<AgentMemoryRecord> {
  return client.remember(request)
}

export function previewAgentMemory(request: AgentMemoryRequest): Promise<AgentMemoryWritePreview> {
  return client.previewMemory(request)
}

export function searchAgentMemories(params: MemorySearchParams): Promise<AgentMemoryRecord[]> {
  return client.recall(params)
}

export function explainAgentMemoryRecall(params: MemorySearchParams): Promise<AgentMemoryRecallExplanation> {
  return client.explainRecall(params)
}

export function fetchAgentMemoryContextPack(query?: string, project?: string, limit?: number, asOf?: string): Promise<AgentMemoryContextPack> {
  return client.contextPack(query, project, limit, asOf)
}

export function fetchAgentMemoryBriefing(project?: string, limit?: number): Promise<AgentMemoryBriefing> {
  return client.sessionBriefing(project, limit)
}

export function fetchAgentMemoryStats(): Promise<AgentMemoryStats> {
  return client.stats()
}

export function fetchAgentMemoryAudit(project?: string): Promise<AgentMemoryAudit> {
  return client.audit(project)
}

export function fetchAgentMemoryTimeline(params: MemoryTimelineParams): Promise<AgentMemoryTimeline> {
  return client.timeline(params)
}
