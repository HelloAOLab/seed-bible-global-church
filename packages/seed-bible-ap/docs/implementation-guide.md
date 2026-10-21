# Implementation guide — handoff for the developer building this

You are growing the hello-world triad in `packages/seed-bible-ap` into the full Seed Bible on the agenticprimitives substrate. This page tells you what to read, what you may touch, the order to build in, and what "done" means for each step. The architecture documents are the spec; this page is the work order.

## 0. Read first, in this order (about an hour)

1. [`AGENTS.md`](../AGENTS.md) — the scope rule. Only this folder changes in this repository.
2. [`docs/architecture/overview.md`](./architecture/overview.md) — four scales, the triad, the locked Home (faithnet.me only).
3. [`docs/architecture/agents-and-skills.md`](./architecture/agents-and-skills.md) — who acts: person agent, org agent, workspace, service; how "as the person" really works (ask-as-me wire).
4. [`docs/architecture/hard-problems.md`](./architecture/hard-problems.md) — the 18 difficult parts. Read all of it before writing any code; §1–§5 and §8–§10 shape the first weeks.
5. [`docs/architecture/realtime-collaboration.md`](./architecture/realtime-collaboration.md) — live sessions and integrations.
6. [`docs/architecture/repo-layout.md`](./architecture/repo-layout.md) — where every file goes.
7. [`docs/architecture/feature-map.md`](./architecture/feature-map.md) and [`ontology.md`](./architecture/ontology.md) / [`seed.ttl.md`](./architecture/seed.ttl.md) — feature coverage and record shapes.
8. Reference code (read-only): `packages/seed-bible/seed-bible/managers/` (what you are porting), `~/ap-home/apps/agent-runtime/src/{library-tools.ts,huddle-room-do.ts,interactions-do.ts,discussion-skill.ts}`, `~/pokernight/apps/tables` and `docs/{DESIGN,HOLDEM-COACH,WORKSPACES}.md`, `~/agenticprimitives/packages/{a2a,service-host}`.

## 1. Rules you do not get to bend

- **Only `packages/seed-bible-ap/` changes** in this repository. Root `pnpm-lock.yaml` may change only via `pnpm install`. Never edit `packages/seed-bible`, `packages/*-extension`, `patterns/`, root configs, `.github/`, `.cursor/`, `CLAUDE.md`. If you believe you need to, stop and raise it; do not do it.
- **One workspace package.** No nested `package.json` files. Shared code is `lib/*` behind `@seed/*` tsconfig paths (and matching Vite aliases).
- **Never import** `@casual-simulation/*` or anything from `packages/seed-bible/**`. Port by copying into this folder and rewriting against `ReaderBackend`.
- **The browser talks to one origin: reader-a2a.** No MCP, no `seed-bible.svc`, no agent card, no third-party API with a key from `reader-web`. Bible text (FreeUseBibleAPI) and Typesense search are the only exceptions, as today.
- **Acts are `skill:seed/*` skills** on the person agent (`.me`) or org agent (`.org`/`.church`/`.circle`), planned by `seed-reader.workspace` by **pinned digest**. reader-a2a never writes a person's record itself.
- **The vault (Library) is the record.** Anything in a Durable Object, D1, or R2 must be rebuildable; prove it with `scripts/smoke/rebuild.ts` before calling the serving plane done.
- **No key in source.** `.seed/`, `.dev.vars*`, `.wrangler/` stay gitignored. The Workers hold `A2A_INTERNAL_MARKER`, never a custody key. No WebSocket token in a URL; no session material in `localStorage`.
- **Translations:** this package owns copies of the 77 locale files. Add keys to `en.json` only; leave the rest to translators.
- **Skills and ontology live in `~/skills`** (domain `seed`), not here. Here you keep `pins/skills.json`, `lib/seed-schema`, and the tool implementations.

## 2. Environment

```bash
# this repo
pnpm install                       # from repo root; pnpm v10+
cd packages/seed-bible-ap
pnpm seed:reader                   # once; writes apps/reader-a2a/.dev.vars (dev reader, marker)
pnpm dev                           # mcp :8890, a2a :8891, web :5185
pnpm smoke && pnpm typecheck       # must stay green at every step
```

You also need, cloned beside this repo: `~/skills` (the skills corpus: `scripts/preflight.py`, `scripts/sync_ontology.py`, `scripts/register-<domain>.mjs`), `~/ap-home` (read-only reference; the estate operator runs its scripts), `~/pokernight` (reference). Live faithnet access (Home sign-in at `www.faithnet.me`, Wrangler on the town's Cloudflare account, seedreader's custodian key in `.seed/`) comes from the estate operator; ask before step 1 of the build order, because steps 1 and 2 need it.

Add to this package's `package.json` as you go (never to root): `vitest`, `agents` (Cloudflare Agents SDK), `zod` (use `catalog:`), `@tiptap/*` (use `catalog:`), `i18next` (use `catalog:`), `preact-iso`, `preact-render-to-string`, `idb`.

## 3. Build order and definition of done

Work the steps in order; each has a verification you run before moving on. Keep `packages/seed-bible` deploying to seedbible.org untouched throughout.

### Step 0 — Scaffold (plan todo `repo-layout`)

Create the folders in `repo-layout.md`; add `tsconfig.json` `paths` (`@seed/*` → `lib/*`) and Vite aliases; add `vitest.config.ts`; make `pnpm test` run (one trivial test in `test/unit/lib`). Copy locale files with `scripts/port-locales.mjs`.
**Done when:** `pnpm typecheck`, `pnpm test`, `pnpm smoke`, `pnpm dev` all pass with the hello page still working.

### Step 1 — Estate and custody (`estate-custody`)

Charter `seed-reader.org` (governing org), re-attach `seed-reader.workspace` through `workspace-create`, charter `seed-bible.svc` — all through `seedreader.me`'s Ask at `www.faithnet.me` (`scripts/charter-services.mjs`, modelled on verifiable-content-demo and ap-home `charter-service-agent.mts`). Buy the priced names. Register the `seed-bible-reader` client deltas: `allowed_delegation_templates: ['site-login','ask-as-me']`, `ask_with_login: true`, `libraryFolders: ['seed-bible']`, redirect URIs (`scripts/register-client.mjs`; the Home side is an operator PR in ap-home). Write `estate/*.json` facts and `docs/runbooks/*`.
**Done when:** signing in on `localhost:5185` with a faithnet account yields an id_token **and** an ask-as-me delegation; `A2A_AGENT_SA` is set for both agents; `estate/` has no secrets.

### Step 2 — `~/skills` seed domain + vault path (`seed-ontology`, `grow-reader-mcp`, `grow-reader-a2a`)

In `~/skills`: promote `specs/seed/seed.ttl.md` → `ontology/seed.ttl` (+ `.clusters.ttl`, `.cq.ttl`, `.data.ttl`), register the domain in `scripts/preflight.py DOMAINS` and `scripts/sync_ontology.py CONTEXTS`, add archetypes `seed-reader` / `seed-publisher` / `seed-workspace`, write the first SKILL.md folders (`skills/seed/hello`, `highlight-put`, `annotation-put`, `bookmark-put`, `reading-position-set`, `bucket-merge`, `publish-slice`), run preflight, publish, record digests. Here: `scripts/pin-skills.mjs` → `apps/reader-a2a/src/pins/skills.json`; `lib/seed-schema` (zod per class; test checks fields against the TTL); `lib/library-client` with the **chapter-bucket + manifest** layout from hard-problems §1; reader-a2a `wires/` + `skills/ask-person.ts` forwarding a `library.file.save` plan over the ask-as-me wire; reader-mcp `vault/` + domain tools.
**Done when:** `scripts/smoke/vault.ts` — as the dev reader, put a highlight in John 3, read the bucket back from the Library, re-put with the same `opId` and see no new version. The skill-skew test passes.

### Step 3 — Serving plane (`platform-apps`)

`apps/seed-bible-a2a` + `apps/seed-bible-mcp` (service-host, Hono, D1 migrations, R2), card `streaming: true`; `registry/` crawl of public shelves with release verification and tombstones (hard-problems §12); `PLATFORM` binding on reader-a2a; `dev.sh` and `deploy:faithnet` extended.
**Done when:** `scripts/smoke/svc.ts` publishes a `seed:Offering` from a test org shelf, the registry indexes it by passage, un-publishing removes it; `scripts/smoke/rebuild.ts` wipes D1/R2 and re-indexes to the same rows.

### Step 4 — Core reading in reader-web (`core-reader`)

`backend/ReaderBackend.ts` + `a2a.ts` + `offline/` (IDB read model, outbox, coalesced flush — hard-problems §1–§3) + `dev.ts` (in-memory backend). Port `state/reading`, `state/records`, `components/reader`, `components/records`, `i18n`, `styles`, `routes`, SSR `worker/`. Replace the hello page.
**Done when:** chapter reading, translations, tabs/panes, highlights, notes (TipTap), bookmarks, saves, position, search, audio/TTS, settings, theme, 77 locales all work against the dev backend **and** against faithnet; offline → online flush produces one run per bucket; two devices editing one chapter merge at item level; a note edited on both sides shows the conflict UI.

### Step 5 — Social (`social`)

Profile, friends (Home contacts / `.circle`), invitations, Today (public slices via registry; circle copies for friends-only — §4), Discover, gallery, share links. First-run consent ceremony (§5) and device adoption (§6).
**Done when:** a brand-new faithnet person signs in, completes consent in the UI's flow, and their first highlight lands in their Library; a published note appears in a friend's Today within one crawl; a circle-shared note is visible to members and 404 to the world.

### Step 6 — Live sessions (`live-sessions`)

`ReadingSessionDO` (Agents SDK `Agent`) on reader-a2a at `/agents/reading-session/<id>`; `standing/` derivation; `session.start`/`join` harness acts returning a one-time token; state split per hard-problems §8; agent seats via `message/send` + deadline; chat mirrored from the InteractionsDO topic with `scr:Passage` context refs; huddle dock; SSE/long-poll fallback on the op log. Client `backend/room.ts`, `state/sessions`, `components/sessions`.
**Done when:** `scripts/smoke/session.ts` — two browsers, one leader: follow, decoration, chat round-trip < 500 ms; late joiner gets the snapshot; a stranger gets 404; wipe the DO and the `seed:ReadingSession` record still exists in the host's Library.

### Step 7 — Church and library (`church-library`)

Customizations, playlists, reading plans as `.church`/`.org`/person Library documents (`library.file.save` → `library.file.visibility` public → `library.file.publish`); org acts from a steward in the UI via `seed.workspace.ask.org` (§11); files on R2; link previews on svc.
**Done when:** a steward edits a customization in the UI and it appears for a reader who selected it; a public playlist is in Discover; a plan's progress is private in the reader's Library.

### Step 8 — Extensions, proxy, AI (`extensions-proxy`)

Port extensions into `reader-web/src/extensions/<name>/` as intent emitters. Apologist/theographic/default-content → org offerings; Bonfire → study companion over A2A with streamed `/harness/ask` (§9); external MCP → person-agent connector; compare/references/locations/audio stay local. **Twitch and transcripts last** — they wait on the outbound-allowlist decision (§10); do not ship a browser-held key as a stopgap.
**Done when:** each extension row in `feature-map.md` is checked off with the path it uses; Bonfire streams progress to the panel and names whose answer it is.

### Step 9 — Cutover readiness (`cutover`)

PWA/service worker, onboarding, embed mode, Your Content, Scripture Map, sitemap/OG, `test/integration` green, runbooks complete. Do not turn off CasualOS; cutover is a separate decision.

Federation visitors (plan step 8) are **not** in this work order; keep the `standing/` seam open for them.

## 4. Working conventions

- **Tests** follow repo `CLAUDE.md`: observable behavior, mock only at the boundary (Home JWKS, person-agent A2A, Library), poll conditions instead of sleeping, regression tests go red on the pre-fix code. Fakes live in `test/helpers/`.
- **Docs are part of the change.** When a step lands: tick the rows in `feature-map.md`; turn the relevant `hard-problems.md` entry into an ADR under `docs/adr/` and shorten the entry to a pointer; add a `docs/porting/<Manager>.md` note for each manager ported; copy changed architecture docs to `~/skills/specs/seed/`.
- **Commits:** one step or sub-step per PR; title with the plan todo id (`[core-reader] highlights bucket + outbox`). Prettier settings are the repo's (2-space, double quotes, trailing commas).
- **Comments** only for the non-obvious why. No narrating the task.
- **Deploy** with `pnpm deploy:faithnet` only after the step's smoke passes locally and against faithnet.

## 5. Open questions to raise early (not to decide alone)

These need the estate operator or an ap-home change; ask in week one so answers arrive before you need them:

1. Read lane for the reader's own buckets: `library.file.read` over the ask-as-me wire fast enough, or a vault read delegation for reader-mcp? (hard-problems §1a)
2. Will `library.file.visibility` grow an audience (contacts / circle)? If not, the circle-copy path ships. (§4)
3. Can the Home consent screen present the `seed-reader` archetype assignment in the same step as the ask-as-me wire? (§5)
4. Outbound-host allowlist for `seed.proxy.call` in the person's runtime. (§10)
5. Is a steward's routed ask admitted by an org harness for Library writes today? (§11)
6. Will person agents flip `streaming: true`? (§9)

## 6. What not to do

- Do not build a records API with markers/permissions in `seed-bible-mcp`. It is a serving plane.
- Do not put the session document in Yjs or make the DO the record.
- Do not call MCP, svc, or third-party APIs from the browser.
- Do not add a second Home or accept `impact-agent.me` tokens as native sessions.
- Do not edit anything outside `packages/seed-bible-ap/` in this repository.
