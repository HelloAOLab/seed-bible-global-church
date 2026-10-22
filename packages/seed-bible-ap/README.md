# @seed-bible/ap — the reader triad on the agenticprimitives substrate

A **hello-world** scaffold, on purpose. It stands up the same three-part shape as
[`verifiable-content-demo`](https://github.com/RichCanvas3/verifiable-content-demo) (web → A2A agent → MCP
tools) with the same user-connect and application framework, configured for the **faithnet town** (faithchain,
chain 34348) and the **faithnet estate** (Home `www.faithnet.me`). The feature set is one tool that says hello.
The real reader apps get planned once this stands. Architecture (feature map, person/org skills, `seed:` ontology): [`docs/architecture/`](./docs/architecture/).

```
apps/reader-web  (:5185)  →  apps/reader-a2a (:8891)  →  apps/reader-mcp (:8890)
   Connect with Home + Hello     the reader workspace agent      the `hello` tool
   (@agenticprimitives/           (@agenticprimitives/            (HTTP + MCP JSON-RPC)
    connect-client, Preact)        service-host, a2a, Hono)
```

| App          | What it is                                                                                                                                                                                                                                                                                                          | Substrate it uses                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reader-mcp` | One tool, `hello`, on two lanes: `POST /tools/hello` (the agent's lane) and `POST /mcp` (MCP JSON-RPC: `initialize` · `tools/list` · `tools/call`, for any MCP client).                                                                                                                                             | — (holds no key; the MCP decision layer comes with the first real tool)                                                                                            |
| `reader-a2a` | The **reader workspace agent** (`seed-reader.workspace`). Every ask — a stranger's `/hello`, a reader's `/harness/ask` — is ONE harness run on the agent's own Durable Object. A reader is who their Home's id_token says (verified against `<iss>/jwks`, `aud = seed-bible-reader`, issuer under a served estate). | `service-host` (the harness run pipeline, the run DO, `/harness/*`, the A2A card and `/api/a2a`), `orchestration` (tool spec, planner), `jose` for the Home's JWKS |
| `reader-web` | Connect with the faithnet Home (FedCM → popup → redirect), or as one of the Home's sample people (Quick Connect), or — local dev only — as the seed demo reader. Then **Hello**: signed-in readers go through `/harness/ask` (a run, with a run ref); strangers through `/hello`.                                   | `connect-client` (the relying half of Connect; this page holds no key)                                                                                             |

`estate/faithnet.ts` carries the town and estate rows (public facts from ap-town's
`towns/faithchain/town.yaml` and the `faithchain.json` deployment): which Homes may issue a reader's token, the
chain, the contracts. Which estates a deployment **serves** is `ESTATE_IDS` on the worker; nothing is inferred.

## Run it

```bash
pnpm install                                  # from the repo root (pnpm workspace)
cd packages/seed-bible-ap
pnpm seed:reader                              # once: the seed demo reader (see below)
pnpm dev                                      # mcp :8890 + a2a :8891 + web :5185 → open http://localhost:5185
pnpm smoke                                    # in-process triad proof, no servers
pnpm typecheck
```

What you can do on the page today: sign in as the seed reader (dev lane), press **Hello**, and read the
greeting that came back through the agent's harness run from the MCP. The Home sign-in button lights up once the
`seed-bible-reader` client is registered at the Home (`VITE_CONNECT_DELEGATE`, an operator step).

## Seed demo reader

`pnpm seed:reader` generates `seedreader` — a person on the faithnet estate with the credentials the reader
workspace admits. **Minted on faithchain 2026-10-21**: account `0xdbb41f779194d605e636f9bab64b105fd025b3db`,
type `person` declared, vault key bound at `mcp.faithnet.io`.

| Credential                                                                 | Where it lives                                                                                 | Made by                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Custodian EOA (the key)                                                    | `.seed/reader.local.json` (0600, gitignored)                                                   | generate                                                                                                           |
| Smart Agent address (the identity; `{ mode 0, custodians [eoa], salt 0 }`) | `estate/seed-reader.faithnet.json` (public)                                                    | generate (one read against the chain)                                                                              |
| Local dev session `dev:seedreader`                                         | `apps/reader-a2a/.dev.vars` (`DEV_STUB_SESSIONS=1`, `DEV_READERS`)                             | generate                                                                                                           |
| The account deployed, type `person` declared, vault key bound              | faithchain + the estate                                                                        | `pnpm seed:reader -- --mint` (done)                                                                                |
| Quick Connect at the Home                                                  | the faithnet Home's `DEMO_PERSONA_KEYS` roster                                                 | `node scripts/home-roster.mjs .seed/reader.local.json seedreader` (needs `npx vercel login`), then a Home redeploy |
| A real `aud=seed-bible-reader` id_token                                    | the Home's client registry — `seed-bible-reader`, ap-home `apps/home/src/whitelabel/config.ts` | registered 2026-10-21 (ap-home `c02ca7bc`)                                                                         |
| The name `seedreader.me`                                                   | bought with Sheqel at `www.faithnet.me/naming/register` (`.me` is a priced root, spec 431)     | the reader, signed in at the Home                                                                                  |

Generate touches nothing outside this repo; `--mint` writes to the live chain and estate (gasless, through the
estate A2A's paymaster), so it is a separate, explicit step.

### The Home's demo roster (handle with care)

Quick Connect lists exactly the people in the faithnet Home's `DEMO_PERSONA_KEYS` — a **sensitive** Vercel env on the
`faithnet-home` project, which the Vercel API never returns decrypted. So adding one person means rebuilding the WHOLE
roster from the local key files and writing it back, then redeploying the Home (a push to ap-home `master`):

```bash
# 1. rebuild + validate every live person (sa and custodian recovered from the key) into a 0600 file
node scripts/home-roster-rebuild.mjs /path/roster.full.json <(curl -s https://www.faithnet.me/connect/demo-personas) \
  ~/ap-home/demo/personas.local.json ~/ap-home/demo/personas.scripture.local.json <cil-steward wrapped> .seed/reader.local.json
# 2. write it (refuses without --base, because a sensitive env reads back empty)
node scripts/home-roster.mjs .seed/reader.local.json seedreader --base /path/roster.full.json
# 3. redeploy the Home (empty commit to ap-home master), then check https://www.faithnet.me/connect/demo-personas
```

On 2026-10-21 the first write replaced the roster with one person because of exactly this; it was rebuilt from
`~/ap-home/demo/*.local.json` and `~/skills/.personas/cil-steward.json` and restored before the Home redeployed with it.

### The workspace and its custodian

`seed-reader.workspace` is a real agent on faithchain, **custodied by the seed reader** (chartered 2026-10-21 with
ap-home `scripts/charter-service-agent.mts --type workspace`, salt 1 over seedreader's custodian key):

|             |                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Smart Agent | `0x5DD5f3dB5085604b0f6A907BBb35AE645AFd307F` (`A2A_AGENT_SA` on reader-a2a)                                     |
| Type        | `workspace` (role-typed on its own profile), `atl:estate = faithnet.estate`                                     |
| Custodian   | `seedreader` (EOA `0xE7d5…74a2`) — the same key custodies the reader's own account (salt 0)                     |
| Shape       | standalone: no governing organization, so no members; access is a direct person → workspace grant               |
| Name        | `seed-reader.workspace` not bought yet (priced root; needs seedreader's treasury with SHQ, then `buy-name.mts`) |

### The estate (step 1 — estate-custody, 2026-10-21)

| Agent                             | Address          | Name           | Custody / steward                                                        |
| --------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------ |
| `seedreader.me` (person)          | `0xdbb41f…b3db`  | bought (8 SHQ) | seedreader's key                                                         |
| `seed-reader.workspace`           | `0x5DD5f3…d307F` | bought (4)     | seedreader's key, salt 1; vault key bound; standalone (org pairing open) |
| `seed-reader.org` (governing org) | `0x0D6f3D…cEA26` | bought (12)    | chartered through seedreader's Ask; seedreader stewards                  |
| `seed-bible.svc` (serving plane)  | `0x8f627e…9333c` | bought (10)    | chartered through seedreader's Ask; vault key bound                      |

The `seed-bible-reader` client at the Home now mints the **ask-as-me wire** beside the id_token (`ask_with_login`, template
`ask-as-me`, `ask_delegate` = reader-a2a's asking key, `libraryFolders: ['seed-bible']`). reader-web hands the wire to
reader-a2a (`POST /api/connect`), which checks it is the reader's, names its key and is `harness.ask`-shaped, and keeps it
in D1 (`seed-reader-a2a`, `migrations/`). `GET /me` reports `wire: true`. Facts: `estate/*.json`; procedures: `docs/runbooks/`.

### The vault path (step 2 — seed-ontology · grow-reader-a2a · grow-reader-mcp, 2026-10-21)

- **`~/skills` seed domain:** `ontology/seed.ttl` (38 classes, shapes for every produced class), `seed.clusters.ttl`,
  `seed.data.ttl` (vocabularies, examples, capabilities, skills, archetypes), skills `hello`, `highlight-put`,
  `annotation-put`, `bookmark-put`, `reading-position-set`, `bucket-merge`, `publish-slice`, archetypes
  `seed-reader` / `seed-publisher` / `seed-workspace`, `scripts/register-seed.mjs`. Preflight clean; registered and
  pushed to GraphDB. Pinned here by digest: `apps/reader-a2a/src/pins/skills.json` (`pnpm pin:skills`).
- **Here:** `lib/seed-schema` (zod per class, held to the TTL by a test), `lib/library-client` (chapter buckets,
  manifests, the idempotent put, the item-level merge — [ADR-0006](docs/adr/0006-chapter-buckets-and-the-vault-path.md)),
  reader-a2a tools `seed.highlight.put` / `seed.annotation.put` / `seed.bookmark.put` / `seed.bucket.read` /
  `seed.bucket.merge` over the reader's wire, reader-mcp `bucket_merge`.
- **Proof:** `pnpm smoke:vault` — as seedreader, a highlight in John 3 lands in their Library, reads back at the same
  version, and a re-put with the same opId changes nothing. Passes locally and against `seed-reader-a2a.faithnet.io`.
- First run: a reader's agent needs a playbook that carries the Library reads (`docs/runbooks/assign-playbook.md`).

### The serving plane (step 3 — platform-apps, 2026-10-21)

`apps/seed-bible-a2a` (`seed-bible.svc`, service-host + Hono + D1 + cron) crawls configured public shelves through the
estate's public door, indexes released, signed `seed:Offering`s by chapter, tombstones withdrawals, and rebuilds from
nothing ([ADR-0007](docs/adr/0007-seed-registry-over-public-shelves.md)). `apps/seed-bible-mcp` carries the pure
`offering_validate` tool. reader-a2a gained `seed.publish.slice` (a slice to the reader's own shelf, released) and
`seed.workspace.discover` (the registry over the `PLATFORM` binding). Proof: `pnpm smoke:svc` (publish → indexed →
discover → wipe+reindex equal → withdraw → gone) and `pnpm smoke:rebuild`. Live at `seed-bible-a2a.faithnet.io`.

### Core reading (step 4, first cut — core-reader, 2026-10-22)

reader-web is the reader now, not a hello page: the chapter column, header, selector, verse toolbar, floating
toolbar, footnote modal and notes pane are ported from `packages/seed-bible` with its stylesheets and theme tables
copied unchanged (docs/porting/\*.md say what each manager became). Under it: `backend/ReaderBackend.ts` (the only
seam), `backend/a2a.ts` (reader-a2a's harness, as the signed-in reader), `backend/dev.ts` (in memory, for tests),
`backend/offline/` (IndexedDB buckets, chapters, prefs, and the outbox — one merge run per bucket), and
`state/records` (highlights, notes with two-device conflicts, bookmarks) over `lib/library-client`
([ADR-0008](docs/adr/0008-device-read-model-outbox-and-supersedes.md)). Proof: `pnpm test` and
`A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:reader-web`. Not yet: tabs/panes, saves, search, audio,
TipTap, SSR, the service worker, the highlight ribbon.

## Deployed on faithnet (2026-10-21)

| App            | Worker                           | Host                                                                                         |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| reader-web     | `seed-bible-reader-web-faithnet` | https://seed-reader.faithnet.io                                                              |
| reader-a2a     | `seed-bible-reader-a2a-faithnet` | https://seed-reader-a2a.faithnet.io                                                          |
| reader-mcp     | `seed-bible-reader-mcp-faithnet` | service-bound from reader-a2a; `seed-bible-reader-mcp-faithnet.richardpedersen3.workers.dev` |
| seed-bible-a2a | `seed-bible-svc-a2a-faithnet`    | https://seed-bible-a2a.faithnet.io (the Seed registry; `/registry/offerings?passage=JHN.3`)  |
| seed-bible-mcp | `seed-bible-svc-mcp-faithnet`    | https://seed-bible-mcp.faithnet.io                                                           |

```bash
wrangler secret put A2A_INTERNAL_MARKER -c apps/reader-a2a/wrangler.toml --env faithnet   # once (done)
pnpm deploy:faithnet          # mcp → a2a (service-bound to the mcp) → web (built with --mode faithnet)
```

Sign in on the live page with any faithnet Home account (social login at the Home), or as the seed reader from the
sample-people list (the Home's demo roster carries them since 2026-10-21). Hosts are custom domains on the `faithnet.io` zone of the Cloudflare account the
town runs on.

## Rules carried over

- The browser never reaches the MCP directly; the agent does (ADR-0044).
- No private key in app source. The seed reader's key is in `.seed/` only; the workers hold a marker, not a custody key.
- A reader is who their Home says — verified server-side against the Home's JWKS, never trusted from the browser.
- `agentic.lock.json` pins the `@agenticprimitives/*` set; `pnpm doctor` (`ap doctor`) checks the tree against the kit's rules.
