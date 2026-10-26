# reader-a2a — `seed-reader.workspace`

Hono + `@agenticprimitives/service-host`. The only origin the browser sees: `/harness/*`, `/api/a2a`, `/hello`, `/me`, and the live-session room `/agents/reading-session/<id>` (`ReadingSessionDO`, Cloudflare Agents SDK). Plans `skill:seed/*` by pinned digest, forwards acts over the person's ask-as-me wire or the org steward path, calls reader-mcp (`MCP`) and seed-bible-a2a (`PLATFORM`).

It coordinates; it never becomes the reader. It holds the marker, never a custody key.

Layout (`src/routes`, `skills`, `planner`, `pins`, `wires`, `standing`, `rooms`, `clients`) is in [`docs/architecture/repo-layout.md`](../../docs/architecture/repo-layout.md).
