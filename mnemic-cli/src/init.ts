import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export type InitOptions = {
  rootDir: string
  port: number
  project: string
  force?: boolean
}

export type InitActionStatus = 'created' | 'updated' | 'skipped' | 'warning'

export type InitAction = {
  status: InitActionStatus
  path: string
  detail: string
}

export type InitResult = {
  rootDir: string
  port: number
  project: string
  actions: InitAction[]
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const rootDir = resolve(options.rootDir)
  const port = options.port
  const project = options.project
  const force = Boolean(options.force)
  const actions: InitAction[] = []

  actions.push(await writeTextFile(
    rootDir,
    '.env.mnemic',
    envTemplate(port),
    force,
    'Local backend and storage environment.',
  ))

  actions.push(await writePolicyFile(rootDir, force))
  actions.push(await writeMcpManifest(rootDir, port, force))
  actions.push(await writeTextFile(
    rootDir,
    'AGENTS.mnemic.md',
    agentInstructionsTemplate(project),
    force,
    'Agent instructions snippet for Mnemic-aware coding sessions.',
  ))

  if (!(await fileExists(join(rootDir, 'scripts/run-agent-memory-mcp.sh')))) {
    actions.push({
      status: 'warning',
      path: 'scripts/run-agent-memory-mcp.sh',
      detail: 'MCP manifest points at the source-workspace runner, but the runner script was not found.',
    })
  }

  return { rootDir, port, project, actions }
}

export function formatInitResult(result: InitResult): string {
  const lines = [
    'Mnemic Init',
    `root: ${result.rootDir}`,
    `project: ${result.project}`,
    `port: ${result.port}`,
  ]

  for (const action of result.actions) {
    lines.push('')
    lines.push(`[${action.status}] ${action.path}`)
    lines.push(`  ${action.detail}`)
  }

  lines.push('')
  lines.push('Next steps:')
  lines.push('  npm run build')
  lines.push('  scripts/start-agent-memory-stack.sh')
  lines.push('  npm run doctor')

  return lines.join('\n')
}

async function writePolicyFile(rootDir: string, force: boolean): Promise<InitAction> {
  const targetPath = '.mnemic/policy.json'
  const examplePath = join(rootDir, '.mnemic/policy.example.json')
  const hasExample = await fileExists(examplePath)
  const content = hasExample ? await readFile(examplePath, 'utf8') : `${JSON.stringify(defaultPolicy(), null, 2)}\n`
  return writeTextFile(
    rootDir,
    targetPath,
    content,
    force,
    hasExample
      ? 'Governance policy copied from .mnemic/policy.example.json.'
      : 'Governance policy created from built-in defaults.',
  )
}

async function writeMcpManifest(rootDir: string, port: number, force: boolean): Promise<InitAction> {
  const targetPath = '.mcp.json'
  const absolutePath = join(rootDir, targetPath)
  const entry = {
    command: '/bin/bash',
    args: ['./scripts/run-agent-memory-mcp.sh'],
    env: {
      MNEMIC_API_BASE: `http://localhost:${port}`,
    },
  }

  if (await fileExists(absolutePath)) {
    const existing = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown
    if (!isRecord(existing)) {
      return {
        status: 'warning',
        path: targetPath,
        detail: 'Existing .mcp.json is not a JSON object; left unchanged.',
      }
    }

    const mcpServers = isRecord(existing.mcpServers) ? existing.mcpServers : {}
    if (isRecord(mcpServers['mnemic-memory']) && !force) {
      return {
        status: 'skipped',
        path: targetPath,
        detail: 'mnemic-memory MCP entry already exists. Re-run with --force to update it.',
      }
    }

    const updated = {
      ...existing,
      mcpServers: {
        ...mcpServers,
        'mnemic-memory': entry,
      },
    }
    await writeFile(absolutePath, `${JSON.stringify(updated, null, 2)}\n`)
    return {
      status: isRecord(mcpServers['mnemic-memory']) ? 'updated' : 'created',
      path: targetPath,
      detail: 'Wrote mnemic-memory MCP entry.',
    }
  }

  await ensureParentDir(absolutePath)
  await writeFile(absolutePath, `${JSON.stringify({ mcpServers: { 'mnemic-memory': entry } }, null, 2)}\n`)
  return {
    status: 'created',
    path: targetPath,
    detail: 'Created generic JSON MCP manifest.',
  }
}

async function writeTextFile(rootDir: string, relativePath: string, content: string, force: boolean, detail: string): Promise<InitAction> {
  const absolutePath = join(rootDir, relativePath)
  if (await fileExists(absolutePath)) {
    if (!force) {
      return {
        status: 'skipped',
        path: relativePath,
        detail: 'Already exists. Re-run with --force to overwrite.',
      }
    }
    await writeFile(absolutePath, content)
    return {
      status: 'updated',
      path: relativePath,
      detail,
    }
  }

  await ensureParentDir(absolutePath)
  await writeFile(absolutePath, content)
  return {
    status: 'created',
    path: relativePath,
    detail,
  }
}

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function envTemplate(port: number): string {
  return `SERVER_PORT=${port}
MNEMIC_PORT=${port}
MNEMIC_STORE=json
MNEMIC_MEMORY_FILE=target/mnemic-memory.json
MNEMIC_SQLITE_FILE=target/mnemic-memory.sqlite
MNEMIC_API_BASE=http://localhost:${port}
MNEMIC_POLICY_FILE=.mnemic/policy.json

# Set MNEMIC_STORE=sqlite for a local SQLite-backed memory store.
`
}

function agentInstructionsTemplate(project: string): string {
  return `# Mnemic Agent Instructions

Mnemic is a graph-backed long-term memory substrate for coding agents and LLM applications.

When the \`mnemic_*\` MCP tools are available:

- Start non-trivial work by calling \`mnemic_context_pack\` with the current task and project scope \`${project}\`.
- For broad or fresh sessions, call \`mnemic_session_briefing\` before making implementation decisions.
- Store durable architecture decisions, reusable bug fixes, release rules, recurring workflows, and project-specific constraints with \`mnemic_remember\`.
- Use stable \`sourceKey\` values when possible, such as commit SHAs, issue IDs, ticket IDs, or session-summary IDs.
- Set \`confidence\` below \`1.0\` when a memory is inferred, temporary, external, or likely to go stale.
- Keep memories factual, searchable, scoped to a project, and free of secrets.

If the MCP server is unavailable, continue normally and mention that Mnemic memory was not reachable.
`
}

function defaultPolicy(): Record<string, unknown> {
  return {
    requireSourceKey: {
      memoryTypes: ['release', 'security', 'incident', 'migration', 'rollback', 'production', 'prod'],
      tags: ['release', 'security', 'incident', 'migration', 'rollback', 'production', 'prod'],
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
}
