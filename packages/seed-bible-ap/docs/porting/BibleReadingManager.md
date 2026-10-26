# Porting `BibleReadingManager` (core reading)

Source (read-only): `packages/seed-bible/seed-bible/managers/BibleReadingManager.tsx` (3,700 lines),
`BibleDataManager.tsx`, `FreeUseBibleAPI.tsx`, `NavigationManager.tsx`.

| It did                                                             | With                                               | Now (`reader-web/src`)                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| fetch translations, books, a chapter; next/previous by API links   | `FreeUseBibleAPI` (HTTP, in-memory response cache) | `backend/bible.ts` — the API client copied whole (the one permitted third party); `state/reading/reading.ts` |
| serve downloaded translations offline                              | `OfflineTranslationsManager`, IndexedDB            | every chapter read is kept in the `chapters` store and served when the API is out of reach (`fromDevice`)    |
| `/read/<translation>/<book>/<chapter>` URL, history, base path     | `NavigationManager`, `ReadingUrlPath`              | `state/reading/route.ts` — the same path, `pushState` on navigation, `popstate` back                         |
| verse selection, selected footnote, loading / stale / error states | signals on `BibleReadingState`                     | `selection` in `state/index.ts`; `loading`, `error`, `fromDevice` on the reading state                       |
| tabs, panes, live-session decorations, presence, extensions' hooks | `TabsManager`, `PanesManager`, `SessionsManager`   | **not in this cut** — one reader column; tabs/panes and sessions come with their steps                       |
| last position across visits                                        | CasualOS reading position record                   | `state/records/position.ts` — a device preference; `seed:ReadingPosition` follows with history               |

Dropped: nothing CasualOS-specific remained here — the manager was already API-shaped. The 3,700 lines were mostly
tabs, panes, sessions and extension hooks, which belong to later steps.
