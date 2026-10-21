# seed-bible-mcp — `seed-bible.svc` tools

Tools behind seed-bible-a2a, same two lanes as reader-mcp (`POST /tools/<name>` for the agent, `POST /mcp` JSON-RPC for MCP clients): `registry.*` (query, upsert, reindex), `files.*` (R2 put/get/catalog), `preview.*` (link preview cache), `cache.*`.

- Called only by seed-bible-a2a. Never by the browser, never by reader-web.
- Everything it stores is a rebuildable projection of public Library content.

Layout: see [`docs/architecture/repo-layout.md`](../../docs/architecture/repo-layout.md). Planned files: `wrangler.toml`, `src/index.ts`, `src/registry.ts`, `src/tools/`.
