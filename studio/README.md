# Mnemic Studio

React frontend for the Mnemic memory workbench.

## Run

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/actuator` to `http://localhost:8088`.

Studio uses `@mnemic/sdk` for shared contracts and HTTP calls.

## Build

```bash
npm run build
```

## Current Scope

- memory write form
- memory recall filters
- context-pack builder
- session briefing panel
- memory timeline
- backend and MCP runtime status
