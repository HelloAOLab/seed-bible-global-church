# Hard problems in this design

The parts of the rebuild that are genuinely difficult, why, what the chosen approach is, and what is still open. Each item names the folders in [repo-layout.md](./repo-layout.md) that carry it. When one of these is settled, write the ADR under `docs/adr/` and shorten the entry here to a pointer.

Facts checked against ap-home on 2026-10-21 (`apps/agent-runtime/src/library-tools.ts`, spec 412/413): Library access policy is **`public | private` only** (`library.file.visibility`; a public folder makes its children public); text documents are capped at **12,000 chars**, public binaries at **1.4 MB**; `library.files.list` lists the whole catalog (no changed-since filter); every save is one `content.artifact.<id>` subject record written by the owner's agent; a public save announces to the public tier's indexer (spec 413).

## 1. The vault is a file shelf, not a database

**Settled 2026-10-21 — [ADR-0006](../adr/0006-chapter-buckets-and-the-vault-path.md):** chapter buckets + per-collection manifests, idempotent by `opId`, read/merge/re-save through the reader's own agent; the read lane is the person's playbook (`person-steward` carries `library.file.read`), not a vault credential. The text below is the original framing.

**Problem.** CasualOS gave `listDataByMarker` + address prefixes: "all highlights in John 3" was one indexed query. The Library is a catalog of documents with a 12k-char text cap, no query, no changed-since, and every write is a harness act on the person's agent. A reader opening a chapter needs highlights, notes, bookmarks, saves, position for that chapter in well under a second, offline too.

**Approach.**

- **Bucket by chapter, not by item.** One JSON-LD document per `(collection, edition?, book, chapter)`: `seed-bible/highlights/JHN/3.jsonld` holds every highlight in that chapter as a `@graph`. One read per chapter per collection; the 12k cap is a real bound (~80 highlights or ~15 short notes per chapter), so a bucket **splits** into `3.1.jsonld`, `3.2.jsonld` when full, and a per-collection **manifest** (`seed-bible/highlights/_manifest.jsonld`: bucket → version, count, updatedAt) is the index. Reading history and events are bucketed by month.
- **The read model is local.** IndexedDB (`reader-web/src/backend/offline/`) is the thing the UI reads. Sync = read the manifest, fetch buckets whose `version` moved. The manifest is rewritten on every write (one extra artifact per act); that is the price of not having a change feed.
- **Write path.** UI → optimistic IDB write + outbox → reader-a2a → person agent `harness.ask` with a `library.file.save` plan that re-saves the bucket **by id** (new version) and the manifest. Idempotency key per op (`seed:opId`) stored in the bucket so a retried save is a no-op.

**Open.** (a) Whether the person agent should expose a `library.file.read` by id over the ask-as-me wire fast enough for a cold start, or whether reader-mcp needs a read lane with a vault delegation of its own (today's reader-mcp plan assumed `vault.get` as the reader — that credential does not exist yet). (b) A tool on the person agent that re-saves bucket + manifest atomically; two separate saves can leave the manifest ahead of the bucket. Folders: `lib/library-client`, `lib/seed-schema`, `reader-web/src/backend/offline`, `reader-mcp/src/vault`, `~/skills/skills/seed/*-put`.

## 2. Every private write is a harness run on someone else's agent

**Problem.** A highlight used to be one `recordData` call. Now it is: reader-a2a verifies the id_token, finds the person's ask-as-me wire, calls `a2a.faithnet.io/harness/ask` with a plan, the person's harness admits the wire, checks the grant, runs `library.file.save`, writes the subject record, returns a receipt. Latency is seconds, not milliseconds, and the runtime's progress is long-poll.

**Approach.** Never block the UI on it. The outbox (problem 1) makes writes asynchronous; the UI shows "saved locally / saved to your Library" states like today's `RecordSyncManager` already does for offline. **Coalesce**: an outbox flush sends one plan per touched bucket, not one per highlight. Receipts come back on the run's SSE and update the IDB row's `syncedVersion`. Failure modes to design for explicitly: wire expired (prompt re-consent, keep outbox), grant revoked (stop, show), bucket version conflict (problem 3), runtime down (retry with backoff; the outbox is durable).

**Open.** The runtime's per-person harness is not a high-QPS surface. A reader who highlights 40 verses in a minute must become one or two runs. Measure before committing the coalescing window. Folders: `reader-web/src/backend/a2a.ts`, `reader-a2a/src/wires`, `reader-a2a/src/skills/ask-person.ts`.

## 3. Two devices, one Library, no CRDT

**Problem.** CasualOS resolved multi-device edits with Yjs for sessions and last-write-wins plus an `AnnotationConflictModal` for records. Bucket documents make the unit of conflict a whole chapter: phone adds a highlight, laptop edits a note in the same chapter while offline, both flush.

**Approach.** Buckets carry `version`; a save by id mints a new version but does not reject a stale base. So reader-a2a (not the person agent) does a **read-merge-write**: fetch the current bucket, merge at the **item** level (items keyed by `@id`; add/remove/update by `seed:updatedAt`; a note body edited on both sides is the one true conflict → keep both, flag `seed:conflictOf`, let the UI offer the modal). Highlights, bookmarks, saves, position never truly conflict (idempotent sets / latest-wins). Annotation body is the only field with real merge pain; TipTap JSON diffs are not attempted.

**Open.** Whether the merge belongs in reader-a2a (needs read access, problem 1a) or in a `seed.bucket.merge` tool on the person's agent (runs inside the owner's harness, no extra read credential). The latter is cleaner; it means a `~/skills` skill with a body that does the merge, which is a heavier SKILL.md than the rest. Folders: `lib/seed-schema` (item keys), `reader-mcp/src/tools/annotations.ts`, `~/skills/skills/seed/bucket-merge`.

## 4. Friends can see nothing unless something is public

**Problem.** The old Today feed read friends' notes and reading history directly because every record was `publicRead:*`. The Library knows only `public` and `private`. There is no "my contacts", "my circle", or "this person" audience on a document. Yet the product promise is "see what your friends are reading," not "publish to the world."

**Approach, in layers.**

1. **Public slices are first-class.** `seed.publish.slice` makes a chapter note or a plan public and releases it; the svc Seed registry indexes it; Today shows friends' public slices (fan-in via the registry, not fan-out reads of N shelves).
2. **Circle shelves for friends-only.** A `.circle` org agent has its own Library. Sharing "with my circle" is a plan that saves a **copy** of the slice into the circle's Library (`seed-bible/shared/<person>/…`), via the person's membership standing (org steward or member write path). Members read it as the circle's documents; the world cannot. Provenance (`seed:heldBy`, `prov:wasDerivedFrom`) points back to the author's record.
3. **Per-person share (`seed:ShareGrant`)** is an `at:Delegation`-shaped record that lets reader-a2a, on the grantee's behalf, ask the author's agent to read one private bucket. This needs an ap-home read capability over a presented delegation, which does not exist today — treat as a later layer.

**Open.** Whether ap-home will grow an audience on `library.file.visibility` (then layer 2 collapses into a flag). Until then the copy-into-circle approach is what ships, and the UX must say "shared with the circle" rather than "friends can see this." Reading-history heatmaps of friends are **not** carried over unless the person publishes a monthly slice. Folders: `reader-web/src/state/social`, `seed-bible-a2a/src/registry`, `~/skills/skills/seed/publish-slice`, `share-circle`.

## 5. First run: a brand-new faithnet person has no grants

**Problem.** The app assumes the reader's agent accepts `skill:seed/*` under the `seed-reader` archetype and that reader-a2a holds an ask-as-me wire. A person who just signed in at the Home has neither. CasualOS needed nothing but an email code.

**Approach.** One **consent ceremony** on first sign-in, driven by reader-web but executed at the Home: (1) Connect with `ask_with_login: true` so the Home mints the ask-as-me delegation alongside the id_token (client registration `allowed_delegation_templates: ['site-login','ask-as-me']`, `libraryFolders: ['seed-bible']`); (2) the person's harness assigns the `seed-reader` playbook (`ap.archetype-assignment.v1`) — ideally proposed by the same Home screen, else by a first `harness.ask` that returns "needs assignment" and the UI shows the Home deep link. Until both are done the reader works **local-only** (IDB) and the outbox simply waits; nothing is lost. Reading anonymously is the same mode.

**Open.** Whether the Home's consent screen can present an archetype assignment in the same step as the wire (ap-home question). If not, first-run is two screens. Folders: `reader-web/src/session.ts`, `state/chrome/Onboarding`, `estate/client.seed-bible-reader.json`, `docs/runbooks/register-client.md`.

## 6. Anonymous readers and device adoption

**Problem.** Today a person can read, highlight, join a session and later "adopt" that device's content into an account (`AdoptDeviceContentModal`). Anonymous content is local; adoption must move it into a Library with honest provenance, and anonymous session guests have no standing.

**Approach.** Local-only mode (problem 5) is the anonymous mode; `seed.device.adopt` is an outbox flush with `prov:generatedAtTime` from the local timestamps and `seed:adoptedFrom: <deviceId>`. Sessions: an **invitation token** (QR code, link) is a ground for standing (the huddle rule) — the room admits an invited anonymous guest as `role: viewer|navigator` with a display name and no principal; their highlights stay on their device; the record of the session lists them as `seed:Guest` (an `at:Person` with no agent).

**Open.** Replay safety of invitation tokens (one-time vs. multi-use for a classroom); expiry; whether the Home can later bind a guest id to a person (not today). Folders: `reader-a2a/src/standing`, `rooms/document.ts`, `~/skills/skills/seed/device-adopt`.

## 7. Standing at a scope, derived on every join

**Problem.** "May this person join this session?" depends on the scope: party to a conversation, member/steward of an org or `.circle`, or holder of an invitation. Each is a different lookup (Home relationships, org agent membership, the room's own invitation table), each can change mid-session, and the browser must never be the one asserting it.

**Approach.** Copy the huddle/poker table: reader-a2a derives `{actor, standing}` in `src/standing/` from (a) the id_token, (b) a cached membership answer from the org/circle agent (`org.members.list` via the org's A2A, TTL minutes), (c) the room's invitations. The DO trusts only what the Worker hands it, re-checks standing on reconnect, and the Worker revokes (closes sockets) on a membership-change trigger (spec 375) when one exists. Roles come from the host's acts (`seed.session.op role.set`), never from the client.

**Open.** Membership lookup latency on the first join (an A2A round trip); whether to pre-warm from the person's own `person.orgs.list`. Folders: `reader-a2a/src/standing`, `rooms/ReadingSessionDO.ts`.

## 8. The session document: one state, many devices, growing forever

**Problem.** Agents SDK `setState` syncs the **whole** state object to every connection. A session's decorations and chat grow; presence changes 10×/s; a late joiner needs a snapshot; a flaky phone reconnects often. Naively putting everything in `state` melts bandwidth and CPU.

**Approach.** Split by rate and size:

- `state` (synced): `leader`, `passage`, `edition`, `panes`, `tabs`, `roles`, `participants` (ids + names), `seq`, and **only the current chapter's** decorations. Small, changes a few times a minute.
- **Op log** in the DO's SQLite: every op with `seq`; `GetTask`/`SubscribeToTask`/long-poll read it; snapshots compacted every N ops.
- **Presence** via `broadcast` of raw frames (not `setState`), ≤10 Hz per sender, dropped if stale, batched per 100 ms (SceneDO numbers).
- **Chat** mirrored from the InteractionsDO topic into the op log, paged by `@callable()` not in `state`.
- Decorations for other chapters load on demand with a `@callable()`.

**Open.** Whether `validateStateChange` is enough for role enforcement or every mutating path must be a `@callable()` (likely the latter: clients should not `setState` at all; they call ops). Folders: `reader-a2a/src/rooms/*`, `lib/seed-protocol`.

## 9. Streaming across three hops that do not all stream

**Problem.** The user wants one live stream in the browser. The chain is browser ⇐ reader-a2a (SSE) ⇐ person agent (`/harness/progress` **long-poll**; A2A streaming implemented but cards say `streaming: false`) ⇐ study companion. Workers have request-time limits; SSE needs reconnect/resume; task ids must correlate across hops.

**Approach.** reader-a2a owns the stream. It runs the long-poll loop against the person agent inside the run DO (`ReaderRunDO`), converts `ProgressLineV1` into SSE events with `id: <seq>` so the browser can resume with `Last-Event-ID`, and ends with the `AnswerDraft`. Where the far agent **does** advertise `streaming: true`, reader-a2a uses `SendStreamingMessage` instead; the browser contract is the same either way. The DO, not the Worker request, holds the long-lived upstream poll, so Worker limits do not apply.

**Open.** Whether ap-home will flip `streaming: true` on person agents (it would halve latency); the budget for a run that streams for minutes (companion answers). Folders: `reader-a2a/src/routes/harness.ts`, `host.ts`, `lib/a2a-client`.

## 10. Secrets that never leave the vault, used by calls that must happen somewhere

**Problem.** Transcripts and Twitch need a third-party credential. The rule is `seed.secret.use` never returns the value. So the HTTP call to Twitch has to execute **where the secret can be decrypted** — inside the person's agent runtime — which means outbound calls to arbitrary hosts from ap-home, and streaming their results back.

**Approach.** Model it as the estate already models typed effects: a `seed.proxy.call` capability whose SKILL.md fixes the **host allowlist** per integration (`api.twitch.tv`, the transcript AI endpoint), method, and a response size cap; the harness performs the call as an effect using the secret from the vault and returns the body as a task artifact, which reader-a2a streams on. Nothing generic ("proxy any URL") is offered.

**Open.** ap-home has `EFFECT_WRITABLE_RECORDS` / `APP_DOMAIN_RECORD_SCOPES` allowlists for record effects, not an outbound-host allowlist; this needs an ap-home change or an estate-level `svc` that holds **no** person secrets (which would defeat the point). Until decided, Twitch and transcripts stay on the parity list but are built last. Folders: `reader-a2a/src/skills/proxy.ts`, `reader-mcp/src/tools/secrets.ts`, `~/skills/skills/seed/proxy-call`.

## 11. Org acts from a human in the reader UI

**Problem.** A church admin edits a customization in reader-web. The write must be the **org agent's** (`.church`) Library, under the org's playbook, by a person with steward standing — but the browser only has the person's id_token and the person's ask-as-me wire.

**Approach.** `seed.workspace.ask.org`: reader-a2a asks the **person's** agent to ask the **org's** agent (routed, spec 329/380 shape) with a `seed.customization.put` plan; the org's harness verifies the person's steward standing and runs `library.file.save` + `visibility public` + `publish` in its own Library. The person signs nothing new; standing is checked where the org lives.

**Open.** Whether a steward's routed ask is admitted by the org harness today for Library writes (the discussion turn is; Library writes via a member's ask need confirming). Folders: `reader-a2a/src/skills/ask-org.ts`, `~/skills/skills/seed/customization-put`.

## 12. A rebuildable Seed registry that stays honest

**First cut 2026-10-21 — [ADR-0007](../adr/0007-seed-registry-over-public-shelves.md):** configured shelves crawled through the public door, released+signed `seed:Offering`s only, tombstones on withdrawal, wipe+reindex proven by the svc smoke. Open: release signature verification, town discovery of shelves, crawl budget.

**Problem.** Discover/Today need "every public offering, playlist, plan, customization for John 3" across many shelves. The svc index must find shelves (town `list_agents_by_context`), crawl `library.public.list/read`, **verify the release** before indexing, notice un-publishing (a public re-save without a new release is a withdrawal), and be wipeable (ADR-0055).

**Approach.** Incremental crawl keyed by `(owner, entryId, version, releaseId)`; only released + public JSON-LD with a `seed:` `@type` and valid SHACL shape is indexed; tombstone when the shelf no longer lists it; a scheduled full re-crawl bounds drift; D1 holds `(passage, type, owner, entryId, version, excerpt)`. Spec 413 announce hints from org agents are accepted as "re-read this," never as content.

**Open.** Crawl budget against many shelves; whether the public tier's indexer (spec 413) can be the discovery feed instead of crawling. Folders: `seed-bible-a2a/src/registry`, `migrations/`.

## 13. Offline-first against a store with no change feed

**Problem.** Today's app is offline-first (`RecordSyncManager`, IDB stores, offline translations). The Library has no change feed and no changed-since list.

**Approach.** The manifest documents from problem 1 are the change feed: one small read per collection tells the client which buckets moved. Service worker caches the app shell and translations as today. Outbox durability is IDB.

**Open.** Manifest write amplification (every act rewrites it); if that bites, a single `seed-bible/_manifest.jsonld` per person instead of per collection. Folders: `reader-web/src/backend/offline`, `src/sw`.

## 14. SSR on a Worker with per-reader state

**Problem.** Chapter pages are server-rendered for SEO and first paint; shared pages render another person's published slice; embed mode renders in an iframe with a customization. Rendering must not need the reader's private state, and a Worker has tight CPU time.

**Approach.** SSR renders **public** things only: chapter text (cached at the edge per edition/chapter), a published slice (via the svc registry / `library.public.read`), customization theme from the org's public document. Private records hydrate client-side from IDB. Sitemap and OG tags come from the same public inputs.

**Open.** Where chapter text caching lives (Cache API in the reader-web Worker vs. svc). Folders: `reader-web/worker`, `src/entry-server.tsx`.

## 15. Agent seats cost money and time

**Problem.** A study companion in a room gets asked on every meaningful op. Without limits a lively session burns a person's budget and floods the room with late answers.

**Approach.** Copy the poker table: one outstanding ask per seat with a deadline alarm; answers after the deadline are dropped; a per-session budget declared at `session.start`; the seat's grant is the person's (the one who invited the companion), so cost lands where consent was given. The room shows whose answer it is.

**Open.** Default deadline and budget numbers. Folders: `reader-a2a/src/rooms/seats.ts`.

## 16. Version skew: SKILL.md, tools, schemas

**Problem.** A capability (`seed.highlight.put`) exists in three places: `~/skills` SKILL.md (what the agent agrees to), reader-mcp / person-agent tools (what runs), `lib/seed-schema` (what the records look like). They drift.

**Approach.** reader-a2a plans only by **pinned digest** (`pins/skills.json`, written by `scripts/pin-skills.mjs`); a test reads each pinned SKILL.md's `inputs`/`establishes` and checks them against the zod schema and the tool registry; the ontology test checks `lib/seed-schema` field names against `~/skills/ontology/seed.ttl`. Capability IRIs stay stable; SKILL.md versions them.

**Open.** Whether to generate `lib/seed-schema` from the TTL (one source) or hand-write and check (two sources, one test). Folders: `lib/seed-schema`, `reader-a2a/src/pins`, `test/unit/lib`.

## 17. Testing without a live Home

**Problem.** Almost every path crosses to another agent (person, org, svc) that only exists on the estate. CI cannot mint people or sign grants.

**Approach.** Fakes at the real boundary only: a fake Home JWKS issuer, a fake person-agent A2A endpoint that implements `harness.ask` with an in-memory Library (same `library.*` tool shapes), a fake org agent for standing. `backend/dev.ts` gives the UI an in-memory `ReaderBackend`. Live gates (`scripts/smoke/*`) run against faithnet by hand, as pokernight does.

**Open.** Keeping the fake Library's semantics (versioning, visibility inheritance, 12k cap) faithful; consider extracting ap-home's `library-tools.ts` pure functions into a test fixture rather than reimplementing. Folders: `test/helpers`, `reader-web/src/backend/dev.ts`.

## 18. Federation visitors have no path yet

**Problem.** A hopenet person has their vault on their Home; no door exists for reader-a2a; the Home has no presentation flow for people. Everything above assumes a faithnet person.

**Approach.** Build nothing speculative. Keep the admission seam (`standing/` takes evidence, not tokens) so a door's `x-ap-foreign-standing` can slot in later as one more ground for standing with **read-only** roles. Writes for a visitor are their own agent's business and out of reach until cross-town A2A exists.

## Decided already (pointers)

- Browser talks only to reader-a2a's origin — [ADR-0003](../adr/README.md), ADR-0044 (ap-home).
- Vault is the record; DO/D1/R2 rebuildable — ADR-0004, ADR-0055 (ap-home).
- Live sessions: A2A control plane + Agents SDK room on the reader-a2a origin — ADR-0005, [realtime-collaboration.md](./realtime-collaboration.md).
- Only this folder changes; one workspace package — [ADR-0001](../adr/0001-only-this-folder-changes.md), [repo-layout.md](./repo-layout.md).
