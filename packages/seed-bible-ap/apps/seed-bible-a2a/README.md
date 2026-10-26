# seed-bible-a2a — `seed-bible.svc` (serving plane)

The service agent custodied by `seedreader.me`. Holds the **Seed registry** (public offerings, playlists, plans, customizations indexed by `scr:Passage`, crawled from public Library shelves), **public file bytes** (R2), and **caches** (link previews). Agent card advertises `capabilities.streaming: true`.

- Called only by reader-a2a (`PLATFORM` service binding / `PLATFORM_URL`). reader-web never fetches this origin.
- Not the record. D1, R2 and any Durable Object here can be wiped and rebuilt from Libraries and shelves (ADR-0055).
- Grants nothing; holds no custody key.

Layout: see [`docs/architecture/repo-layout.md`](../../docs/architecture/repo-layout.md). Planned files: `wrangler.toml`, `migrations/`, `src/{worker,index,host,card}.ts`, `src/skills/`, `src/registry/`, `src/files/`, `src/clients/`.
