# @mnemic/server

TypeScript HTTP backend for Mnemic long-term agent memory.

## Usage

```bash
SERVER_PORT=8088 \
MNEMIC_MEMORY_FILE=target/mnemic-memory.json \
node dist/server.js
```

Health:

```bash
curl http://localhost:8088/actuator/health
```

## Storage

Default storage is an inspectable JSON state/event file:

```bash
MNEMIC_MEMORY_FILE=target/mnemic-memory.json
```

SQLite is available for local durability:

```bash
MNEMIC_STORE=sqlite MNEMIC_SQLITE_FILE=target/mnemic-memory.sqlite node dist/server.js
```

## API

Base path: `/api/agent-memory`

The full machine-readable contract is `docs/openapi.json` at the repository root. Run `npm run openapi:check` from the root to validate required routes and schemas.

- `POST /memories`
- `POST /memories/preview`
- `GET /memories`
- `GET /explain`
- `GET /context-pack`
- `GET /briefing`
- `GET /policy`
- `GET /audit`
- `GET /timeline`
- `GET /export`
- `GET /snapshot`
- `POST /import`
- `GET /rollback-preview`
- `POST /rollback`

Recall, explain, and context-pack endpoints accept `asOf` to filter memories by `validFrom` / `validTo`. Timeline and export accept `asOf` to return events at or before that timestamp.

Snapshot replays the append-only event log into a historical memory graph state.

This package is currently marked `private: true` until npm scope ownership is confirmed.
