# Porting `HighlightsManager` (and the shape every mark manager follows)

Source (read-only): `packages/seed-bible/seed-bible/managers/HighlightsManager.tsx`.

| CasualOS call it made                                    | What it was for                       | `ReaderBackend` / skill now                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordData` under `publicRead:highlights/{translation}` | one row per highlight, world-readable | `seed.highlight.put` — one item in the chapter bucket `seed-bible/highlights/<BOOK>/<ch>.jsonld`, **private**, written by the reader's own agent (`library.file.save` over the ask-as-me wire) |
| `listDataByMarker` by address prefix                     | "all highlights in John 3"            | `seed.bucket.read { collection: highlights, chapter }` — one read per chapter; the manifest says which buckets moved                                                                           |
| `eraseData`                                              | delete a highlight                    | a tombstone item (`deleted: true`, new opId, updatedAt) through the same put; `bucket-merge` applies later-wins                                                                                |
| local IndexedDB cache + `RecordSyncManager`              | offline-first, adopt-on-sign-in       | unchanged role: the IDB read model and outbox in `reader-web/src/backend/offline` (step 4)                                                                                                     |

Dropped: `publicRead` by default (visibility is a decision — `seed.publish.slice`); per-translation markers (the
edition is a field, `ofEdition`); the CasualOS record name/marker (the Library path is the address).

Landed in step 2: the record shape (`lib/seed-schema` `Highlight`), the bucket client (`lib/library-client`), the
workspace tool (`reader-a2a/src/skills`), the live proof (`scripts/smoke/vault.ts`). The UI port is step 4.
`AnnotationsManager`, `BookmarksManager`, `SavesManager` follow the same table with their own collection; a note
adds the two-device body conflict (`conflictOf`), a bookmark keeps one document for the whole collection.
