import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { MnemicClient } from '@mnemic/sdk'

export type DoctorOptions = {
  client: MnemicClient
  baseUrl: string
  project: string
  rootDir: string
  requireBackend?: boolean
}

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail'

export type DoctorCheck = {
  status: DoctorCheckStatus
  name: string
  detail: string
  recommendation?: string
}

export type DoctorReport = {
  generatedAt: string
  rootDir: string
  baseUrl: string
  project: string
  summary: {
    pass: number
    warn: number
    fail: number
  }
  checks: DoctorCheck[]
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const rootDir = resolve(options.rootDir)
  const checks: DoctorCheck[] = []

  checks.push(checkNodeVersion())
  checks.push(await checkRootPackage(rootDir))
  checks.push(...await checkWorkspacePackages(rootDir))
  checks.push(...await checkInitConfig(rootDir))
  checks.push(...await checkOpenSourceMetadata(rootDir))
  checks.push(...await checkCommunityHealth(rootDir))
  checks.push(...await checkSecurityHardening(rootDir))
  checks.push(...await checkSupplyChain(rootDir))
  checks.push(...await checkLaunchAssets(rootDir))
  checks.push(...await checkCompletionAudit(rootDir))
  checks.push(...await checkRepositoryMigration(rootDir))
  checks.push(...await checkDockerQuickstart(rootDir))
  checks.push(...await checkBenchmarkLandscape(rootDir))
  checks.push(...await checkMarketReadiness(rootDir))
  checks.push(...await checkReleaseReadiness(rootDir))
  checks.push(...await checkPackageReadinessFiles(rootDir))
  checks.push(...await checkOpenApiContractFiles(rootDir))
  checks.push(...await checkBuildArtifacts(rootDir))
  checks.push(await checkMcpManifest(rootDir))
  checks.push(await checkPolicyExample(rootDir))
  checks.push(await checkBenchmarkReport(rootDir))
  checks.push(...await checkBackend(options))

  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    baseUrl: options.baseUrl,
    project: options.project,
    summary: {
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: checks.filter((check) => check.status === 'warn').length,
      fail: checks.filter((check) => check.status === 'fail').length,
    },
    checks,
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'Mnemic Doctor',
    `generatedAt: ${report.generatedAt}`,
    `root: ${report.rootDir}`,
    `backend: ${report.baseUrl}`,
    `project: ${report.project}`,
    `summary: ${report.summary.pass} pass, ${report.summary.warn} warning, ${report.summary.fail} fail`,
  ]

  for (const check of report.checks) {
    lines.push('')
    lines.push(`[${check.status}] ${check.name}`)
    lines.push(`  ${check.detail}`)
    if (check.recommendation) {
      lines.push(`  recommendation: ${check.recommendation}`)
    }
  }

  return lines.join('\n')
}

function checkNodeVersion(): DoctorCheck {
  const major = Number(process.versions.node.split('.')[0] ?? '0')
  if (major >= 20) {
    return {
      status: 'pass',
      name: 'Node.js runtime',
      detail: `Node ${process.versions.node} satisfies >=20.`,
    }
  }
  return {
    status: 'fail',
    name: 'Node.js runtime',
    detail: `Node ${process.versions.node} is below the required >=20 runtime.`,
    recommendation: 'Install Node.js 20 or newer.',
  }
}

async function checkRootPackage(rootDir: string): Promise<DoctorCheck> {
  const packageFile = join(rootDir, 'package.json')
  const parsed = await readJsonFile(packageFile)
  if (!parsed.ok) {
    return {
      status: 'fail',
      name: 'Root package',
      detail: parsed.error,
      recommendation: 'Run doctor from the Mnemic repository root or pass --root /path/to/repo.',
    }
  }

  const name = typeof parsed.value.name === 'string' ? parsed.value.name : ''
  if (name === '@mnemic/platform') {
    return {
      status: 'pass',
      name: 'Root package',
      detail: 'Found @mnemic/platform package.json.',
    }
  }

  return {
    status: 'warn',
    name: 'Root package',
    detail: `Found package.json with name "${name || '(missing)'}".`,
    recommendation: 'Run doctor from the Mnemic repository root for full source-workspace checks.',
  }
}

async function checkWorkspacePackages(rootDir: string): Promise<DoctorCheck[]> {
  const packages = ['mnemic-sdk', 'mnemic-cli', 'mnemic-server', 'mcp-server', 'studio']
  return Promise.all(packages.map(async (packageDir) => {
    const packageFile = join(rootDir, packageDir, 'package.json')
    if (await fileExists(packageFile)) {
      return {
        status: 'pass',
        name: `Workspace package ${packageDir}`,
        detail: `Found ${relativePath(rootDir, packageFile)}.`,
      }
    }
    return {
      status: 'fail',
      name: `Workspace package ${packageDir}`,
      detail: `Missing ${relativePath(rootDir, packageFile)}.`,
      recommendation: 'Restore the TypeScript workspace package before publishing or running from source.',
    }
  }))
}

async function checkInitConfig(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Local environment', '.env.mnemic', 'Run npm run init to generate local backend and storage settings.'],
    ['Local policy', '.mnemic/policy.json', 'Run npm run init to copy .mnemic/policy.example.json into a local policy file.'],
  ] as const

  return Promise.all(files.map(async ([name, configPath, recommendation]) => {
    const absolutePath = join(rootDir, configPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${configPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${configPath}.`,
      recommendation,
    }
  }))
}

async function checkOpenSourceMetadata(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['License', 'LICENSE'],
    ['Contributing guide', 'CONTRIBUTING.md'],
    ['Security policy', 'SECURITY.md'],
    ['Changelog', 'CHANGELOG.md'],
    ['Release checklist', 'docs/release-checklist.md'],
    ['Pull request template', '.github/PULL_REQUEST_TEMPLATE.md'],
    ['Bug report template', '.github/ISSUE_TEMPLATE/bug_report.yml'],
    ['Feature request template', '.github/ISSUE_TEMPLATE/feature_request.yml'],
  ] as const

  return Promise.all(files.map(async ([name, metadataPath]) => {
    const absolutePath = join(rootDir, metadataPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${metadataPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${metadataPath}.`,
      recommendation: 'Add the open-source launch metadata before public release.',
    }
  }))
}

async function checkCommunityHealth(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Code of conduct', 'CODE_OF_CONDUCT.md'],
    ['Support policy', 'SUPPORT.md'],
    ['Dependabot config', '.github/dependabot.yml'],
    ['Community health check', 'scripts/check-community-health.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, communityPath]) => {
    const absolutePath = join(rootDir, communityPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${communityPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${communityPath}.`,
      recommendation: 'Restore community-health metadata before public GitHub launch.',
    }
  }))
}

async function checkSecurityHardening(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Security hardening guide', 'docs/security-hardening.md'],
    ['Security hardening check', 'scripts/check-security-hardening.mjs'],
    ['CodeQL workflow', '.github/workflows/codeql.yml'],
  ] as const

  return Promise.all(files.map(async ([name, securityPath]) => {
    const absolutePath = join(rootDir, securityPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${securityPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${securityPath}.`,
      recommendation: 'Restore security hardening metadata before public GitHub launch.',
    }
  }))
}

async function checkSupplyChain(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Supply-chain guide', 'docs/supply-chain.md'],
    ['Supply-chain check', 'scripts/check-supply-chain.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, supplyPath]) => {
    const absolutePath = join(rootDir, supplyPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${supplyPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${supplyPath}.`,
      recommendation: 'Restore supply-chain readiness metadata before public package publication.',
    }
  }))
}

async function checkPackageReadinessFiles(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Package readiness script', 'scripts/check-package-readiness.mjs'],
    ['SDK package README', 'mnemic-sdk/README.md'],
    ['CLI package README', 'mnemic-cli/README.md'],
    ['Server package README', 'mnemic-server/README.md'],
    ['MCP package README', 'mcp-server/README.md'],
  ] as const

  return Promise.all(files.map(async ([name, packagePath]) => {
    const absolutePath = join(rootDir, packagePath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${packagePath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${packagePath}.`,
      recommendation: 'Run npm run package:check before publishing packages.',
    }
  }))
}

async function checkLaunchAssets(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['README visual card', 'docs/assets/mnemic-readme-card.svg'],
    ['Studio preview screenshot', 'docs/assets/mnemic-studio-preview.png'],
    ['Docs integrity check', 'scripts/check-docs-integrity.mjs'],
    ['Launch readiness check', 'scripts/check-launch-readiness.mjs'],
    ['TypeScript rewrite check', 'scripts/check-typescript-rewrite.mjs'],
    ['Fresh clone check', 'scripts/check-fresh-clone.mjs'],
    ['GitHub launch playbook', 'docs/github-launch.md'],
    ['GitHub launch check', 'scripts/check-github-launch.mjs'],
    ['Publication readiness check', 'scripts/check-publication-readiness.mjs'],
    ['Studio preview capture script', 'scripts/capture-studio-preview.mjs'],
    ['Coding-agent demo walkthrough', 'examples/coding-agent-memory/README.md'],
  ] as const

  return Promise.all(files.map(async ([name, launchPath]) => {
    const absolutePath = join(rootDir, launchPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${launchPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${launchPath}.`,
      recommendation: 'Restore the launch-readiness asset before public GitHub sharing.',
    }
  }))
}

async function checkCompletionAudit(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Completion audit', 'docs/completion-audit.md'],
    ['Completion audit check', 'scripts/check-completion-audit.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, auditPath]) => {
    const absolutePath = join(rootDir, auditPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${auditPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${auditPath}.`,
      recommendation: 'Restore the completion audit before claiming the rewrite or launch-candidate scope is done.',
    }
  }))
}

async function checkRepositoryMigration(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Repository identity doc', 'docs/repository-migration.md'],
    ['Repository identity check', 'scripts/check-repository-migration.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, migrationPath]) => {
    const absolutePath = join(rootDir, migrationPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${migrationPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${migrationPath}.`,
      recommendation: 'Restore repository identity metadata before public GitHub launch.',
    }
  }))
}

async function checkDockerQuickstart(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Docker Compose quickstart', 'docker-compose.agent-memory.yml'],
    ['Backend Dockerfile', 'mnemic-server/Dockerfile.agent-memory'],
    ['Docker readiness check', 'scripts/check-docker-readiness.mjs'],
    ['Docker quickstart docs', 'docs/docker-quickstart.md'],
  ] as const

  return Promise.all(files.map(async ([name, dockerPath]) => {
    const absolutePath = join(rootDir, dockerPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${dockerPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${dockerPath}.`,
      recommendation: 'Restore the Docker quickstart path or remove Docker launch claims before release.',
    }
  }))
}

async function checkBenchmarkLandscape(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Benchmark landscape', 'docs/benchmark-landscape.md'],
    ['Benchmark landscape check', 'scripts/check-benchmark-landscape.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, benchmarkPath]) => {
    const absolutePath = join(rootDir, benchmarkPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${benchmarkPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${benchmarkPath}.`,
      recommendation: 'Restore benchmark landscape documentation before publishing benchmark claims.',
    }
  }))
}

async function checkMarketReadiness(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['Market readiness check', 'scripts/check-market-readiness.mjs'],
  ] as const

  return Promise.all(files.map(async ([name, marketPath]) => {
    const absolutePath = join(rootDir, marketPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${marketPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${marketPath}.`,
      recommendation: 'Restore market readiness checks before publishing 2026 positioning claims.',
    }
  }))
}

async function checkReleaseReadiness(rootDir: string): Promise<DoctorCheck[]> {
  const files = [
    ['npm publishing strategy', 'docs/npm-publishing.md'],
    ['Release notes generator', 'scripts/generate-release-notes.mjs'],
    ['Release readiness check', 'scripts/check-release-readiness.mjs'],
    ['v0.1.0 release notes', 'docs/releases/v0.1.0.md'],
  ] as const

  return Promise.all(files.map(async ([name, releasePath]) => {
    const absolutePath = join(rootDir, releasePath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${releasePath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${releasePath}.`,
      recommendation: 'Run npm run release:notes and restore release-readiness docs before tagging.',
    }
  }))
}

async function checkOpenApiContractFiles(rootDir: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  const contractFile = join(rootDir, 'docs/openapi.json')
  const parsed = await readJsonFile(contractFile)
  if (parsed.ok) {
    const version = typeof parsed.value.openapi === 'string' ? parsed.value.openapi : ''
    checks.push({
      status: version.startsWith('3.') ? 'pass' : 'fail',
      name: 'OpenAPI contract',
      detail: version.startsWith('3.') ? 'Parsed docs/openapi.json.' : 'docs/openapi.json does not declare an OpenAPI 3.x version.',
      recommendation: version.startsWith('3.') ? undefined : 'Restore docs/openapi.json from the current HTTP route contract.',
    })
  } else {
    checks.push({
      status: 'fail',
      name: 'OpenAPI contract',
      detail: parsed.error,
      recommendation: 'Restore docs/openapi.json so SDK, HTTP, and docs stay aligned.',
    })
  }

  const scriptPath = join(rootDir, 'scripts/check-openapi.mjs')
  if (await fileExists(scriptPath)) {
    checks.push({
      status: 'pass',
      name: 'OpenAPI contract check',
      detail: 'Found scripts/check-openapi.mjs.',
    })
  } else {
    checks.push({
      status: 'warn',
      name: 'OpenAPI contract check',
      detail: 'Missing scripts/check-openapi.mjs.',
      recommendation: 'Restore the OpenAPI check script before changing HTTP routes.',
    })
  }

  return checks
}

async function checkBuildArtifacts(rootDir: string): Promise<DoctorCheck[]> {
  const artifacts = [
    ['CLI build', 'mnemic-cli/dist/index.js'],
    ['Server build', 'mnemic-server/dist/server.js'],
    ['MCP build', 'mcp-server/dist/index.js'],
    ['Studio build', 'studio/dist/index.html'],
  ] as const

  return Promise.all(artifacts.map(async ([name, artifactPath]) => {
    const absolutePath = join(rootDir, artifactPath)
    if (await fileExists(absolutePath)) {
      return {
        status: 'pass',
        name,
        detail: `Found ${artifactPath}.`,
      }
    }
    return {
      status: 'warn',
      name,
      detail: `Missing ${artifactPath}.`,
      recommendation: 'Run npm run build before packaging, publishing, or testing MCP clients.',
    }
  }))
}

async function checkMcpManifest(rootDir: string): Promise<DoctorCheck> {
  const manifestFile = join(rootDir, '.mcp.json')
  const parsed = await readJsonFile(manifestFile)
  if (!parsed.ok) {
    return {
      status: 'warn',
      name: 'MCP manifest',
      detail: parsed.error,
      recommendation: 'Create .mcp.json or use docs/mcp-client-configs.md for client-specific setup.',
    }
  }

  const servers = isRecord(parsed.value.mcpServers) ? parsed.value.mcpServers : {}
  const entry = servers['mnemic-memory']
  if (!isRecord(entry)) {
    return {
      status: 'warn',
      name: 'MCP manifest',
      detail: '.mcp.json does not define mcpServers.mnemic-memory.',
      recommendation: 'Add the local Mnemic MCP server entry from docs/mcp-client-configs.md.',
    }
  }

  const args = Array.isArray(entry.args) ? entry.args.filter((value): value is string => typeof value === 'string') : []
  const scriptArg = args.find((arg) => arg.includes('run-agent-memory-mcp.sh'))
  if (!scriptArg) {
    return {
      status: 'warn',
      name: 'MCP manifest',
      detail: 'mnemic-memory entry exists but does not reference scripts/run-agent-memory-mcp.sh.',
      recommendation: 'Point the MCP entry at the repository MCP runner script.',
    }
  }

  const scriptPath = join(rootDir, scriptArg.replace(/^\.\//, ''))
  if (!(await fileExists(scriptPath))) {
    return {
      status: 'fail',
      name: 'MCP manifest',
      detail: `MCP runner ${scriptArg} is missing.`,
      recommendation: 'Restore scripts/run-agent-memory-mcp.sh.',
    }
  }

  return {
    status: 'pass',
    name: 'MCP manifest',
    detail: '.mcp.json defines mnemic-memory and points at the local MCP runner.',
  }
}

async function checkPolicyExample(rootDir: string): Promise<DoctorCheck> {
  const policyFile = join(rootDir, '.mnemic/policy.example.json')
  const parsed = await readJsonFile(policyFile)
  if (!parsed.ok) {
    return {
      status: 'fail',
      name: 'Policy example',
      detail: parsed.error,
      recommendation: 'Restore .mnemic/policy.example.json so teams can configure governance safely.',
    }
  }

  return {
    status: 'pass',
    name: 'Policy example',
    detail: 'Parsed .mnemic/policy.example.json.',
  }
}

async function checkBenchmarkReport(rootDir: string): Promise<DoctorCheck> {
  const reportFile = join(rootDir, 'target/mnemic-benchmark/mnemic-eval-report.md')
  if (await fileExists(reportFile)) {
    return {
      status: 'pass',
      name: 'Benchmark report',
      detail: 'Found target/mnemic-benchmark/mnemic-eval-report.md.',
    }
  }

  return {
    status: 'warn',
    name: 'Benchmark report',
    detail: 'No local benchmark report found.',
    recommendation: 'Run npm run benchmark before publishing release notes or benchmark claims.',
  }
}

async function checkBackend(options: DoctorOptions): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  try {
    const health = await options.client.health()
    checks.push({
      status: health.status === 'UP' ? 'pass' : 'warn',
      name: 'Backend health',
      detail: `${health.status} ${health.service}`,
      recommendation: health.status === 'UP' ? undefined : 'Restart the Mnemic backend and re-run doctor.',
    })
  } catch (error) {
    checks.push({
      status: options.requireBackend ? 'fail' : 'warn',
      name: 'Backend health',
      detail: errorMessage(error),
      recommendation: 'Start the backend with scripts/start-agent-memory-stack.sh, or omit --require-backend for offline checks.',
    })
    return checks
  }

  try {
    const policy = await options.client.policy()
    checks.push({
      status: 'pass',
      name: 'Backend policy',
      detail: `Policy source: ${policy.source.kind}${policy.source.policyFile ? ` (${policy.source.policyFile})` : ''}.`,
    })
  } catch (error) {
    checks.push({
      status: 'fail',
      name: 'Backend policy',
      detail: errorMessage(error),
      recommendation: 'Confirm the backend exposes GET /api/agent-memory/policy.',
    })
  }

  try {
    const audit = await options.client.audit(options.project)
    const hasBlocks = audit.summary.blockCount > 0
    const hasWarnings = audit.summary.warningCount > 0
    checks.push({
      status: hasBlocks ? 'fail' : hasWarnings ? 'warn' : 'pass',
      name: 'Backend memory audit',
      detail: `project=${audit.project || '(any)'} healthScore=${audit.healthScore} blocks=${audit.summary.blockCount} warnings=${audit.summary.warningCount}`,
      recommendation: hasBlocks || hasWarnings ? 'Run mnemic audit for detailed memory hygiene findings.' : undefined,
    })
  } catch (error) {
    checks.push({
      status: 'fail',
      name: 'Backend memory audit',
      detail: errorMessage(error),
      recommendation: 'Confirm the backend exposes GET /api/agent-memory/audit.',
    })
  }

  return checks
}

async function readJsonFile(path: string): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (!isRecord(value)) {
      return { ok: false, error: `${path} is not a JSON object.` }
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: `${path}: ${errorMessage(error)}` }
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function relativePath(rootDir: string, path: string): string {
  return path.startsWith(rootDir) ? path.slice(rootDir.length + 1) : path
}
