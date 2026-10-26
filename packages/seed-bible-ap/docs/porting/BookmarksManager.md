# Porting `BookmarksManager`

Source (read-only): `packages/seed-bible/seed-bible/managers/BookmarksManager.tsx`, `components/Bookmarks`.

| CasualOS call it made                | What it was for                  | `ReaderBackend` / skill now                                                                            |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `recordData` per bookmark            | a named, coloured chapter marker | `seed.bookmark.put` — one `seed:Bookmark` in the single bucket `seed-bible/bookmarks/bookmarks.jsonld` |
| `listDataByMarker` (all bookmarks)   | the Today list, the chapter dot  | `seed.bucket.read { collection: bookmarks }`; `state/records/bookmarks.ts` `all` / `onChapter`         |
| `eraseData`, move to another chapter | remove / move                    | a tombstone, then a put with the new chapter                                                           |

In this cut a bookmark is the chapter's toggle (the header button); names, colours and the move hint return with the
Today pane. `seed:Bookmark` has `bookmarkName`; colour is not in the schema yet (a `~/skills` ontology addition when
it comes).
