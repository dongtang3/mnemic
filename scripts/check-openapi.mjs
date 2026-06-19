#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const openApiFile = join(rootDir, 'docs', 'openapi.json')
const serverFile = join(rootDir, 'mnemic-server', 'src', 'server.ts')

const requiredOperations = [
  ['GET', '/actuator/health', '/actuator/health'],
  ['GET', '/api/agent-memory/policy', '/api/agent-memory/policy'],
  ['GET', '/api/agent-memory/audit', '/api/agent-memory/audit'],
  ['GET', '/api/agent-memory/memories', '/api/agent-memory/memories'],
  ['POST', '/api/agent-memory/memories', '/api/agent-memory/memories'],
  ['POST', '/api/agent-memory/memories/preview', '/api/agent-memory/memories/preview'],
  ['GET', '/api/agent-memory/explain', '/api/agent-memory/explain'],
  ['GET', '/api/agent-memory/memories/{memoryUid}', '/api/agent-memory/memories/'],
  ['POST', '/api/agent-memory/memories/{memoryUid}/relations', '/relations'],
  ['GET', '/api/agent-memory/context-pack', '/api/agent-memory/context-pack'],
  ['GET', '/api/agent-memory/briefing', '/api/agent-memory/briefing'],
  ['GET', '/api/agent-memory/stats', '/api/agent-memory/stats'],
  ['GET', '/api/agent-memory/export', '/api/agent-memory/export'],
  ['GET', '/api/agent-memory/snapshot', '/api/agent-memory/snapshot'],
  ['POST', '/api/agent-memory/import', '/api/agent-memory/import'],
  ['GET', '/api/agent-memory/rollback-preview', '/api/agent-memory/rollback-preview'],
  ['POST', '/api/agent-memory/rollback', '/api/agent-memory/rollback'],
  ['GET', '/api/agent-memory/timeline', '/api/agent-memory/timeline'],
]

const requiredSchemas = [
  'HealthStatus',
  'AgentMemoryRequest',
  'AgentMemoryRecord',
  'AgentMemoryRelationRequest',
  'AgentMemoryWritePreview',
  'AgentMemoryContextPack',
  'AgentMemoryRecallExplanation',
  'AgentMemoryBriefing',
  'AgentMemoryStats',
  'AgentMemoryPolicyStatus',
  'AgentMemoryAudit',
  'AgentMemoryTimeline',
  'AgentMemoryJsonlExport',
  'AgentMemorySnapshot',
  'AgentMemoryJsonlImportRequest',
  'AgentMemoryJsonlImportResult',
  'AgentMemoryRollbackPreview',
  'AgentMemoryRollbackRequest',
  'AgentMemoryRollbackResult',
  'ErrorResponse',
]

const requiredParameters = [
  'query',
  'project',
  'memoryType',
  'tag',
  'asOf',
  'limit',
  'memoryUid',
  'eventUid',
]

const failures = []
const rawOpenApi = await readFile(openApiFile, 'utf8')
const serverSource = await readFile(serverFile, 'utf8')
let document

try {
  document = JSON.parse(rawOpenApi)
} catch (error) {
  fail(`${relative(openApiFile)} is not valid JSON: ${error.message}`)
}

if (document && typeof document === 'object') {
  if (typeof document.openapi !== 'string' || !document.openapi.startsWith('3.')) {
    fail('OpenAPI document must declare an openapi 3.x version.')
  }

  const paths = asRecord(document.paths)
  for (const [method, path, implementationNeedle] of requiredOperations) {
    const operation = asRecord(paths[path])?.[method.toLowerCase()]
    if (!operation) {
      fail(`Missing OpenAPI operation ${method} ${path}.`)
    }
    if (!serverSource.includes(implementationNeedle)) {
      fail(`Server implementation no longer contains route marker "${implementationNeedle}" for ${method} ${path}.`)
    }
  }

  const schemas = asRecord(asRecord(document.components)?.schemas)
  for (const schemaName of requiredSchemas) {
    if (!schemas[schemaName]) {
      fail(`Missing OpenAPI schema ${schemaName}.`)
    }
  }

  const parameters = asRecord(asRecord(document.components)?.parameters)
  for (const parameterName of requiredParameters) {
    if (!parameters[parameterName]) {
      fail(`Missing OpenAPI parameter ${parameterName}.`)
    }
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    const operations = Object.entries(asRecord(pathItem) ?? {})
      .filter(([key]) => ['get', 'post', 'put', 'delete', 'patch'].includes(key))
    if (operations.length === 0) {
      fail(`Path ${path} has no HTTP operations.`)
    }
    for (const [method, operation] of operations) {
      if (!asRecord(operation)?.operationId) {
        fail(`Operation ${method.toUpperCase()} ${path} is missing operationId.`)
      }
      if (!asRecord(operation)?.responses) {
        fail(`Operation ${method.toUpperCase()} ${path} is missing responses.`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Mnemic OpenAPI check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Mnemic OpenAPI check passed: ${requiredOperations.length} operations, ${requiredSchemas.length} schemas, ${requiredParameters.length} parameters.`)

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function fail(message) {
  failures.push(message)
}

function relative(path) {
  return path.startsWith(`${rootDir}/`) ? path.slice(rootDir.length + 1) : path
}
