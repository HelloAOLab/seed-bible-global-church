# Porting `AnnotationsManager` (notes)

Source (read-only): `packages/seed-bible/seed-bible/managers/AnnotationsManager.tsx`, `AnnotationConflictModal`,
`CreateAnnotationForm`, `TipTapEditor`.

| CasualOS call it made                       | What it was for             | `ReaderBackend` / skill now                                                                                                                                                               |
| ------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordData` per annotation (TipTap JSON)   | one row per note            | `seed.annotation.put` — one `seed:Annotation` in the chapter bucket; the body is plain text in this cut                                                                                   |
| `listDataByMarker` by chapter               | the chapter's notes         | `seed.bucket.read { collection: annotations, chapter }`; `state/records/annotations.ts` `forChapter`                                                                                      |
| `eraseData`                                 | delete                      | a tombstone through the same put                                                                                                                                                          |
| last-write-wins + `AnnotationConflictModal` | two devices edited one note | `seed.bucket.merge` keeps both with `conflictOf` **only when neither edit supersedes the other** (ADR-0008); the notes pane shows the pair and "Keep this version" settles it (`resolve`) |
| `RecordSyncManager` offline queue           | notes made offline          | the outbox (ADR-0008)                                                                                                                                                                     |

Every edit carries `seed:supersedes` (the opId it was made from) — the one thing the old manager did not have to
say, because CasualOS had a single server copy.

Dropped for now: TipTap (rich text) — the editor is a textarea until the TipTap port lands; replies (`replyTo`) and
tags are in the schema and not in the UI yet.
