# reader-web — the Seed Bible UI

Vite + Preact + `@preact/signals`, deployed as a Worker with static assets and SSR. Signs in with the faithnet Home through `@agenticprimitives/connect-client` (`src/session.ts`) and talks to **one origin**: reader-a2a (`src/backend/`). It never fetches an MCP, `seed-bible.svc`, or an agent card (ADR-0044).

Layout (`src/backend`, `state/<domain>`, `components/<domain>`, `extensions/`, `i18n/`, `styles/`, `sw/`, `routes/`, `worker/`) is in [`docs/architecture/repo-layout.md`](../../docs/architecture/repo-layout.md). Nothing here imports `@casual-simulation/*` or `packages/seed-bible/**`; code is ported by copy and rewritten against `ReaderBackend`.
