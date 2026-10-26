# Working in `packages/seed-bible-ap`

## Scope rule: only this folder changes

The Seed Bible rebuild on the agenticprimitives substrate lives **entirely under `packages/seed-bible-ap/`**. Nothing else in this repository is edited for it.

- Do not edit `packages/seed-bible`, `packages/*-extension`, `packages/scripture-map`, `packages/bible-stack`, `packages/house-of-the-lord`, `patterns/`, `obsolete/`, `script/`, root configs (`package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, ESLint, Prettier, Husky), `.github/`, `.cursor/`, or `CLAUDE.md`.
- Those folders are **read-only sources**: port code by copying it into this package and rewriting it against `ReaderBackend` (reader-a2a). Never import `@casual-simulation/*` or `packages/seed-bible/**` from here.
- The one unavoidable side effect is the root `pnpm-lock.yaml`, which pnpm regenerates when this package's `package.json` changes. That is the only file outside this folder a change here may touch, and only through `pnpm install`, never by hand.
- `~/skills` (the `seed` domain: `specs/seed/`, `skills/seed/`, `ontology/seed.ttl`) and the estate repos are **separate repositories**; this rule does not restrict them.

Consequence: this package stays **one pnpm workspace package** (`@seed-bible/ap`). Shared code between the apps lives in `lib/` and is imported through tsconfig path aliases (`@seed/*` → `lib/*`), not through nested workspace packages, because registering those would need a root `pnpm-workspace.yaml` edit.

## Layout

Start with [docs/implementation-guide.md](./docs/implementation-guide.md) (reading order, build order, definition of done per step). The folder structure and the purpose of every directory is in [docs/architecture/repo-layout.md](./docs/architecture/repo-layout.md). Add new code where that document says it goes; if a new folder is needed, add it there first.

## Rules carried from the architecture

- The browser talks only to reader-a2a's origin (ADR-0044). No MCP, no `seed-bible.svc`, no agent card fetch from reader-web.
- Acts are `skill:seed/*` skills on the **person agent** (`.me`) or **org agent** (`.org` / `.church` / `.circle`), verified against a live grant. `seed-reader.workspace` plans and relays; it never becomes the reader.
- The vault (Library JSON-LD under `seed-bible/<collection>/`) is the record. Durable Objects, D1, R2 on the serving plane are rebuildable.
- No private key in source. `.seed/`, `.dev.vars*`, `.wrangler/` stay gitignored.
- Translations: this package carries its own copies of the 77 locale files under `apps/reader-web/src/i18n/`; the repo-wide "only update en.json" convention applies to them too.
