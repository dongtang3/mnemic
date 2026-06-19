# @mnemic/sdk

Shared TypeScript contracts and HTTP client for Mnemic agent memory.

## Usage

```ts
import { MnemicClient } from '@mnemic/sdk'

const mnemic = new MnemicClient({ baseUrl: 'http://localhost:8088' })

await mnemic.remember({
  title: 'Use source keys',
  content: 'Repeated agent memory writes should use stable sourceKey values.',
  project: 'mnemic',
  memoryType: 'decision',
  sourceKey: 'docs/source-keys',
})

const context = await mnemic.contextPack('source keys', 'mnemic', 5)
console.log(context.context)
```

## Surface

- memory write and write-preview contracts
- recall and recall-explanation contracts
- temporal `asOf` query filters for validity-window recall and event-time audit reads
- context pack and session briefing contracts
- policy, audit, timeline, export/import, and rollback contracts
- event-log snapshot reconstruction contracts
- same-origin or absolute-base-url HTTP client

The repository root includes `docs/openapi.json` for the machine-readable HTTP contract used by this SDK surface.

This package is currently marked `private: true` until npm scope ownership is confirmed.
