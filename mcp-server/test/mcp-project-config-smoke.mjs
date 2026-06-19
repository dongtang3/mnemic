import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('project .mcp.json launches the Mnemic memory MCP server', async () => {
  const mcpConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, '.mcp.json'), 'utf8'))
  const serverConfig = mcpConfig.mcpServers?.['mnemic-memory']
  assert.ok(serverConfig, 'Missing mnemic-memory in project .mcp.json')

  const backend = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/agent-memory/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        generatedAt: '2026-06-08T16:00:00Z',
        totalMemories: 1,
        byMemoryType: { decision: 1 },
        byProject: { mnemic: 1 },
        averageImportance: 0.9,
        averageConfidence: 0.8,
        explicitRelationCount: 0,
        eventCount: 1,
        latestUpdatedAt: '2026-06-08T16:00:00Z',
        latestEventAt: '2026-06-08T16:00:00Z',
      }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  })

  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  const { port } = backend.address()
  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    cwd: projectRoot,
    env: {
      ...process.env,
      ...(serverConfig.env ?? {}),
      MNEMIC_API_BASE: `http://127.0.0.1:${port}`,
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'mnemic-project-config-smoke', version: '0.1.0' })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.ok(tools.tools.some(tool => tool.name === 'mnemic_remember'))
    assert.ok(tools.tools.some(tool => tool.name === 'mnemic_memory_stats'))
    assert.ok(tools.tools.some(tool => tool.name === 'mnemic_memory_timeline'))

    const stats = await client.callTool({ name: 'mnemic_memory_stats', arguments: {} })
    assert.match(stats.content[0].text, /totalMemories: 1/)
  } finally {
    await transport.close()
    await new Promise(resolve => backend.close(resolve))
  }
})
