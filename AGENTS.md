# Mnemic Agent Instructions

Mnemic is a graph-backed long-term memory substrate for coding agents and LLM applications.

When the `mnemic_*` MCP tools are available:

- Start non-trivial work by calling `mnemic_context_pack` with the current task and a concrete project scope.
- For broad or fresh sessions, call `mnemic_session_briefing` before making implementation decisions.
- Store a memory with `mnemic_remember` for durable architecture decisions, reusable bug fixes, release or environment rules, recurring workflows, and project-specific constraints.
- Use stable `sourceKey` values when possible, such as commit SHAs, issue IDs, ticket IDs, or session-summary IDs, so repeated runs update rather than duplicate memory.
- Set `confidence` below `1.0` when a memory is inferred, external, temporary, or likely to go stale.
- Keep memories factual, searchable, scoped to a project, and free of secrets.

If the MCP server is unavailable, continue normally and mention that Mnemic memory was not reachable.
