# Mnemic Docker Quickstart

Use this path when you want to try Mnemic from a fresh clone without wiring a local Node process yourself.

## Start The Backend

```bash
docker compose -f docker-compose.agent-memory.yml up -d --build mnemic-memory-backend
```

Check health:

```bash
curl -fsS http://127.0.0.1:8088/actuator/health
```

The backend listens on `http://127.0.0.1:8088` by default and persists local data in the `mnemic_memory_data` Docker volume.

## Use The CLI Against Docker

Build the CLI locally, then point it at the container:

```bash
npm install
npm run cli:build
node mnemic-cli/dist/index.js health --base-url http://127.0.0.1:8088
node mnemic-cli/dist/index.js remember \
  --base-url http://127.0.0.1:8088 \
  --project mnemic \
  --title "Docker quickstart works" \
  --content "The Mnemic backend is running in Docker and the local CLI can write memory." \
  --source-key "docs/docker-quickstart"
```

## SQLite Mode

JSON storage is the default. Use SQLite for a durable local file inside the Docker volume:

```bash
MNEMIC_STORE=sqlite docker compose -f docker-compose.agent-memory.yml up -d --build mnemic-memory-backend
```

The container writes SQLite data to `/data/mnemic-memory.sqlite`.

## Optional Graph Store

Neo4j is not required for the current Mnemic memory kernel. The compose file keeps it behind an optional profile for future graph-store adapter work:

```bash
docker compose -f docker-compose.agent-memory.yml --profile graph-store up -d mnemic-memory-neo4j
```

## Stop

```bash
docker compose -f docker-compose.agent-memory.yml stop mnemic-memory-backend
```

Remove all Mnemic containers and volumes when you want a clean local Docker state:

```bash
docker compose -f docker-compose.agent-memory.yml down -v
```

## Repository Scripts

The source-workspace helper defaults to the Docker backend path:

```bash
scripts/start-agent-memory-stack.sh
```

Use the local Node fallback when Docker is unavailable:

```bash
MNEMIC_SKIP_DOCKER=1 scripts/start-agent-memory-stack.sh
```

Validate the Docker launch surface without requiring Docker:

```bash
npm run docker:check
```

Validate Docker Compose syntax when Docker is installed:

```bash
node scripts/check-docker-readiness.mjs --compose-config
```

Run the full live Docker gate before public release claims:

```bash
node scripts/check-docker-readiness.mjs --compose-config --live
```

The live gate uses host port `49888` by default so it does not collide with a local backend on `8088`. Override it when needed:

```bash
node scripts/check-docker-readiness.mjs --compose-config --live --live-port 49988
```
