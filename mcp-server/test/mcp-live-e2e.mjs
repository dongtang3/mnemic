import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const runLiveE2e = process.env.MNEMIC_RUN_LIVE_E2E === '1'
const apiBase = process.env.MNEMIC_API_BASE

test('Mnemic MCP adapter writes and recalls memories through a live backend', {
  skip: runLiveE2e ? false : 'Set MNEMIC_RUN_LIVE_E2E=1 and MNEMIC_API_BASE to run the live backend E2E smoke.',
}, async () => {
  assert.ok(apiBase, 'MNEMIC_API_BASE is required for live E2E smoke')

  const marker = `mnemic-live-e2e-${Date.now()}`
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MNEMIC_API_BASE: apiBase,
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'mnemic-live-e2e', version: '0.1.0' })

  try {
    await client.connect(transport)

    const first = await client.callTool({
      name: 'mnemic_remember',
      arguments: {
        title: `Live MCP memory ${marker}`,
        content: `Live end-to-end write marker ${marker}`,
        memoryType: 'decision',
        project: 'mnemic',
        tags: ['mcp', 'neo4j', 'live-e2e'],
        source: 'mcp-live-e2e',
        sourceKey: `${marker}:primary`,
        actor: 'codex-smoke',
        importance: 0.91,
        confidence: 0.88,
        observedAt: '2026-06-08T00:00:00Z',
        validFrom: '2026-06-08T00:00:00Z',
        metadata: {
          marker,
          path: 'mcp-server/test/mcp-live-e2e.mjs',
        },
      },
    })
    const firstText = textContent(first)
    assert.match(firstText, new RegExp(marker))
    assert.match(firstText, /confidence: 0.88/)
    const firstUid = memoryUid(firstText)

    const second = await client.callTool({
      name: 'mnemic_remember',
      arguments: {
        title: `Linked live MCP memory ${marker}`,
        content: `Second live memory for relationship marker ${marker}`,
        memoryType: 'workflow',
        project: 'mnemic',
        tags: ['mcp', 'relationship'],
        source: 'mcp-live-e2e',
        sourceKey: `${marker}:related`,
        importance: 0.72,
        confidence: 0.86,
      },
    })
    const secondUid = memoryUid(textContent(second))

    const linked = await client.callTool({
      name: 'mnemic_link_memories',
      arguments: {
        memoryUid: firstUid,
        targetMemoryUid: secondUid,
        relationshipType: 'supports',
        attributes: {
          marker,
          createdBy: 'mcp-live-e2e',
        },
      },
    })
    assert.match(textContent(linked), new RegExp(`related: .*${escapeRegex(secondUid)}`))

    const recalled = await client.callTool({
      name: 'mnemic_recall',
      arguments: {
        query: marker,
        project: 'mnemic',
        limit: 5,
      },
    })
    const recalledText = textContent(recalled)
    assert.match(recalledText, new RegExp(marker))
    assert.match(recalledText, new RegExp(escapeRegex(firstUid)))

    const pack = await client.callTool({
      name: 'mnemic_context_pack',
      arguments: {
        query: marker,
        project: 'mnemic',
        limit: 5,
      },
    })
    assert.match(textContent(pack), /Mnemic Agent Memory Context Pack/)
    assert.match(textContent(pack), new RegExp(marker))

    const stats = await client.callTool({ name: 'mnemic_memory_stats', arguments: {} })
    assert.match(textContent(stats), /Mnemic Agent Memory Stats/)
    assert.match(textContent(stats), /totalMemories: [1-9][0-9]*/)
    assert.match(textContent(stats), /eventCount: [1-9][0-9]*/)

    const timeline = await client.callTool({
      name: 'mnemic_memory_timeline',
      arguments: {
        project: 'mnemic',
        tag: 'live-e2e',
        limit: 5,
      },
    })
    assert.match(textContent(timeline), /Mnemic Agent Memory Timeline/)
    assert.match(textContent(timeline), new RegExp(marker))
  } finally {
    await transport.close()
  }
})

function textContent(result) {
  return result.content.map(part => part.text ?? '').join('\n')
}

function memoryUid(text) {
  const match = text.match(/^uid: (.+)$/m)
  assert.ok(match, `Could not find memory uid in:\n${text}`)
  return match[1].trim()
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
