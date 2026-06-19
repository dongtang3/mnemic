# Mnemic Claude Code Notes

This project includes a project-level `.mcp.json` for the Mnemic memory MCP server.

Before using the memory tools, start the backend:

```bash
cp .env.mnemic.example .env.mnemic
scripts/run-agent-memory-backend.sh
```

Then run Claude Code from this project root. When the `mnemic_*` tools are available, follow the memory protocol in `AGENTS.md`.
