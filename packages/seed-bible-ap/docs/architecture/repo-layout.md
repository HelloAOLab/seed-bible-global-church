# Repository layout for `packages/seed-bible-ap`

Everything the rebuild needs lives under this one folder (see [`AGENTS.md`](../../AGENTS.md) for the scope rule). It is one pnpm workspace package, `@seed-bible/ap`, holding five Cloudflare Workers under `apps/`, shared code under `lib/`, operator scripts, estate facts, tests, and docs.

Folders marked **keep** already exist and are grown in place. Folders marked **new** are created by the implementation. Each app and each `lib/` module gets a short `README.md` saying what it is and what it must never import.

## Tree

```text
packages/seed-bible-ap/
├── AGENTS.md                        scope rule + pointers (keep)
├── README.md                        package front door (keep; rewrite as apps grow)
├── package.json                     the ONE workspace package; every script (keep)
├── tsconfig.json                    Workers + lib + scripts; paths @seed/* → lib/* (keep; extend)
├── vitest.config.ts                 unit + integration tests (new)
├── agentic.lock.json                pinned @agenticprimitives set (keep)
├── .gitignore                       .dev.vars*, .seed/, .wrangler/, dist/ (keep)
│
├── apps/
│   ├── reader-web/                  THE SEED BIBLE UI — Vite + Preact, deployed as a Worker with static assets
│   ├── reader-a2a/                  seed-reader.workspace — Hono + service-host; the only origin the browser sees
│   ├── reader-mcp/                  workspace tools — HTTP + MCP JSON-RPC, called only by reader-a2a
│   ├── seed-bible-a2a/              seed-bible.svc — serving plane agent (Seed registry, files, caches)   (new)
│   └── seed-bible-mcp/              seed-bible.svc tools                                                  (new)
│
├── lib/                             shared TypeScript, no Worker/DOM assumptions unless the folder says so (new)
│   ├── seed-schema/                 zod schemas for every seed: record; mirrors ~/skills/ontology/seed.ttl
│   ├── seed-protocol/               wire contracts: harness plans, session ops, room state, SSE events, join card
│   ├── scripture/                   books/chapters/verse counts, reference parsing, reading URL paths (pure)
│   ├── a2a-client/                  minimal A2A client (SendMessage, SendStreamingMessage, SubscribeToTask)
│   └── library-client/              Library JSON-LD artifact shapes + paths under seed-bible/<collection>/
│
├── estate/                          public facts only — names, Smart Agent addresses, endpoints, contracts
│   ├── faithnet.ts                  town + estate rows (keep)
│   ├── faithchain.json              chain deployment facts (keep)
│   ├── seed-reader.faithnet.json    seedreader.me + seed-reader.workspace (keep)
│   ├── seed-bible-svc.faithnet.json seed-bible.svc card facts (new)
│   ├── seed-reader-org.faithnet.json seed-reader.org governing org (new)
│   └── client.seed-bible-reader.json Home client registration facts: redirects, delegation templates (new)
│
├── scripts/                         operator + dev tooling (Node, run from this folder)
│   ├── dev.sh                       starts all five Workers + web (keep; extend)
│   ├── smoke.ts                     in-process triad proof (keep; extend)
│   ├── seed-reader.mjs              writes apps/reader-a2a/.dev.vars (keep)
│   ├── home-roster.mjs / home-roster-rebuild.mjs (keep)
│   ├── charter-services.mjs         seed-reader.org + seed-reader.workspace + seed-bible.svc via Home Ask (new)
│   ├── buy-names.mjs                priced names (.workspace 4, .svc 10, .org) from seedreader's treasury (new)
│   ├── register-client.mjs          seed-bible-reader client deltas at www.faithnet.me (new)
│   ├── pin-skills.mjs               skill:seed/* digests from the ~/skills corpus → reader-a2a/src/pins (new)
│   ├── port-locales.mjs             copies the 77 locale JSON files from packages/seed-bible (read-only) (new)
│   └── smoke/                       per-layer smokes: vault.ts, session.ts (two devices), svc.ts, visitor.ts (new)
│
├── test/                            vitest; mirrors apps/ and lib/ (new)
│   ├── unit/
│   │   ├── lib/
│   │   ├── reader-web/
│   │   ├── reader-a2a/
│   │   ├── reader-mcp/
│   │   └── seed-bible-a2a/
│   ├── integration/                 triad in-process; two-device session; svc registry round-trip
│   └── helpers/                     waitForCondition, fake Home JWKS, fake person-agent A2A
│
├── docs/
│   ├── architecture/                this folder (keep)
│   ├── adr/                         decisions local to this package (new)
│   ├── runbooks/                    mint, charter, buy names, register client, deploy, rotate marker (new)
│   └── porting/                     per-manager porting notes: CasualOS call → ReaderBackend method (new)
│
└── .seed/                           gitignored; custodian key, local readers (keep)
```

## `apps/reader-web/` — the Seed Bible UI

```text
apps/reader-web/
├── index.html                       (keep)
├── vite.config.ts                   port 5185, /a2a proxy, tsconfig paths, PWA plugin (keep; extend)
├── wrangler.toml                    static assets + worker/ for SSR (keep; extend)
├── tsconfig.json                    (keep; add paths)
├── .env.faithnet                    VITE_A2A_BASE, VITE_CONNECT_DELEGATE (keep)
├── public/                          manifest.webmanifest, icons, robots.txt (new)
├── worker/                          Worker entry when deployed
│   ├── index.ts                     assets + SSR render + sitemap + /a2a passthrough (prod)
│   └── ssr.ts                       preact-render-to-string with the injected JSON seed
└── src/
    ├── main.tsx                     client entry + hydration (keep)
    ├── entry-server.tsx             SSR entry (new)
    ├── App.tsx                      shell: routes, pane layout, modal host (keep; replace hello page)
    ├── session.ts                   @agenticprimitives/connect-client, three sign-in lanes (keep)
    ├── api.ts                       grows into backend/ (keep)
    ├── backend/                     THE ONLY NETWORK CODE in the UI
    │   ├── ReaderBackend.ts         interface every manager depends on
    │   ├── a2a.ts                   harness ask, run progress SSE, task subscribe (reader-a2a origin only)
    │   ├── room.ts                  Agents SDK client for /agents/reading-session/<id>
    │   ├── bible.ts                 FreeUseBibleAPI (browser → API, unchanged)
    │   ├── search.ts                Typesense
    │   ├── offline/                 IndexedDB caches: translations, record cache, reading history
    │   └── dev.ts                   in-memory backend for tests and storybook-style pages
    ├── state/                       @preact/signals managers, one folder per domain; no CasualOS
    │   ├── reading/                 BibleReading, Tabs, TabsLayout, Panes, BibleSelector, Navigation
    │   ├── records/                 Highlights, Annotations, Bookmarks, Saves, ReadingPosition, ReadingHistory
    │   ├── social/                  Profile, Friends, Invitations, Today, Discover, Gallery, Share
    │   ├── sessions/                LiveSession (room state), Chat (topic mirror), Presence, Huddle
    │   ├── library/                 Customizations, VariantSelections, Playlists, ReadingPlans, Files
    │   ├── chrome/                  Settings, Theme, Modal, Onboarding, Tutorial, Features, EmbedMode
    │   ├── media/                   AudioPlayback, TextToSpeech, Search
    │   ├── extensions/              ExtensionManager host, ExtensionSettings, intent bus
    │   └── index.ts                 SeedBibleState wiring (replaces SeedBibleStateManager + init.tsx)
    ├── components/                  Preact components, same folder-per-component shape as today
    │   ├── reader/                  BibleReader, Toolbar, QuickToolbar, ContextMenu, Tabs, PaneLayout, …
    │   ├── records/                 Bookmarks, ScriptureNote, TipTapEditor, CreateAnnotationForm, ColorPicker
    │   ├── social/                  TodayPane, FriendsPane, ProfilePane, DiscoverPane, ShareModal, Avatar
    │   ├── sessions/                SessionParticipants, SessionQRCode, ChatView, PresenceCursors
    │   ├── library/                 Playlist*, ReadingPlans*, CustomizationEditPane, PhotoChooser, HeroImageField
    │   ├── chrome/                  SettingsPage, Onboarding, Tutorial*, ModalHost, ToastHost, legal modals
    │   ├── shared/                  Spinner, Skeleton, Tooltip, SearchableSelect, ExpandableText, icons
    │   └── hooks/                   useClickOutside, useDragReorder, useOverlayDismiss, …
    ├── extensions/                  ported extensions as INTENT EMITTERS (no keys, no fetch to third parties)
    │   ├── host/                    registerExtension, context, lifecycle (replaces packages/seed-bible ExtensionManager API)
    │   ├── apologist/  audio-reader/  bonfire/  compare/  default-content/  locations/
    │   ├── mcp/  references/  theographic/  transcript/  transcript-ui/  twitch-pub/  twitch-sub/
    │   ├── scripture-map/           2D grid + heatmap (ported from packages/scripture-map)
    │   └── example/                 template
    ├── i18n/                        I18n manager + 77 locale JSON files (copied by scripts/port-locales.mjs)
    ├── styles/                      main.css, theme variables (single source — no ThemeManager duplicate)
    ├── sw/                          service worker: app shell, translation cache
    └── routes/                      ReadingUrlPath, SharedPagePath, StaticPagePath adapters over lib/scripture
```

Rules: `state/` imports only `backend/ReaderBackend.ts` for I/O; `components/` import `state/` and `lib/`; nothing imports `@casual-simulation/*` or `packages/seed-bible/**`.

## `apps/reader-a2a/` — `seed-reader.workspace`

```text
apps/reader-a2a/
├── wrangler.toml                    RUNS DO, ROOMS DO (ReadingSessionDO), MCP + PLATFORM bindings, streaming (keep; extend)
├── .dev.vars                        gitignored
└── src/
    ├── worker.ts  index.ts  host.ts  session.ts     (keep)
    ├── card.ts                      agent card, capabilities.streaming = true (new)
    ├── routes/                      Hono routers, one file each
    │   ├── harness.ts               /harness/ask|runs|progress (SSE)
    │   ├── a2a.ts                   /api/a2a standard surface
    │   ├── rooms.ts                 /agents/reading-session/* (Agents SDK routing) + join
    │   ├── me.ts  hello.ts  dev.ts  (keep)
    │   └── platform.ts              thin HTTP lane to seed-bible.svc only where harness is the wrong shape
    ├── skills/                      one module per workspace skill the planner can choose
    │   ├── hello-reader.ts          (keep)
    │   ├── ask-person.ts            seed.workspace.ask.person — forwards a plan over the ask-as-me wire
    │   ├── ask-org.ts               seed.workspace.ask.org — steward session path
    │   ├── discover.ts              seed.workspace.discover — svc registry by passage
    │   ├── session-host.ts          seed.workspace.session.host / .relay
    │   └── proxy.ts                 seed.workspace.proxy — secret.use + forward, never returns the secret
    ├── planner/                     multi-skill planner over pinned SKILL.md digests
    ├── pins/skills.json             skill:seed/* → digest (written by scripts/pin-skills.mjs)
    ├── wires/                       ask-as-me wire storage/verification, delegation mandate checks
    ├── standing/                    derive {actor, standing} at a scope: conversation, org, circle, invitation
    ├── rooms/                       ReadingSessionDO (Agents SDK Agent): state, reducer, roles, op log, deadlines
    │   ├── ReadingSessionDO.ts
    │   ├── document.ts              session document type + validateStateChange
    │   ├── reducer.ts               ops → state, seq
    │   ├── seats.ts                 agent seats: message/send with deadline alarm
    │   └── record.ts                queue → seed:ReadingSession + per-person records via ask-as-me
    └── clients/                     outbound only
        ├── mcp.ts                   reader-mcp (binding or MCP_URL)
        ├── platform.ts              seed-bible-a2a (binding or PLATFORM_URL)
        ├── person-agent.ts          a2a.faithnet.io/harness/ask as the person (wire)
        ├── org-agent.ts
        └── home.ts                  JWKS, client registry facts
```

## `apps/reader-mcp/` — workspace tools

```text
apps/reader-mcp/
├── wrangler.toml                    (keep)
└── src/
    ├── index.ts                     /health, /tools/<name>, /mcp (keep)
    ├── registry.ts                  tool table for tools/list + /tools routing (new)
    ├── vault/                       Library client as the reader: file.save/get/list/delete, access.set, publish
    └── tools/                       one file per tool, zod-validated input/output
        ├── hello.ts                 (keep)
        ├── vault-get.ts  vault-put.ts  vault-delete.ts  vault-list.ts
        ├── highlights.ts  annotations.ts  bookmarks.ts  saves.ts  reading-position.ts  reading-history.ts
        ├── settings.ts  profile.ts  extension-prefs.ts  plan-progress.ts  variant-selections.ts
        ├── secrets.ts               secret.put / secret.use (never returns the value)
        └── link-preview.ts
```

## `apps/seed-bible-a2a/` and `apps/seed-bible-mcp/` — `seed-bible.svc` (serving plane)

```text
apps/seed-bible-a2a/
├── wrangler.toml                    D1 (seed registry), R2 (public files), Queues (record path), optional ROOMS host
├── migrations/                      D1 SQL: registry, passages index, files catalog, preview cache
└── src/
    ├── worker.ts  index.ts  host.ts  card.ts (streaming: true)
    ├── skills/                      seed.svc.registry.query / .reindex, seed.svc.files.put / .get, seed.svc.preview.get
    ├── registry/                    crawl public shelves (library.public.list/read), verify releases, index JSON-LD by scr:Passage
    ├── files/                       R2 put/get, catalog rows
    └── clients/                     mcp (seed-bible-mcp), library public reads

apps/seed-bible-mcp/
├── wrangler.toml
└── src/
    ├── index.ts
    ├── registry.ts
    └── tools/                       registry.*, files.*, preview.*, cache.*
```

Not the record. Everything here can be dropped and rebuilt from Libraries and shelves (ADR-0055).

## `lib/` — shared code

| Module                | Contents                                                                                                                                                                                                                           | May import                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `lib/seed-schema/`    | zod schema per `seed:` class (`Highlight`, `Annotation`, `ReadingEvent`, `Offering`, `ReadingSession`, …) with `@type`/`@context` for Library JSON-LD; generated field list checked against `~/skills/ontology/seed.ttl` by a test | zod                            |
| `lib/seed-protocol/`  | harness plan shapes, `SessionOp`, `SessionDocument`, SSE event types, join card, `ContextRefV1 {kind:'scr:Passage'}` helper                                                                                                        | seed-schema                    |
| `lib/scripture/`      | `bookChapterVerseCounts`, `parseVerseReference`, `verseReferenceBounds`, `ReadingUrlPath`, translation grouping (pure ports from `packages/seed-bible/seed-bible/managers/*.ts`)                                                   | —                              |
| `lib/a2a-client/`     | `sendMessage`, `sendStreamingMessage`, `subscribeToTask` over fetch + SSE                                                                                                                                                          | `@agenticprimitives/a2a` types |
| `lib/library-client/` | collection paths `seed-bible/<collection>/<id>.jsonld`, artifact envelope, `library.*` call shapes                                                                                                                                 | seed-schema                    |

Imported as `@seed/seed-schema`, `@seed/scripture`, … via `tsconfig.json` `paths`. Vite gets the same aliases in `vite.config.ts`; Wrangler/esbuild reads `paths` directly.

## `docs/`

- `architecture/` — this set (`overview`, `agents-and-skills`, `ontology`, `seed.ttl`, `feature-map`, `realtime-collaboration`, `repo-layout`, `reader-web-shell`).
- `adr/` — `0001-only-this-folder-changes.md`, `0002-single-workspace-package.md`, `0003-browser-talks-only-to-reader-a2a.md`, `0004-vault-is-the-record.md`, then one per later decision.
- `runbooks/` — `mint-person.md`, `charter-services.md`, `buy-names.md`, `register-client.md`, `deploy-faithnet.md`, `rotate-internal-marker.md`, `rebuild-serving-plane.md`.
- `porting/` — one file per current manager: the CasualOS calls it made, the `ReaderBackend` methods that replace them, the skill each maps to, and what was dropped (with the reason).

## Build order against this tree

| Plan step             | Folders it fills                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estate and custody    | `estate/*.json`, `scripts/charter-services.mjs`, `buy-names.mjs`, `register-client.mjs`, `docs/runbooks/`                                                                 |
| Skills + vault        | `lib/seed-schema`, `lib/library-client`, `reader-mcp/src/vault`, `reader-mcp/src/tools`, `reader-a2a/src/{skills,planner,pins,wires}`, `scripts/pin-skills.mjs`           |
| Serving plane         | `apps/seed-bible-a2a`, `apps/seed-bible-mcp`, `reader-a2a/src/clients/platform.ts`                                                                                        |
| Core reading          | `reader-web/src/{backend,state/reading,state/records,components/reader,components/records,i18n,styles,routes}`, `lib/scripture`                                           |
| Social                | `reader-web/src/{state/social,components/social}`, `reader-a2a/src/skills/discover.ts`, `seed-bible-a2a/src/registry`                                                     |
| Live sessions         | `reader-a2a/src/{rooms,standing,routes/rooms.ts}`, `reader-web/src/{backend/room.ts,state/sessions,components/sessions}`, `lib/seed-protocol`, `scripts/smoke/session.ts` |
| Church and library    | `reader-web/src/{state/library,components/library}`, `seed-bible-a2a/src/files`                                                                                           |
| Extensions, proxy, AI | `reader-web/src/extensions/*`, `reader-a2a/src/skills/proxy.ts`, `reader-mcp/src/tools/secrets.ts`                                                                        |
| Cutover               | `reader-web/{public,worker,src/sw}`, `scripts/port-locales.mjs`, `test/integration`                                                                                       |
