# reader-mcp — workspace tools

HTTP (`POST /tools/<name>`) + MCP JSON-RPC (`POST /mcp`). Vault tools write **as the signed-in reader** into their Home Library (`seed-bible/<collection>/`), plus domain wrappers (highlights, annotations, bookmarks, saves, reading position/history, settings, profile, extension prefs, plan progress, variant selections), `secret.put` / `secret.use` (never returns the value), and `link-preview`.

Called only by reader-a2a. Grants nothing; holds no key.

Layout (`src/registry.ts`, `src/vault/`, `src/tools/<one file per tool>`) is in [`docs/architecture/repo-layout.md`](../../docs/architecture/repo-layout.md).
