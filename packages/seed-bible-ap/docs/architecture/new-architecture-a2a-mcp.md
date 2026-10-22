# Seed Bible Reader: New Architecture (A2A and MCP era)

As of 2026-10-22 · Richard Pedersen

> Exported from the Claude Doc written on 2026-10-22; keep both in step. Live, commentable copy: https://claude.ai/artifact/WgCcrXWeka2hqBseM8Kyrg

## What this document covers

This is the reference for the new reader in `packages/seed-bible-ap`, live at seed-reader.faithnet.io. It traces every path from the browser through the reader's agent to the other agents and the MCP tool servers, says what each store holds, and lists what the browser still reaches directly. It ends with a table that maps each piece of the old reader (see [Seed Bible Reader: Old Architecture (CasualOS era)](./old-architecture-casualos.md)) to where that piece lives now.

The new reader is a parallel build for testers. seedbible.org is untouched and no cutover is planned.

**Vocabulary used throughout**

| Term | Plain meaning here |
| --- | --- |
| A2A | Agent-to-agent protocol. An HTTP service with an agent card that other agents and apps call. The reader's backend is an A2A agent, not a REST API. |
| MCP | Model Context Protocol. A tool server that answers `tools/list` and `tools/call` over JSON-RPC. Agents call MCP tools; the browser never does. |
| Harness run | One request handled by an agent: it plans, calls tools, and returns a result with a run reference. Every ask to the reader agent is one harness run. |
| Home | The faithnet identity provider at www.faithnet.me. It signs people in, issues their id\_token, and hosts each person's own agent and Library. |
| Person agent | Each signed-in person has an agent of their own at the Home. It owns their Library (highlights, notes, bookmarks, works) and answers contact, friend and presence questions. |
| Library / vault | A person's own record store, held by their person agent. The vault is the system of record; anything else is a rebuildable copy. |
| Workspace agent | `seed-reader.workspace`, the reader's A2A agent (reader-a2a). It acts for a reader only with that reader's wire. |
| Wire (ask-as-me) | A signed delegation the Home mints at sign-in that lets the workspace agent ask the reader's person agent on their behalf. Stored on reader-a2a, scoped to the `seed-bible` Library folder. |
| Serving plane | `seed-bible.svc` (seed-bible-a2a): the public registry that crawls released offerings, indexes them by chapter, and serves files and link previews. Rebuildable from the vaults. |
| Estate / town / federation | Estate: faithnet (its Home, people, agents). Town: faithchain, chain 34348, where agent identities and names live. Federation: the wider set of towns. Writes stay inside these; everything outside is read-only. |
| Custodian | The key that controls an on-chain agent account. The demo reader `seedreader` custodies its own account and the workspace agent. |
| Offering / slice | A released, signed piece of a reader's or church's content (a note, playlist, plan, customization) that the registry lists for others to discover. |

## The big picture

The browser talks to one backend origin, the reader's workspace agent (reader-a2a). That agent never stores a reader's records itself. It asks the reader's own person agent at the Home to write them into the reader's Library, using the delegation (the wire) the Home minted at sign-in. A separate serving plane indexes what people have published and holds file copies, and everything in it can be rebuilt from the Libraries.

![new topology · 8 parts, one browser origin](./images/new-topology.png)

Read it top down: sign-in goes to the Home, verses and search go straight to the two read-only third parties, and everything the reader does goes down through reader-a2a. reader-a2a fans out to three places: the pure tool server (reader-mcp), the person's agent (the record), and the serving plane (the index). The serving plane crawls public shelves back out of the Libraries on a 15-minute cron.

| Part | Deployed as | Host | Owns |
| --- | --- | --- | --- |
| reader-web | Cloudflare Worker + static assets | seed-reader.faithnet.io (dev :5185) | The Preact UI, Home sign-in via connect-client, the edge render of /read/\* and /shared/\*, sitemap and robots, the PWA service worker, IndexedDB read model and outbox. Holds no key. |
| reader-a2a | Worker with Hono + service-host | seed-reader-a2a.faithnet.io (dev :8891) | The workspace agent `seed-reader.workspace`. The agent card, /api/a2a, /harness/\*, app routes. Verifies id\_tokens against the Home's JWKS. D1 table of wires. Durable Objects: the run object, the ReadingSession room, the BucketCache. Service bindings to reader-mcp and the serving plane. |
| reader-mcp | Worker, service-bound | workers.dev fallback (dev :8890) | Pure tools `hello` and `bucket_merge` on two lanes: POST /tools/\<name> for the agent and POST /mcp for any MCP client. No key, no state. |
| seed-bible-a2a | Worker with D1, R2, AI, cron | seed-bible-a2a.faithnet.io (dev :8892) | The serving plane `seed-bible.svc`: the registry of released offerings (D1 `seed-bible-svc`), public file bytes (R2 `seed-bible-files`), link previews, map tiles and places, Workers AI for the companion and transcription, a 15-minute crawl. Never the record. |
| seed-bible-mcp | Worker, service-bound | seed-bible-mcp.faithnet.io (dev :8893) | One pure tool, `offering_validate`, the check a shelf document passes before it is indexed. |
| Home | ap-home, not in this repo | www.faithnet.me | Sign-in, id\_tokens, delegations, the client registry, consent, Contacts and friends, the demo roster, one PresenceDO per person. |
| Person and org agents | ap-home runtime | a2a.faithnet.io | Every write to a Library is a harness run on the owner's agent under its own grant. Demo person `seedreader.me`, governing org `seed-reader.org`. |
| Library (vault) | Home vault | mcp.faithnet.io; public door edge.faithnet.io/api/a2a/\<name> | JSON-LD documents under `seed-bible/<collection>/`, access `public` or `private`, text cap 12,000 characters, public binary cap 1.4 MB. |
| faithchain | chain 34348 | names.faithnet.io, faithnet.town | Agent identities, names (priced roots), vault-key bindings. A listing there is a fact, never a grant. |

Deploy order from `pnpm deploy:faithnet` is reader-mcp, reader-a2a, seed-bible-mcp, seed-bible-a2a, then reader-web. All hosts are custom domains on the faithnet.io zone in the town's Cloudflare account.

## What the browser reaches directly

The browser reaches exactly four kinds of place on its own: the Home for sign-in, the Bible API for verse text, Typesense for search, and its own backend origin (reader-a2a) for everything else. It never calls the serving plane, reader-mcp, the person agent, or any map or geodata source directly. It carries no signing key; the id\_token lives in sessionStorage and is sent as a Bearer header.

| Destination | Calls | Why direct | Source |
| --- | --- | --- | --- |
| Home (www.faithnet.me) | `/token` (code exchange), `/connect/demo-signin` (Quick Connect), the authorize page in a popup or redirect, `/jwks` through connect-client | Sign-in has to be between the person and their Home; the app only receives the id\_token and the wire | `apps/reader-web/src/session.ts` |
| Bible API (bible.helloao.org) | `/api/...` for translations, books, chapters, `complete.json`; the cross-reference dataset `/api/d/open-cross-ref`; theographic data; chapter audio links | Public, read-only text. Kept browser-direct so the service worker can cache it and a signed-out reader can read offline. The private endpoint vmfnri.helloao.org is defined but unused | `src/backend/bible.ts`, `src/extensions/references`, `src/extensions/theographic` |
| Typesense (search.seedbible.org) | one GET to `/collections/bibleVerses.<lang>/documents/search` with a search-only key | The one documented third-party exception: read-only, key is search-scoped | `src/backend/search.ts`, `.env` |
| reader-a2a (seed-reader-a2a.faithnet.io, `/a2a` proxy in dev) | `/harness/ask` for every tool call; `/api/connect`, `/me`; `/api/public/read`; `/api/presence/beat` and `/api/presence/friends`; `/api/session/guest`; `/companion/ask` (SSE); `/api/transcribe`; `/api/tiles/*`, `/api/tiles-info`, `/api/places/:name`; a WebSocket to `/agents/reading-session/<id>?token=` | The single backend origin | `src/api.ts`, `src/backend/a2a.ts`, `src/backend/room.ts`, extension folders |
| Google Fonts | Roboto, Inter, Lora stylesheets | Fonts for text style and church customizations | `src/state/chrome/textStyle.ts`, `customizations.ts` |
| Twitch | player and chat as iframes only | Watch-only embed; nothing is posted | `src/extensions/twitch` |
| Google STUN | `stun:stun.l.google.com:19302` | Voice in a live session is a browser-to-browser WebRTC mesh signalled through the room | `src/state/sessions/voice.ts` |

**Never browser-direct, by design.** The serving plane (seed-bible-a2a) is reached only through reader-a2a, so the upload token and the AI binding never reach a page. OpenStreetMap tiles and OpenBible geometry are proxied and cached by the serving plane. The edge public door (edge.faithnet.io) is read by reader-a2a on the browser's behalf.

**Device-only state.** IndexedDB database `seed-bible-reader` has four stores: `buckets` (device copies of Library buckets, plus a stranger's marks held by the zero address), `outbox`, `chapters` (downloaded translations), and `prefs` (reading position, enabled extensions, toolbar layout, chosen customization, publish-as, contact and works caches, playlist history). localStorage holds `sbr.settings` and `sbr.language`. sessionStorage holds `sbr.session` (the id\_token and a wire flag) and the pending-connect marker. Reading position is device-only today; it has a `seed:ReadingPosition` class in the ontology but is not yet written to the Library.

**Edge render and service worker.** The reader-web Worker runs first for `/read/*`, `/shared/*`, `/sitemap.xml` and `/robots.txt`. It renders a chapter from the Bible API with title, description and Open Graph tags and a `window.__SB_SEED__` cache seed; a shared slice page reads its descriptor and markdown through reader-a2a's public read route. The service worker precaches boot chunks and caches the app shell, assets, Bible API responses (stale-while-revalidate), and font files. It never answers `/a2a/`, `/api/` or `/harness/`.

## Web to reader agent (reader-a2a)

Every action a signed-in reader takes becomes one harness run on reader-a2a: the browser posts a one-step plan naming a `seed.*` tool, the agent verifies who is asking, runs the tool, and returns the result with a run reference. A few things that need no act (presence, a public read, the companion, tiles) go to plain routes on the same origin.

**How the browser is identified.** The Home's id\_token is sent as a Bearer header, or as the `session` field of a harness body. reader-a2a decodes the issuer, accepts it only if it is a Home of a served estate (`ESTATE_IDS` is `faithnet`, so www.faithnet.me and its subdomains), fetches `<iss>/jwks`, and verifies ES256 with audience `seed-bible-reader`. The agent address is `canonical_agent_id` or `sub`. In local dev only, `DEV_STUB_SESSIONS=1` admits a `dev:<handle>` token from `DEV_READERS`; it is `0` when deployed. A dev reader has no Home and so no wire. Source: `apps/reader-a2a/src/session.ts`.

**The harness call.** `POST /harness/ask` with `{ session: <id_token>, message, plan: { steps: [{ id: "s1", toolId, args }] } }`. The reply's `results[0].result` is the tool's answer. Signed-out callers may only use `seed.workspace.discover`, `seed.workspace.preview` and `seed.hello`; every other tool refuses a public principal. The browser-side seam is `apps/reader-web/src/backend/ReaderBackend.ts`, with `backend/a2a.ts` as the live implementation and `backend/dev.ts` as the in-memory one for tests. Error codes the UI handles: signed-out, offline, refused, unavailable.

**Routes on reader-a2a**

| Route | Auth | What it does |
| --- | --- | --- |
| `GET /.well-known/agent-card.json`, `POST /api/a2a`, `ALL /harness/*` | id\_token as `session` | The service-host surface. The card advertises only `seed.hello`; the real tools are reached by a supplied plan. Each ask is one run on the `ReaderRunDO` Durable Object. |
| `POST /api/connect`, `DELETE /api/connect` | Bearer | Keep or drop the reader's ask-as-me wire. Checks the delegator is the reader, the delegate is this agent's asking key, and the shape is pinned to the skill `harness.ask`. Upserts D1 table `wires`. |
| `GET /me` | Bearer | The verified reader plus \`wire: true |
| `GET /api/public/read?shelf=&path=` | none | Reads a public Library document through the estate's public door at edge.faithnet.io. Used for Discover bodies and shared pages. |
| `POST /api/presence/beat`, `GET /api/presence/friends` | Bearer, forwarded as-is | Forwarded to the runtime's `/presence/*` under the reader's own token. No harness run, no act. Dev tokens refused. |
| `POST /companion/ask` | Bearer (401 otherwise) | Proxies to the serving plane's `/companion` with the shared upload token, streams the SSE answer back. |
| `POST /api/transcribe` | Bearer | Audio bytes to the serving plane's `/transcribe` (Whisper on Workers AI). |
| `GET /api/tiles/:z/:x/:y`, `/api/tiles-info`, `/api/places/:name` | none | Proxied to the serving plane's tile and places caches. |
| `POST /api/session/guest` | share code only | A guest seat in a live session without a Home. |
| `ALL /agents/*` | one-time token in the query | Routes the WebSocket to the `ReadingSession` Durable Object. |
| `POST /hello`, `GET /dev/readers`, `GET /health` | none | Hello-world lane, dev stub list, service facts. |

**Tools the browser asks for** (`apps/reader-a2a/src/skills/index.ts`)

| Tool | What it does | Where it goes |
| --- | --- | --- |
| `seed.bucket.read`, `seed.bucket.list` | Read one chapter bucket or a collection's manifest | Person agent `library.file.read`, cache-first for 10 minutes in the `BucketCache` DO |
| `seed.bucket.merge` | Merge a device's bucket into the Library (the outbox flush, one run per bucket) | Person agent read, merge in-process, `library.file.save` bucket then manifest |
| `seed.highlight.put`, `seed.annotation.put`, `seed.bookmark.put` | Single-mark puts, idempotent by `seed:opId` | Same vault path |
| `seed.publish.slice`, with `withdraw` | Release a note, playlist, plan, customization or profile to the owner's public shelf; withdraw sets it private | Person or org agent `library.file.save` public + `library.file.publish`; then nudges the registry crawl |
| `seed.workspace.discover` | Offerings for a chapter, or recent by owners | Serving plane `/registry/offerings`, `/registry/recent` |
| `seed.workspace.contacts`, `.friends`, `.orgs`, `.connectors` | Contacts, mutual friends, organizations the reader stewards, MCP connectors | Person agent tools `person.contact.list`, `person.friend.list`, `person.affiliations.list`, `mcp.connectors.list` |
| `seed.session.start`, `.join`, `.record` | Start a live session (record first, then room), join by share code, read the record | Person agent save of `seed:ReadingSession`; `ReadingSession` DO `/create` and `/invite` |
| `seed.work.save`, `.list`, `.read` | Playlists, plans, customizations, profile, file catalog as private JSON-LD documents | Person agent under `seed-bible/<folder>/` |
| `seed.file.put` | A picture into the Library (public) then a copy to the serving plane | Person agent `library.file.save` with bytes; `PUT /files/<owner>/<sha256>.<ext>` on the serving plane |
| `seed.workspace.preview` | Link preview | Serving plane `/preview?url=` |

**The one key in the system** is reader-a2a's `READER_ASK_PRIVATE_KEY`. Its public address is registered on the Home's `seed-bible-reader` client as `ask_delegate`. The page never holds a key; every Library write is performed by the reader's own agent under the wire the reader approved at sign-in, revocable at the Home under Connected assistants.

## Reader agent to other agents

reader-a2a owns no reader data. For every record it asks another agent: the reader's person agent for anything in the Library, an organization's agent when a steward publishes as their church, and the serving plane for the index. The rule that makes this safe is that a service-host only admits a wire whose delegator is the host agent itself, so reader-a2a cannot be handed the reader's wire and write as them. Instead it signs a `harness.ask` with its own asking key, attaches the wire, and the person's agent does the write under its own grant.

| From reader-a2a to | How it is reached | What is asked | Credential |
| --- | --- | --- | --- |
| The reader's person agent | `POST https://a2a.faithnet.io/harness/ask` with `addressee` = the reader and a supplied plan of `library.*` steps. Read-only plans run `background: true`, `rowsOnly: true` | `library.file.read`, `library.files.list`, `library.file.save` (JSON-LD, markdown, or `bytesB64`, with `accessPolicy` public or private), `library.file.visibility`, `library.file.publish`; and the person tools `person.contact.list`, `person.friend.list`, `person.affiliations.list`, `mcp.connectors.list` | The reader's ask-as-me wire from D1, wrapped with `READER_ASK_PRIVATE_KEY` (`clients/person-agent.ts`) |
| An organization's agent (a church) | Same call, `addressee` = the org's address | The same `library.*` steps so the slice lands on the org's shelf with `publishedBy` = the org | The steward's own wire; the runtime derives steward standing on chain. The separate ask-as-org wire is still an open question |
| The serving plane (seed-bible.svc) | Cloudflare service binding `PLATFORM` (`PLATFORM_URL` in dev) | `GET /registry/offerings`, `/registry/recent`, `POST /registry/crawl` nudge, `PUT /files/...`, `POST /companion`, `POST /transcribe`, `GET /preview`, `/tiles/*`, `/places/*` | Shared secret `PLATFORM_UPLOAD_TOKEN` (equals the svc's `UPLOAD_TOKEN`) for uploads and AI; none for reads |
| The public door | `https://edge.faithnet.io/api/a2a/<shelf>` | `library.public.read` of one public document | None |
| The runtime's presence objects | `${A2A_URL}/presence/beat`, `/presence/friends` | A beat for the chapter on screen; the friends' current places | The reader's own id\_token, forwarded unchanged |
| reader-mcp | Service binding `MCP` (`MCP_URL` in dev) | `/tools/hello`. The `bucket_merge` tool exists there but `seed.bucket.merge` calls the same merge function in-process | None |

**Which agents exist and what each owns**

| Agent | Type | Address | Owns |
| --- | --- | --- | --- |
| `seedreader.me` | person | 0xdbb41f…b3db | The demo reader's Library and treasury; custodies the workspace with the same key (salt 1). In the Home's demo roster for Quick Connect |
| `seed-reader.workspace` | workspace | 0x5DD5f3…d307F | reader-a2a's identity. Standalone, no governing organization paired yet |
| `seed-reader.org` | organization | 0x0D6f3D…cEA26 | The governing org; the demo church that publishes as itself. Steward link, vault key and the org-steward playbook were set on 2026-10-22 |
| `seed-bible.svc` | service | 0x8f627e…9333c | seed-bible-a2a's identity; its own vault key bound |

A person's agent offers Library reads only from an assigned playbook. Today that is the estate baseline `agentic-trust/person-steward`; the `seed-reader` archetype cannot replace it yet because five seed skills share the first tool id `library.file.read`. New Homes are born with the playbook; older people get it during the reader's sign-in ceremony through the Home's self-heal, or by hand with `scripts/assign-playbook.mjs`. The seed skills themselves live in the separate skills repository and are pinned here by digest in `apps/reader-a2a/src/pins/skills.json`.

**The serving plane's own agent surface.** seed-bible-a2a also exposes an agent card and two public tools, `seed.svc.registry.query` and `seed.svc.registry.reindex`, on its `SvcRunDO`. Its crawl talks to person and org agents only through the public door, with no credential, and only lists and reads.

## MCP servers and every store

The two MCP servers hold nothing. They are pure functions behind a JSON-RPC lane, and the data they operate on is passed in with each call. Everything persistent lives in one of seven stores, and only one of those, the person's Library, is the record.

**The MCP servers**

| Server | Tools | Lanes | State |
| --- | --- | --- | --- |
| reader-mcp | `hello`; `bucket_merge` (merge a current and an incoming bucket for highlights, annotations, bookmarks or saves, same rule as the Library path) | `POST /tools/<name>`; `POST /mcp` with `initialize` (protocol 2025-06-18), `ping`, `tools/list`, `tools/call`; `GET /health` | None. No key, no bindings, one var `WORKSPACE_NAME` |
| seed-bible-mcp | `offering_validate` (parse a `seed:Offering`, check `publishedBy` equals the shelf owner, return the chapter, kind, title and id it indexes under) | Same two lanes plus `/health` | None. The crawl currently validates in-process with the same schema rather than calling this worker |

**What is stored where**

| Store | What is in it | Written by | Read by | Rebuildable from |
| --- | --- | --- | --- | --- |
| Person or org Library (the vault, at the Home) | Buckets `seed-bible/<collection>/<BOOK>/<ch>.jsonld` for highlights, annotations and history; single buckets `bookmarks.jsonld`, `saves.jsonld`, `progress.jsonld`; a `_manifest.jsonld` per collection; works under `playlists/`, `plans/`, `customizations/`, `profile/`, `files/`; pictures as public documents `files/<sha256>.<ext>`; released slices under `public/<kind>/<slug>.jsonld` plus `.md`; `sessions/<id>.jsonld` | The owner's own agent, asked over the wire by reader-a2a | reader-a2a as the reader; the serving plane and `/api/public/read` through the public door, public files only | It is the record |
| reader-a2a D1 `seed-reader-a2a` | Table `wires` (reader, wire\_json, connected\_at): one ask-as-me delegation per reader | `POST` and `DELETE /api/connect` | Every act tool | A new sign-in |
| reader-a2a Durable Objects | `ReaderRunDO`: harness run checkpoints and records. `ReadingSession`: synced state (host, leader, passage, participants, decorations, guests, sequence, record ref) and SQLite tables `invites`, `ops`, `chat`, `codes`. `BucketCache`: last bucket text per reader, keyed folder/name | Runs; session tools and room callables; vault reads and saves | The harness; room clients over WebSocket; vault reads | Runs are audit only. A session rebuilds from the Library's `seed:ReadingSession` record (chat and ops are lost). BucketCache expires and is re-read |
| Serving plane D1 `seed-bible-svc` | `shelves` (name, endpoint, kind, registered\_at): configuration, seeded with `seedreader.me` and `seed-reader.org`. `offerings` (owner, entry\_id, shelf, version, release\_id, release\_signed, passage, passage\_ref, kind, title, descriptor\_id, descriptor\_json, markdown\_path, indexed\_at, withdrawn\_at). `crawl_log` | The 15-minute cron, `POST /registry/crawl`, `/admin/reindex` | `/registry/*`, `seed.svc.registry.query` | `offerings` and `crawl_log` from the public shelves (`/admin/wipe` then reindex). `shelves` is configuration |
| Serving plane R2 `seed-bible-files` | `<owner>/<sha256>.<ext>` picture bytes, immutable cache headers, 5 MB cap | `PUT /files/*` from `seed.file.put`; the crawl's refill | `GET /files/*` by anyone | The Library's public `seed-bible/files` documents |
| Serving plane edge cache | Link previews (one day), tiles (one week, zoom 12 and under), places geometry; reader-web's sitemap (one day) | Each route on first miss | Same routes | Upstream |
| Device IndexedDB `seed-bible-reader` | `buckets`, `outbox`, `chapters`, `prefs` (see the browser section) | The state layer through `ReaderStores` | State, extension host, outbox | Buckets and prefs from the Library and Bible API. The outbox and any unsigned-in marks are not rebuildable until flushed |
| Device localStorage and sessionStorage | `sbr.settings`, `sbr.language`; `sbr.session`, `sbr.connect.pending` | Settings, i18n, session modules | Same | Re-choose; re-sign-in |
| The Home | id\_token issuance and JWKS; the wire under Connected assistants; one `PresenceDO` per person (beats lapse in 90 s); contacts, friends, affiliations; MCP connectors; the demo roster; the Library itself | The Home and the person's agent; beats forwarded by reader-a2a | reader-a2a for verification, presence, contacts, friends, orgs, connectors | Outside this repo; the reader only reads it and forwards beats |

**Bucket and merge rules** (`lib/library-client/index.ts`). A bucket is one JSON-LD document with a `@graph` of items. A put with an `opId` already present changes nothing (replay-safe); the same `@id` replaces; otherwise it appends. A merge is keyed by `@id`: same opId keeps; a superseding edit wins (`seed:supersedes` names the opId it was made from); otherwise the newer `updatedAt` wins with ties to the incoming; two notes that differ and neither supersedes the other are kept side by side with `conflictOf`, and the notes pane's Keep this version settles it. Text cap per document is 12,000 characters. Manifests record each bucket's Library version, count and updated time and are the index and change feed, though the change feed is not consulted yet.

## End-to-end flows

Each flow below is traced hop by hop. The pattern repeats: the browser writes to IndexedDB first, the outbox flushes one merge run per bucket to reader-a2a, and reader-a2a asks the person's agent to write the Library. Anything shared goes through a public shelf and the registry.

**Sign in (Home lane)**

1. Account pane, Sign in with faithnet: the browser opens the Home's authorize page in a popup (PKCE), with a full-page redirect as the fallback, and asks for the `ask-as-me` delegation template.
2. The person approves the reader and the wire at the Home; the Home self-heals the person's playbook if it is missing.
3. The browser exchanges the code at the Home's `/token` and gets the id\_token and the delegation.
4. The browser posts the delegation to reader-a2a `/api/connect` with the id\_token. reader-a2a verifies the token against the Home's JWKS, checks the wire's delegator, delegate and shape, and upserts it in D1.
5. `GET /me` reports `wire: true`. In the background the device pulls the highlights, annotations and history manifests and buckets, and the outbox flushes any marks made while signed out, adopting them with fresh opIds.

Quick Connect collapses steps 1 to 3 into one `POST /connect/demo-signin` for a person in the Home's demo roster. The dev reader is local only.

**Read a chapter**

1. First paint for `/read/<translation>/<book>/<chapter>` is rendered at the edge by the reader-web Worker from the Bible API, with Open Graph tags and a seed the client adopts if route, build and seed match.
2. The client fetches the chapter from bible.helloao.org, stores it in IndexedDB `chapters`, and the service worker caches the response. Downloaded translations serve offline.
3. Marks come from the device bucket first. If signed in and online, `seed.bucket.read` asks reader-a2a, which answers from the BucketCache or reads `seed-bible/highlights/JHN/3.jsonld` through the person's agent, and the result is merged into the signal.
4. After 8 seconds on the chapter a `seed:ReadingEvent` is added to the history bucket and queued, one event per chapter per day.

**Make a highlight**

1. Select a verse, pick a colour. The highlight is applied to the device bucket in IndexedDB and an outbox entry is queued for that bucket with a batch id.
2. The outbox flushes (signed in, wire present, online): one `seed.bucket.merge` harness run per touched bucket, three at a time, marks before history, retried with the same batch id so the far side stays idempotent.
3. reader-a2a reads the bucket through the person's agent, merges, saves the bucket by id, then saves the collection manifest off the critical path.
4. The person's agent admits the wire and writes its own Library. The receipt carries the merged bucket; the device takes it as truth. Delete is a tombstone item.

**Write and publish a note**

1. Select, Note, write in TipTap, Save. A `seed:Annotation` item, with `supersedes` naming the opId it was edited from, follows the highlight path into `seed-bible/annotations/<BOOK>/<ch>.jsonld`.
2. Publish from the notes pane calls `seed.publish.slice` with kind `note`, the passage, title and markdown.
3. reader-a2a asks the person's agent to save the `seed:Offering` descriptor and the markdown under `seed-bible/public/note/<slug>` as public, then to publish each (a signed release). It nudges the registry's crawl.
4. The serving plane lists and reads the public shelf through the public door, validates the offering, and indexes it by chapter in D1. Withdraw sets the documents private; the next crawl writes a tombstone.

![publish and discover · 4 parts, one loop](./images/new-publish-discover-loop.png)

The loop closes at Discover: the browser asks reader-a2a, reader-a2a queries the registry, and the body of a chosen item is read back from the owner's shelf through the public door.

**Discover**

1. The compass opens Discover for the chapter. `seed.workspace.discover` goes to reader-a2a, which queries the registry's `/registry/offerings?passage=JHN.3` over the service binding.
2. A chosen item's body is read with `GET /api/public/read?shelf=&path=` on reader-a2a, which reads the public document at edge.faithnet.io with no credential. Signed-out readers can do both.
3. Extensions add local sections: cross-references, places, videos, theographic. Today's friends feed uses `seed.workspace.friends` then `/registry/recent` by owner.

**Start and join a live session**

1. The host opens the session pane; `seed.session.start` runs on reader-a2a.
2. reader-a2a saves a private `seed:ReadingSession` record at `seed-bible/sessions/<id>.jsonld` in the host's Library first, then creates the `ReadingSession` Durable Object and mints a one-time token (5 minutes) and a share code.
3. The browser opens a WebSocket to `/agents/reading-session/<id>?token=` on reader-a2a's origin; the room spends the token and sends the state snapshot.
4. A joiner follows the share link `?session=<id>&code=<code>`: `seed.session.join` when signed in, or `POST /api/session/guest` with a name when not. Both get a token for the same WebSocket.
5. Follow the leader, decorations, chat, roles and presence are callables on the room, validated against the admitted actor. Chat lives in the room's SQLite. Voice is a browser-to-browser WebRTC mesh signalled through the room and never stored.

**Add a picture**

1. The device shrinks the image to the Library's 1.4 MB public cap, then calls `seed.file.put`.
2. reader-a2a asks the person's agent to save the bytes as a public document `seed-bible/files/<sha256>.<ext>` (the record), then puts a copy to the serving plane's R2 with the shared upload token.
3. A `seed:GalleryImage` work in `seed-bible/files/` catalogs it. Pages load the R2 copy from seed-bible-a2a.faithnet.io. The crawl's refill re-puts any copy R2 lacks.

**Presence and friends**

1. Every 30 seconds while signed in, visible and sharing, the browser posts a beat with the chapter on screen to reader-a2a, which forwards it under the reader's own token to the runtime's presence object. A beat lapses in 90 seconds.
2. Today asks `/api/presence/friends` and shows a green dot and the chapter for each friend; tap to open it.
3. The friends list is `seed.workspace.friends`, which asks the person's agent for `person.friend.list` (mutual friend-role contacts). Adding or inviting a friend links out to the Home's Contacts page; the email invitation goes out on the Home's own rail.

**Ask the companion**

1. The flame icon or the verse toolbar's Ask posts to `/companion/ask` on reader-a2a with the id\_token; signed-out readers get 401.
2. reader-a2a forwards to the serving plane's `/companion` with the shared token. Workers AI runs the Llama 3.1 8B model and streams; the SSE stream passes back through reader-a2a, with a leading `who` event naming the answerer.
3. Transcription follows the same shape through `/api/transcribe` to Whisper on the serving plane; the device decodes audio and never sends silence.

**Church theme (customization)**

1. The Library pane's Customizations tab saves a `seed:Customization` work (variants with theme variables, logo, default translation, recommended extensions) through `seed.work.save` into `seed-bible/customizations/`.
2. Publish releases it as a slice of kind `customization`; the registry lists it by kind.
3. A reader picks it under Account, Church theme, or arrives with `?customization=<slug>`; the choice is kept on the device and the variant is overlaid on the built-in light and dark themes.

**A church publishes as itself**

1. A steward picks the church under Account, Publish as; the list comes from `seed.workspace.orgs` (`person.affiliations.list`).
2. `seed.publish.slice` with `as` set to the org's address makes reader-a2a address every `library.*` step to the org's agent with the steward's own wire. The runtime derives steward standing on chain; `publishedBy` is the org and the slice lands on the org's shelf.
3. Prerequisites, done once per church from ap-home: the steward link, a bound vault key, the org-steward playbook, and the shelf registered on the serving plane. The runbook is `docs/runbooks/church-publishes-as-itself.md`.

## External integrations now

Nothing outside the estate is written to. Reads may be as wide as useful; writes stay inside faithnet (the Home, person and org agents, the workspace, the serving plane, the town registry). The one outbound send is the Home's own email rail for a friend invitation, which is an estate feature and not an integration write.

| Integration | Status | Direction | Who calls it | Where the credential lives |
| --- | --- | --- | --- | --- |
| Bible API (bible.helloao.org) | kept, browser-direct | read | reader-web, and the reader-web Worker for edge render and sitemap | none |
| Typesense (search.seedbible.org) | kept, browser-direct | read | reader-web | search-only key in `VITE_TYPESENSE_SEARCH_KEY` |
| Cross-reference and theographic datasets | kept | read | reader-web extensions, from the Bible API host | none |
| OpenStreetMap tiles, OpenBible geometry, the isreal\_geojson fallback | moved behind the serving plane | read | reader-web asks reader-a2a `/api/tiles/*` and `/api/places/*`; the serving plane fetches and caches (tiles a week, zoom 12 and under, a real user agent) | optional `TILE_SOURCE`, `TILE_KEY` on the serving plane; a key never reaches a page |
| Workers AI | new | compute | the serving plane, for the companion (Llama 3.1 8B) and transcription (Whisper) | the `AI` binding; reached only with the shared upload token |
| Cloudflare email via the Home | new, estate feature | send, as the person | the Home's `/connect/friend-invite/email` | ap-home |
| Twitch | watch-only kept, host dropped by rule | read (embedded player and chat iframes) | reader-web | none. The host path (post to chat, overlay) is an intentional drop; a secret-plus-proxy path would need the outbound allowlist |
| Transcripts | kept, moved to the estate speech model | read | reader-a2a `/api/transcribe` to the serving plane | none in the browser |
| External MCP servers | listed only, acts pending | read of the connector list through `seed.workspace.connectors` | reader-a2a asks the person agent `mcp.connectors.list` | the Home's connectors; an act would run inside the person's own harness, never from the browser |
| Apologist and partner AI | not called yet | would arrive as an org's offering through Discover | registry | none |
| PostHog analytics | dropped in the new reader |  |  |  |
| Google Fonts | kept | read | reader-web | none |
| Town discovery (names.faithnet.io, faithnet.town) | available, not used by the crawl yet | read, to find agents | serving plane in future; shelves are configured by hand today | none |

The earlier reader also reached Cloudinary for logos, YouTube and Vimeo for embeds, and favicon.ao.bot for PWA icons. In the new reader logos are pictures in the Library, embeds remain read-only iframes, and PWA icons ship with the build.

## Old to new: where each thing went

One row per piece of the old reader. The second column says what it became, the third where the data now lives. Ported docs with the detail for each manager are in `packages/seed-bible-ap/docs/porting/`.

| Old (CasualOS reader) | New (A2A and MCP reader) | Where it lives now |
| --- | --- | --- |
| `OsManager`: the SDK gateway to auth.seedbible.org | `backend/ReaderBackend.ts` seam with `backend/a2a.ts`; one `POST /harness/ask` per call to reader-a2a | reader-a2a at seed-reader-a2a.faithnet.io |
| Email-code login; session key in localStorage; `LoginManager` | Home sign-in (popup, redirect, Quick Connect) with an id\_token and an ask-as-me wire; `src/session.ts` | id\_token in sessionStorage; wire in reader-a2a D1 `wires`; identity at the Home |
| Profile record `profile` with `config` for settings | `seed:Profile` work in `seed-bible/profile/`; settings in `state/chrome/settings.ts` | Library for the profile; localStorage `sbr.settings` for settings (Library later) |
| Highlights: `highlights:<tr>/<book>/<ch>`, `publicRead`, IndexedDB `seed-bible-highlights` | `state/records/highlights.ts`; `seed.highlight.put` and `seed.bucket.merge`; tombstones for delete | Library `seed-bible/highlights/<BOOK>/<ch>.jsonld`, private; device IndexedDB `buckets` and `outbox` |
| Notes: `annotation_<uuid>` per note, marker per chapter, keep-mine-or-theirs conflicts | `state/records/annotations.ts`, TipTap; `supersedes` and `conflictOf`; Keep this version | Library `seed-bible/annotations/<BOOK>/<ch>.jsonld` |
| Saves `saves`, bookmarks `readingBookmarks`, whole document per change | `state/records/saves.ts`, `bookmarks.ts`; single buckets through `seed.bucket.merge` and `seed.bookmark.put` | Library `seed-bible/saves/saves.jsonld`, `seed-bible/bookmarks/bookmarks.jsonld` |
| Reading history: a Yjs document per year, 5-second ticker | `state/records/history.ts`: one `seed:ReadingEvent` per chapter per day after 8 seconds; pulled across devices by manifest | Library `seed-bible/history/<BOOK>/<ch>.jsonld` |
| Reading position: tabs in localStorage `sb-tabs-state`; translation in profile config | `state/reading/tabs.ts`, `state/records/position.ts` | device prefs only; `seed:ReadingPosition` in the ontology, not yet written |
| Bible API client `FreeUseBibleAPI` (vmfnri default) | `backend/bible.ts` copied whole; bible.helloao.org used; service worker caches it | browser-direct; IndexedDB `chapters` for offline |
| Typesense search with a key in source | `backend/search.ts`, same one GET | browser-direct; key in `VITE_TYPESENSE_SEARCH_KEY` |
| Playlists `playlist_<uuid>` and play history records | `state/library/playlists.ts`, `works.ts`, `playHistory.ts`; `seed.work.save/list/read`; Publish as a slice | Library `seed-bible/playlists/<id>.jsonld`; play history on device |
| Reading plans, metadata companion, progress records | `state/library/plans.ts`; progress as a `seed:PlanProgress` mark | Library `seed-bible/plans/<id>.jsonld` and `seed-bible/progress/progress.jsonld` |
| Customizations `customization_<uuid>`, `?customization=<record>.<id>` | `state/chrome/customizations.ts`; a `seed:Customization` work; Publish as kind `customization`; Church theme picker | Library `seed-bible/customizations/<id>.jsonld`; the registry lists published ones; selection on device |
| Gallery photos as file records plus `photo_<uuid>` | `state/library/files.ts`; `seed.file.put`; `seed:GalleryImage` works | Library public `seed-bible/files/<sha256>.<ext>` (the record) and an R2 copy on the serving plane |
| Link previews through CasualOS `getLinkPreview` | `seed.workspace.preview` | serving plane `/preview`, cached a day |
| Friends as a shared permission; content read through public markers | `seed.workspace.friends` over `person.friend.list`; invitations on the Home's email rail | the Home's contacts and friends; nothing in this app |
| Today and Discover reading friends' records and bundled providers | `state/social/today.ts`, `discover.ts`; `seed.workspace.discover`; `/registry/recent` by owner; public bodies through `/api/public/read` | the serving plane's registry over everyone's public shelves |
| Sharing by `publicRead` on everything | Explicit publish: `seed.publish.slice` releases to a public shelf, withdraw makes it private | owner's shelf `seed-bible/public/<kind>/<slug>`; registry D1 index |
| Live sessions: a Yjs branch `doc/session_data`; registry document for invites; chat in the same document | `ReadingSession` Durable Object room on reader-a2a's origin; `seed.session.start/join`; share code and one-time token; guests without a Home | room state and chat in the DO; `seed:ReadingSession` record in the host's Library |
| Extension settings record; secrets in proxy records | Extension host in `reader-web/src/extensions/host`; enabled set on device; no secrets path yet | device prefs `extensions:enabled`; secrets and proxies are an open question |
| Apologist, Bonfire, transcript, Twitch pub/sub, MCP extensions | Study companion through `/companion/ask` to Workers AI on the serving plane; transcription to Whisper; Twitch watch-only; MCP connectors listed only; Apologist to come as an org offering | serving plane AI binding; nothing written outside the estate |
| `.aux` patterns in ao.bot iframes; `PATTERN_*` upload in CI | deferred to an embed track; Scripture Map ported as a pane | not deployed |
| PostHog analytics and feature flags | dropped |  |
| SSR host on Bun with S3 bundles; `cd.yml` to S3 and `/__invalidate` | reader-web Worker renders `/read/*` and `/shared/*` at the edge; `pnpm deploy:faithnet` with wrangler | Cloudflare Workers on the faithnet.io zone |
| Service worker precaching the shell and fonts, not the Bible API | `vite-plugin-pwa` service worker caching the shell, assets, Bible API and fonts; never the backend routes | browser |
| i18n: 24 bundled locales | the same locales ported with `scripts/port-locales.mjs` | bundle |
| Nothing: a reader's data belonged to the operator's record store | The reader's Library at their Home, with a revocable wire | the Home vault |

## What stayed the same, what is still moving

**Kept as-is.** The reading experience was ported, not rewritten. The chapter column, header, selector, verse toolbar, floating toolbar, footnote modal and notes pane came across from `packages/seed-bible` with its stylesheets and the light and dark theme tables copied unchanged. The Bible API client was copied whole, the Typesense query is the same one GET, and the scripture reference parsers moved into `lib/scripture`. Preact with signals is still the state model. Highlights, notes, bookmarks, saves, reading history, playlists, reading plans, customizations, gallery pictures, link previews, live sessions, Today, Discover and extensions all exist again with the same user-facing behaviour.

**Changed in kind, not just in place.**

- Identity moved from an email code at CasualOS to the Home's id\_token plus a delegation. The reader has a real on-chain agent address.
- Records moved from one CasualOS record per user with one address per item to JSON-LD chapter buckets in the person's Library, idempotent by opId, merged rather than overwritten.
- Sharing moved from world-readable `publicRead` markers on everything to explicit publish: a slice is released to a public shelf, crawled into a registry, and withdrawn to make it private again. Private is the default.
- Multiplayer moved from Yjs documents on the CasualOS inst server to an Agents SDK room on the workspace origin, with the session record kept in the host's Library.
- Secrets and proxies: the old proxy records that let extensions call outside hosts with stored keys have no replacement yet; the outbound allowlist is an open design question.

**Still in transition.**

- Reading position, reader settings, the enabled-extension set, the chosen customization and playlist play history live on the device only. Their ontology classes exist but no tool writes them to the Library yet.
- The `seed-reader` archetype cannot replace the `person-steward` playbook until the tool-id collision on `library.file.read` is resolved.
- The manifest's change feed is written but not consulted; manifest write amplification is unmeasured.
- Conflicts between two devices editing a note are detected and kept side by side, but the only resolution offered is Keep this version.
- The workspace and its governing org are not paired yet (`estate/seed-reader-org.faithnet.json` says `paired: false`).
- The 3D patterns (Bible Stack, House of the Lord, geo-importer) and ao.bot portals are deferred to an embed track.
- The root CI does not run this package; `pnpm gate` is run by hand. Playwright flows cover the happy paths, with four timing out on the last run.

## Deployment and naming

Everything deploys with one command, `pnpm deploy:faithnet`, to the town's Cloudflare account, which holds the faithnet.io zone. The order is reader-mcp, reader-a2a, seed-bible-mcp, seed-bible-a2a, then reader-web. The web build runs `vite build --mode faithnet` first. The package is excluded from the root tsconfig and eslint; check it with `pnpm --filter @seed-bible/ap typecheck`, `pnpm smoke`, and the live gates `pnpm smoke:vault`, `smoke:svc`, `smoke:rebuild`, `smoke:reader-web`, `smoke:session`, and `pnpm e2e` for the Playwright flows that write the training manual's Test column.

| Worker | Name on Cloudflare | Host |
| --- | --- | --- |
| reader-web | seed-bible-reader-web-faithnet | seed-reader.faithnet.io |
| reader-a2a | seed-bible-reader-a2a-faithnet | seed-reader-a2a.faithnet.io |
| reader-mcp | seed-bible-reader-mcp-faithnet | workers.dev only, reached by service binding |
| seed-bible-a2a | seed-bible-svc-a2a-faithnet | seed-bible-a2a.faithnet.io |
| seed-bible-mcp | seed-bible-svc-mcp-faithnet | seed-bible-mcp.faithnet.io |

**Names bought on faithchain** (chain 34348, paid in SHQ from the demo reader's person treasury)

| Name | Type | Root price (SHQ) | Custody |
| --- | --- | --- | --- |
| seedreader.me | person | 8 | the demo reader's own key |
| seed-reader.workspace | workspace | 4 | the same key, salt 1; vault key bound; a2aEndpoint record presented |
| seed-reader.org | organization | 12 | chartered through the reader's Ask; the reader stewards it |
| seed-bible.svc | service | 10 | chartered through the reader's Ask; vault key bound |

Public facts about each agent are in `estate/*.json`; `estate/faithnet.ts` carries the town and estate rows (which Homes may issue a reader's token, the chain, the contracts). Which estates a deployment serves is `ESTATE_IDS` on the worker; nothing is inferred.

**Secrets** (never in source; `docs/runbooks/secrets.md`): reader-a2a has `A2A_INTERNAL_MARKER`, `READER_ASK_PRIVATE_KEY`, `PLATFORM_UPLOAD_TOKEN`; the serving plane has `A2A_INTERNAL_MARKER`, `UPLOAD_TOKEN` (must equal the platform token), `ADMIN_TOKEN`, and optional tile keys. Local copies of the demo keys are under `.seed/` with 0600 permissions and are gitignored.

**Runbooks** in `docs/runbooks/`: deploy-faithnet, secrets, register-client (the `seed-bible-reader` client at the Home with `ask_with_login` and `libraryFolders: ["seed-bible"]`), mint-person, charter-services, buy-names, assign-playbook, church-publishes-as-itself, rebuild-serving-plane, rotate-internal-marker, and cutover-checklist. The cutover checklist is not to be run: seedbible.org stays as it is.

**Handle with care.** The Home's Quick Connect roster is a sensitive Vercel env (`DEMO_PERSONA_KEYS`) that the API never returns decrypted. Adding a person means rebuilding the whole roster from local key files with `scripts/home-roster-rebuild.mjs` and writing it back with `--base`, then redeploying the Home. On 2026-10-21 a first write replaced the roster with one person and had to be restored.

## Open questions

These are the decisions still to make, drawn from `docs/architecture/hard-problems.md`, the gap analysis and the training manual. Each is one line; the numbered sections of hard-problems carry the full argument.

- [ ] Friends-only sharing without publishing to the world: circle shelves (a copy into a `.circle` Library) and `seed:ShareGrant` are substrate work (hard-problems 4).
- [ ] A church writing as itself with its own ask-as-org wire (`seed.workspace.ask.org`) rather than through the steward's standing (11).
- [ ] Streaming: `/harness/ask` long-poll to SSE, and person agents still run with streaming off (9).
- [ ] Secrets and outbound proxies for extensions (`seed.secret.put`, `seed.workspace.proxy`) and the outbound host allowlist that would gate them (10). Until then Twitch host and keyed partner APIs stay out.
- [ ] Acts on connected MCP servers: list only today; whether to offer acts inside the person's own harness is undecided.
- [ ] Which records should leave the device for the Library: reading position, settings, extension bindings, customization selection, playlist history.
- [ ] Resolve the `seed-reader` archetype's tool-id collision so it can replace `person-steward` (16).
- [ ] Crawl budget and town discovery of shelves instead of a hand-kept shelves table (12); release signature verification (ERC-1271) before showing a stranger's shelf.
- [ ] Measure manifest write amplification and decide whether to consult the manifest as a change feed (13).
- [ ] A door for federation visitors: a hopenet id\_token is refused today (18).
- [ ] Session depth: discussion-board chat, huddles, agent seats, an SSE fallback, standing from org or circle membership, shared tabs rather than one passage.
- [ ] Pair the workspace with its governing org.
- [ ] Run the package in root CI; decide the three uncommitted root edits from the hello-world phase (workerd allowBuilds, tsconfig exclude, eslint ignore).
- [ ] Conflict resolution beyond Keep this version.
