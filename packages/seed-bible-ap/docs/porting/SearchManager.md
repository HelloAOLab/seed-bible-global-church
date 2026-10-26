# Porting `SearchManager`

Source (read-only): `packages/seed-bible/seed-bible/managers/SearchManager.tsx`, `bookNameMatch.ts`,
`parseVerseReference.ts`, `verseReferenceSyntax.ts`, `verseReferenceBounds.ts`, `bookChapterVerseCounts.ts`.

| It did                                                           | Now                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Typesense client (lazy, ~150 KB) → `search.seedbible.org`        | `backend/search.ts` — one GET per query with the search-only key from `VITE_TYPESENSE_SEARCH_KEY` (`.env`) |
| `bibleVerses.<language>` collection, filtered to the translation | the same collection and filter                                                                             |
| typed reference → chapter (book names, numbers, bounds)          | `lib/scripture` — the pure parser ported verbatim, decoupled from the API type (`TranslationBookLike`)     |

The browser calls Typesense directly, as the work order excepts; the key is search-only and the shipped app already
publishes it in its bundle. No CasualOS was involved. `components/records/YourContentPane.tsx` holds the search box.
