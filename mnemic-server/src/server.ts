import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AgentMemoryService, HttpError } from './memoryService.js'
import { FileMemoryStore, type MemoryStore, SqliteMemoryStore } from './store.js'
import type { AgentMemoryPolicyConfig, AgentMemoryPolicySource } from './types.js'

type RequestContext = {
  request: IncomingMessage
  response: ServerResponse
  url: URL
}

export function createMnemicServer(service: AgentMemoryService) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const context = { request, response, url }
    try {
      if (request.method === 'OPTIONS') {
        sendNoContent(response)
        return
      }
      await route(context, service)
    } catch (error) {
      sendError(response, error)
    }
  })
}

export function createDefaultService(): AgentMemoryService {
  const policy = loadPolicySettings()
  return new AgentMemoryService(createDefaultStore(), policy.config, policy.source)
}

export function createDefaultStore(): MemoryStore {
  const storeKind = (process.env.MNEMIC_STORE ?? process.env.MNEMIC_STORAGE ?? 'json').trim().toLowerCase()
  if (storeKind === 'sqlite' || storeKind === 'sqlite3') {
    const sqliteFile = process.env.MNEMIC_SQLITE_FILE
      ?? resolve(process.cwd(), 'target', 'mnemic-memory.sqlite')
    return new SqliteMemoryStore(sqliteFile)
  }

  const memoryFile = process.env.MNEMIC_MEMORY_FILE
    ?? resolve(process.cwd(), 'target', 'mnemic-memory.json')
  return new FileMemoryStore(memoryFile)
}

export function loadPolicyConfig(): AgentMemoryPolicyConfig {
  return loadPolicySettings().config
}

export function loadPolicySettings(): { config: AgentMemoryPolicyConfig; source: AgentMemoryPolicySource } {
  const configuredFile = process.env.MNEMIC_POLICY_FILE?.trim()
  const policyFile = configuredFile || discoverDefaultPolicyFile()
  if (!policyFile) {
    return { config: {}, source: { kind: 'default', policyFile: '' } }
  }
  if (!existsSync(policyFile)) {
    if (configuredFile) {
      throw new Error(`MNEMIC_POLICY_FILE does not exist: ${policyFile}`)
    }
    return { config: {}, source: { kind: 'default', policyFile: '' } }
  }

  try {
    const parsed = JSON.parse(readFileSync(policyFile, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Policy config must be a JSON object.')
    }
    return {
      config: parsed as AgentMemoryPolicyConfig,
      source: { kind: 'file', policyFile },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to load Mnemic policy config from ${policyFile}: ${message}`)
  }
}

function discoverDefaultPolicyFile(): string {
  const candidates = [
    resolve(process.cwd(), '.mnemic', 'policy.json'),
    resolve(process.cwd(), '..', '.mnemic', 'policy.json'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? ''
}

async function route(context: RequestContext, service: AgentMemoryService): Promise<void> {
  const { request, response, url } = context

  if (request.method === 'GET' && url.pathname === '/actuator/health') {
    sendJson(response, {
      status: 'UP',
      service: 'mnemic-server',
    })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/policy') {
    sendJson(response, service.policyStatus())
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/audit') {
    sendJson(response, await service.audit(url.searchParams.get('project') ?? undefined))
    return
  }

  if (url.pathname === '/api/agent-memory/memories') {
    if (request.method === 'POST') {
      sendJson(response, await service.remember(await readJson(request)))
      return
    }
    if (request.method === 'GET') {
      sendJson(response, await service.search({
        query: url.searchParams.get('query') ?? undefined,
        project: url.searchParams.get('project') ?? undefined,
        memoryType: url.searchParams.get('memoryType') ?? undefined,
        tag: url.searchParams.get('tag') ?? undefined,
        asOf: url.searchParams.get('asOf') ?? undefined,
        limit: numberParam(url, 'limit'),
      }))
      return
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/agent-memory/memories/preview') {
    sendJson(response, await service.previewRemember(await readJson(request)))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/explain') {
    sendJson(response, await service.explainRecall({
      query: url.searchParams.get('query') ?? undefined,
      project: url.searchParams.get('project') ?? undefined,
      memoryType: url.searchParams.get('memoryType') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      asOf: url.searchParams.get('asOf') ?? undefined,
      limit: numberParam(url, 'limit'),
    }))
    return
  }

  const memoryMatch = /^\/api\/agent-memory\/memories\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && memoryMatch) {
    sendJson(response, await service.get(decodeURIComponent(memoryMatch[1])))
    return
  }

  const relationMatch = /^\/api\/agent-memory\/memories\/([^/]+)\/relations$/.exec(url.pathname)
  if (request.method === 'POST' && relationMatch) {
    sendJson(response, await service.link(decodeURIComponent(relationMatch[1]), await readJson(request)))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/context-pack') {
    sendJson(response, await service.contextPack(
      url.searchParams.get('query') ?? undefined,
      url.searchParams.get('project') ?? undefined,
      numberParam(url, 'limit'),
      url.searchParams.get('asOf') ?? undefined,
    ))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/briefing') {
    sendJson(response, await service.briefing(
      url.searchParams.get('project') ?? undefined,
      numberParam(url, 'limit'),
    ))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/stats') {
    sendJson(response, await service.stats())
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/export') {
    sendJson(response, await service.exportJsonl({
      project: url.searchParams.get('project') ?? undefined,
      memoryType: url.searchParams.get('memoryType') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      asOf: url.searchParams.get('asOf') ?? undefined,
      limit: numberParam(url, 'limit'),
    }))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/snapshot') {
    sendJson(response, await service.snapshot({
      project: url.searchParams.get('project') ?? undefined,
      memoryType: url.searchParams.get('memoryType') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      asOf: url.searchParams.get('asOf') ?? undefined,
      limit: numberParam(url, 'limit'),
    }))
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/agent-memory/import') {
    sendJson(response, await service.importJsonl(await readJson(request)))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/rollback-preview') {
    sendJson(response, await service.rollbackPreview(url.searchParams.get('eventUid') ?? ''))
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/agent-memory/rollback') {
    sendJson(response, await service.rollback(await readJson(request)))
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/agent-memory/timeline') {
    sendJson(response, await service.timeline({
      project: url.searchParams.get('project') ?? undefined,
      memoryType: url.searchParams.get('memoryType') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      asOf: url.searchParams.get('asOf') ?? undefined,
      limit: numberParam(url, 'limit'),
    }))
    return
  }

  throw new HttpError(404, `No route for ${request.method ?? 'GET'} ${url.pathname}`)
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return {} as T
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

function sendNoContent(response: ServerResponse): void {
  response.writeHead(204, corsHeaders())
  response.end()
}

function sendError(response: ServerResponse, error: unknown): void {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Unexpected server error'
  sendJson(response, {
    error: message,
    ...(error instanceof HttpError ? error.details : {}),
  }, status)
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  }
}

function numberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name)
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 8088)
  const server = createMnemicServer(createDefaultService())
  server.listen(port, '0.0.0.0', () => {
    console.log(`Mnemic server listening on http://127.0.0.1:${port}`)
  })
}
