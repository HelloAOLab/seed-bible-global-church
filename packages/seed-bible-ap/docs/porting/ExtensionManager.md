# Porting `ExtensionManager` and the extensions (step 8, first cut)

Source (read-only): `managers/ExtensionManager.tsx`, `BibleReadingExtensionManager`, `ExtensionSettingsManager`,
`packages/*-extension`.

| It did                                                                  | Now                                                                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `registerExtension({ id, init })`, `init` yields cleanups               | the same contract in `reader-web/src/extensions/host`: `init(context)` yields cleanups; install runs it, disable runs them         |
| extensions contributed tools, panes, Discover providers, chat providers | `context.tools.registerVerseTool`, `context.discover.registerProvider`, `context.toolbar.add`, `context.panes.register/open/close` |
| extension settings and sensitive settings in CasualOS records           | the enabled set on the device (`extensions:enabled`); per-extension settings and `seed:ExtensionBinding` in the vault later        |
| extensions loaded from `.aux` bundles                                   | built-ins registered at boot (`extensions/index.ts`); loading third-party bundles is not in this cut                               |

| Extension (today)                       | Path on the estate                                                                                                                                                                                        | Status                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| compare                                 | browser-local, the Bible API only (`extensions/compare`)                                                                                                                                                  | ✓                                       |
| references                              | browser-local, the open cross-reference dataset on the Bible API host, cached on the device (`extensions/references`)                                                                                     | ✓                                       |
| locations                               | browser-local gazetteer in Discover (`extensions/locations`); the map portal is not ported                                                                                                                | ✓ (no map)                              |
| Bonfire                                 | the study companion: `POST /companion/ask` on reader-a2a (signed in) → `POST /companion` on `seed-bible.svc` → Workers AI, streamed back as SSE; the pane names the answerer (`seed-bible.svc · <model>`) | ✓ (estate model, not Bonfire's service) |
| audio-reader                            | the built-in player (step 4)                                                                                                                                                                              | ✓ (built in)                            |
| Apologist, theographic, default-content | org offerings through the registry — waits on the org publisher (§11)                                                                                                                                     | ⬜                                      |
| external MCP                            | a connector on the person agent (ap-home) — not yet                                                                                                                                                       | ⬜                                      |
| transcripts, Twitch                     | need `seed.secret.use` + an outbound allowlist (§10) — last, by design                                                                                                                                    | ⬜                                      |
| refresh example                         | the host's contract is the example                                                                                                                                                                        | —                                       |

Rules kept: the browser calls no third party with a key; the companion's model runs on the serving plane behind the
workspace's shared token; a stranger cannot ask it.
