# Test plan — build the harness, then run the tests

Work order for the developer who owns quality on the new reader. Part A builds the test harness; Part B is the procedure to run before every PR and every faithnet deploy. The old CasualOS backend is **not** tested; its testing *approaches* are, each with a same-or-better equivalent here (§1). Product gaps and the remaining test-rig holes: [architecture/gap-analysis.md](./architecture/gap-analysis.md).

Scope rule applies ([`AGENTS.md`](../AGENTS.md)): everything lives in `packages/seed-bible-ap/`. Root CI, root ESLint, and `packages/seed-bible` are not touched. Root CI does not run this package yet; until that exception is approved, the gate runs by hand and its log goes on the PR.

## 1. Where every old testing approach went

The old suite had ~406 unit files, 2 integration, 6 dead Puppeteer e2e. Its approaches, and their home here:

| Old approach | Here | Status | File |
| --- | --- | --- | --- |
| Full-state fixture (`createTestSeedBibleState`) | `test/helpers/createTestReaderState.ts` over `createReaderState()` + `createDevBackend()` + `memoryStores()` | ✅ | `test/helpers/createTestReaderState.ts`; proven by `test/integration/fixtures.test.ts` |
| jsdom component tests, `TestHost`, aria/role queries | Vitest `jsdom` project; `test/helpers/TestHost.tsx`; `@testing-library/preact` | ✅ | `vitest.config.ts` (jsdom project), `test/helpers/TestHost.tsx`, `test/unit/reader-web/components/testHost.test.tsx` |
| `blockRealSockets` | `test/setup/blockRealSockets.ts` **plus** `blockRealFetch.ts` (enforces ADR-0044: browser never calls MCP/svc) | ✅ | `test/setup/blockRealSockets.ts`, `test/setup/blockRealFetch.ts`, `test/helpers/fakeNetwork.ts` |
| Fake timers + `waitFor` polling | `vi.useFakeTimers()` for coalescing/throttle/deadlines; `until()` for async | ✅ | `test/unit/reader-web/session-expiry.test.ts`, `test/integration/reader-viewport.test.tsx` (patterns) |
| Offline/sync matrix (`RecordSyncManager`) | `test/unit/reader-web/outbox.test.ts` full matrix on buckets | ✅ | `test/unit/reader-web/outbox.test.ts` |
| Hydration + no-storage-at-boot ESLint rule | `hydration.test.tsx`; `no-storage-at-boot.test.ts` (a test replaces the rule) | ✅ | `test/unit/reader-web/hydration.test.tsx`, `test/unit/reader-web/no-storage-at-boot.test.tsx` |
| SW routing, precache, chunk retry | `sw-routing`, `precache-manifest`, `retry-chunk-import` tests with the `src/sw/` code | ✅ | `test/unit/reader-web/sw-routing.test.ts`, `precache-manifest.test.ts`, `retry-chunk-import.test.tsx` over `apps/reader-web/src/sw/` |
| SSR bundle check + smoke after build | `pnpm smoke:ssr` (`scripts/check-ssr-bundle.ts`) | ✅ | `scripts/check-ssr-bundle.ts` (`pnpm smoke:ssr`) |
| Viewport/gesture integration | `test/integration/reader-viewport.test.tsx` | ✅ | `test/integration/reader-viewport.test.tsx` |
| Sanitization, session guard, telemetry | `sanitization.test.ts`, `session-expiry.test.ts`, `log-hygiene.test.ts` | ✅ | `test/unit/reader-web/sanitization.test.ts`, `test/unit/reader-web/session-expiry.test.ts`, `test/unit/reader-a2a/log-hygiene.test.ts` |
| i18n lint rules | `i18n-keys.test.ts` — English keys only, by decision | ✅ | `test/unit/reader-web/i18n-keys.test.ts` (+ `i18n-keys.allowlist.json`) |
| Typecheck, Prettier, coverage, size diff | `pnpm typecheck` (exists), repo pre-commit (already covers this folder), `test:coverage`, `pnpm size` with absolute budgets | ✅ | `pnpm typecheck`, `pnpm test:coverage`, `scripts/build-size.mjs` + `scripts/size-budgets.json` (`pnpm size`), `pnpm gate` |
| Theme snapshot | explicit asserts in `places-and-themes.test.ts` | ✅ | `test/unit/reader-web/places-and-themes.test.ts` |
| Puppeteer two-browser e2e | `pnpm smoke:session` + `smoke:reader-web` against the real room, and the manual two-browser pass | per run | `scripts/smoke/session.ts`, `scripts/smoke/reader-web.ts`, the B3 pass |

New here, with no old equivalent: live protocol smokes (`smoke:vault`, `smoke:svc`, `smoke:rebuild`), schema↔ontology↔skill skew tests (`seed-schema.ttl`, `pins`, `seed-protocol.context-ref`), authority tests (`wires`, `test/unit/reader-a2a/room-authority.test.ts` over `test/helpers/fakeAgentsSdk.ts`), the fixtures end to end (`test/integration/fixtures.test.ts`: a fake token, a highlight, a flush, the fake Library — `test/helpers/fakeHomeJwks.ts`, `fakeLibrary.ts`, `fakePersonAgent.ts`, `fakeWorkspace.ts`), and publishing without the Library reads (`test/unit/reader-a2a/publish-without-reads.test.ts`).

## Part A — build the harness

Order matters. `pnpm test` stays green after each step.

### A1. Runner (half a day)

1. From this folder: `pnpm add -D jsdom @testing-library/preact @vitest/coverage-v8`. The root `pnpm-lock.yaml` regenerates; that is the only file outside this folder that may change.
2. [`vitest.config.ts`](../vitest.config.ts): switch to **projects**.
   - `node`: today's include minus `test/unit/reader-web/components/**` and `test/**/*.tsx`.
   - `jsdom`: `test/unit/reader-web/components/**`, `test/unit/reader-web/**/*.tsx`, `test/integration/**/*.tsx`.
   - Both: the `@seed` alias, `esbuild` preact JSX, `setupFiles: ["test/setup/blockRealSockets.ts", "test/setup/blockRealFetch.ts"]`.
   - `coverage: { provider: "v8", reporter: ["text", "json-summary"], include: ["apps/**/src/**", "lib/**"] }`.
3. `test/setup/blockRealSockets.ts`: replace `globalThis.WebSocket` with a class that records the URL and throws; `afterEach` throws if anything was recorded. Error text: "stub `openRoom` in `backend/room.ts`".
4. `test/setup/blockRealFetch.ts`: wrap `globalThis.fetch`. Allow hosts `127.0.0.1`, `localhost`, `bible.helloao.org`, `vmfnri.helloao.org`, `search.seedbible.org`. Anything else: record, throw `"blocked fetch to <host> — the browser talks only to reader-a2a (ADR-0044); stub the backend"`, fail in `afterEach`. Export `allowHostForThisTest(host)` for fixtures that mount a fake agent.
5. `package.json`: `"test:coverage": "vitest run --coverage"`.

**Done when** `pnpm test` passes under both projects, and a scratch test doing `fetch("https://seed-bible-a2a.faithnet.io")` fails with the ADR message (delete the scratch test).

### A2. Fixtures (one day) — all in `test/helpers/`

| File | What it does |
| --- | --- |
| `createTestReaderState.ts` | `createReaderState({ backend, stores: memoryStores(), api, session, readDwellMs: 10, presenceBeatMs: 50 })` where `backend = createDevBackend(identity)` and `api` is from `bibleResponses.ts`. Options: `url` (set `location` before boot so `?embed=`, `?theme=`, `?customization=`, `/read/...` run for real), `identity` (`null` = anonymous), `offline`, `locale`. Returns `{ state, backend, stores }` so tests inspect `backend.buckets`, `backend.calls`, `backend.works`, `backend.registry`. |
| `bibleResponses.ts` | Response map for `BSB/books.json` and `BSB/JHN/3.json` (lift the fixture from `test/integration/cutover.test.ts`); helper to add chapters. |
| `TestHost.tsx` | Wraps children in the i18n provider from `apps/reader-web/src/i18n` with `en.json` loaded synchronously. |
| `pressAndRelease.ts`, `stubColorScheme.ts`, `fakeSpeechSynthesis.ts` | Copy from `test/unit/seed-bible/testUtils/` (pure DOM helpers, no CasualOS import). |
| `fakeLibrary.ts` | In-memory Library: `library.file.save` (re-save by id = new version; mint id otherwise; keep `accessPolicy` when omitted), `library.file.visibility`, `library.file.publish` (append-only, version-monotonic), `library.files.list`, `library.file.read`, `library.public.list` / `.read` ("unknown and not-public are one answer"). Copy `effectiveAccessPolicy` and `publicShelf` **verbatim** from `~/ap-home/apps/agent-runtime/src/library-tools.ts` (lines ~143–170) with a header noting source path and date; enforce `12_000` chars for text. |
| `fakePersonAgent.ts` | Hono app for `a2a.faithnet.io`: `/harness/ask` checks the wire the way `apps/reader-a2a/src/wires` does (reuse `syntheticAskAsMeWire` from `wires.ts`), runs the plan's `library.*` steps against `fakeLibrary`, returns a receipt; `/harness/progress` returns the finished line. Mount via `allowHostForThisTest`. |
| `fakeHomeJwks.ts` | ES256 pair with `jose`; `issueIdToken({ sub, iss: "https://www.faithnet.me", aud: "seed-bible-reader", exp })`; a `/jwks` handler; a `fetch` tests pass to `readerFromToken()`. |

**Done when** a new test signs in with a fake token, puts a highlight through `createTestReaderState`, flushes the outbox, and reads it back from `fakeLibrary` with no network — and `wires.test.ts`, `pins.test.ts` still pass.

### A3. Tests (three to four days), in this order

Name each file for the feature. Show each one red once (revert or stub the behaviour) before merging it green.

1. `test/unit/reader-web/outbox.test.ts` — full matrix: create; update unchanged; changed elsewhere → both kept + `seed:conflictOf`; deleted elsewhere; delete-after-edit asks; converge when already gone; same `opId` twice → one version; offline flush → one plan per bucket. Drive conflicts by mutating `backend.buckets` between two states (pattern in `two-devices.test.ts`).
2. `test/unit/reader-a2a/room-authority.test.ts` — `ReadingSession` (`apps/reader-a2a/src/rooms/ReadingSession.ts`) with a stubbed `currentConnection()`: stranger → 404; join token single-use; token expires at 5 min; non-leader `follow`/`decorate` throw; `setRole` host-only; stale presence frames dropped.
3. `test/unit/reader-web/session-expiry.test.ts` — expired id_token → re-connect prompt, outbox entries remain; `fakePersonAgent` answers "wire expired" → consent prompt, nothing lost, flush resumes after a new wire.
4. `test/unit/reader-web/i18n-keys.test.ts` — glob `apps/reader-web/src/**/*.{ts,tsx}`; regex `t("…"`, `t('…'`, `i18nKey="…"`; every key in `en.json`; every `en.json` key referenced (allowlist file for runtime-built keys). English only.
5. `test/unit/reader-web/hydration.test.tsx` (jsdom) — render with the `worker/` SSR function, set as `document.body`, call client `hydrate`; `MutationObserver` sees no change. Decline cases (URL mismatch, missing seed, build-id mismatch) → one client render, no throw.
6. `test/unit/reader-web/no-storage-at-boot.test.ts` — `Proxy` `localStorage`, `sessionStorage`, `indexedDB` to record access; `import()` every module under `state/**` and `backend/**`; `createReaderState()` up to `hydrate()`; assert zero accesses.
7. `sw-routing.test.ts`, `precache-manifest.test.ts`, `retry-chunk-import.test.ts` — with the `src/sw/` code (cutover step). Same case names as the old tests: app-shell navigation only on this origin, this build's hashed assets only, cache-busted re-import once, failed stylesheet replaced once.
8. `test/integration/reader-viewport.test.tsx` (jsdom) — mount via `createTestReaderState` + `TestHost`; scroll save/restore per tab (desktop, mobile); scroll-to-verse; swipe LTR/RTL changes chapter. Stub `getBoundingClientRect`.
9. `test/unit/reader-web/sanitization.test.ts` — extend `note-html.test.ts`: allowed tags kept, `<script>` dropped, handlers removed, `javascript:` neutralised, empty input → empty.
10. `test/unit/reader-a2a/log-hygiene.test.ts` — capture `console.*` during an in-process `/harness/ask` (`scripts/smoke.ts` pattern); assert no token, wire, or person SA in output.

**Done when** every "build" row in §1 has a file and `pnpm test` is green.

### A4. Scripts (one day)

- `scripts/check-ssr-bundle.ts` → `"smoke:ssr"`: after `pnpm build:web`, start the built Worker with wrangler `unstable_dev` on `apps/reader-web/wrangler.toml`; fetch `/read/BSB/JHN/3`; assert `<!doctype`, `og:title`, canonical, injected seed `<script type="application/json">`, non-empty root; grep the built worker for unresolved relative sibling imports. Non-zero on failure.
- `scripts/build-size.mjs` → `"size"`: read `dist/client/.vite/manifest.json`, gzip size per entry/chunk, compare to `scripts/size-budgets.json` (seed budgets = current + 15%); table; non-zero over budget.
- `package.json`: `"gate": "pnpm typecheck && pnpm test && pnpm build:web && pnpm smoke:ssr && pnpm size"`.

**Done when** `pnpm gate` passes locally.

### A5. Keep it honest

- Add a "file" column to the §1 table pointing at each test/smoke.
- A PR that adds a `feature-map.md` row names the test in the row.
- Copied ap-home functions keep their source header for re-diffing.

## Part B — run the tests

### B1. Every PR (local, ~10 min)

```bash
cd packages/seed-bible-ap
pnpm gate                       # typecheck, unit+integration, build, smoke:ssr, size
pnpm dev                        # second terminal: mcp :8890, a2a :8891, svc :8892, web :5185
pnpm smoke && pnpm smoke:vault && pnpm smoke:svc && pnpm smoke:rebuild && pnpm smoke:reader-web && pnpm smoke:session
```

Fail = any `✗`, non-zero exit, or a size budget exceeded. Paste the log on the PR. A bug fix carries one test, shown red first.

### B2. Every faithnet deploy

```bash
pnpm deploy:faithnet
A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:vault
A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:reader-web
A2A_BASE=https://seed-reader-a2a.faithnet.io SVC_BASE=https://seed-bible-a2a.faithnet.io ADMIN_TOKEN=… pnpm smoke:svc
SVC_BASE=https://seed-bible-a2a.faithnet.io ADMIN_TOKEN=… pnpm smoke:rebuild
A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:session
```

Then the manual pass (B3) on https://seed-reader.faithnet.io with two browsers (one normal, one private window, or two machines).

### B3. Manual pass — pass means the observable result

**A. Reading, no account**
- `/read/BSB/JHN/3` paints verse 16; DevTools Network shows only the Bible API host (`bible.helloao.org` or `vmfnri.helloao.org`), reader-a2a, and Typesense. Nothing to `mcp`, `seed-bible-a2a`, or `a2a.faithnet.io`.
- Change translation, book, chapter → URL changes; back/forward restores.
- Search a verse and a book name → both land on a chapter.
- Audio and TTS start/stop.
- Go offline (DevTools) after one visit, reload → chapter paints from cache.
- `?embed=minimal`, `?theme=`, `?customization=` apply. `curl -s https://seed-reader.faithnet.io/read/BSB/JHN/3 | grep -E 'og:title|canonical'` shows both; `/robots.txt`, `/sitemap.xml` answer.
- Change browser language / `?lang=fr` → UI language follows.

**B. Marks in the person's vault** (sign in as seedreader via Quick Connect)
- Highlight John 3:16 → visible at once; within a flush, "saved to your Library"; the Library shows `seed-bible/highlights/JHN/3.jsonld` with the item. Repeat the same highlight → no second version.
- Note (paste HTML with `<script>` and `onclick`) → rendered clean. Bookmark, save → in Your Content.
- Offline: create a note, edit another, delete a third; back online → all three converge, one run per bucket.
- Two devices edit the same note offline, both flush → conflict card, both bodies kept, "Keep this version" settles it.
- Sign in on a second browser as the same person → marks present. As a different Home account → absent.

**C. Social and publish**
- Friends pane matches the Home's friend list.
- Publish a note → appears in Discover / a friend's Today after the crawl; withdraw → gone.
- Circle-shared note → member sees it; the public shelf does not.
- New Home account with no wire → reading works; first highlight waits on the device; the account pane says the agent needs the reader behaviour and links to the Home.

**D. Live session, two browsers** (after `smoke:session`)
- Host starts a session; guest joins with the share code; a third browser with a wrong code → 404 / "not found".
- Host changes chapter → guest follows within a second. Host decorates a verse → guest sees the ribbon; guest's own highlight lands in the **guest's** Library.
- Guest (reader role) tries to change chapter for everyone → refused. Host sets guest to navigator → allowed.
- Chat appears on both sides. Expected today: it is room SQLite + broadcast, **not** an ap-home discussion-board message. Wipe the room (admin lane) → chat gone, `seed-bible/sessions/<id>.jsonld` still in the host's Library.
- A late joiner sees the current chapter and decorations immediately.

**E. Church, files, extensions**
- Playlist and plan save private; Publish → in the registry; plan progress stays private.
- Upload a file → served from the svc; paste a chapter link in a note → preview title.
- Compare / cross-references work with no key and no new network host.
- Study companion streams an answer and names the model; the Library is unchanged unless you save.
- Twitch / transcripts: **expected failing** until `seed.proxy.call` exists. Do not pass them with a browser-held key.

**F. Not signed off in this run** — 3D patterns, `obsolete/`, YouVersion login, huddle voice, chat on the discussion board, federation visitors.

### B4. Reporting

One PR comment or deploy note with: `pnpm gate` result, the six smoke results, and the B3 checklist with ✓/✗ per line and a one-line note for each ✗. File a `feature-map.md` row change for anything that moved from 🟡 to ✓.
