# Porting `SavesManager`

Source (read-only): `packages/seed-bible/seed-bible/managers/SavesManager.tsx`, the Save buttons in the reader
header and verse toolbar, the Saves section of `YourContentPane`.

| CasualOS call it made                  | What it was for                           | `ReaderBackend` / skill now                                                                             |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| one `recordData` payload under `saves` | every save, with its categories (folders) | `seed:Save` items in the single bucket `seed-bible/saves/saves.jsonld`, flushed by `seed.bucket.merge`  |
| `verse` as a number or `[start, end]`  | a chapter save vs. a verse-range save     | `aboutPassage`: `JHN.3` for the chapter, `JHN.3.16-JHN.3.18` for the range; `ofEdition` the translation |
| categories, default folder, refiling   | folders in Your Content                   | **not yet** — `seed:Save` has `label` only; folders need an ontology addition                           |
| offline queue via `RecordSyncManager`  | saves made offline                        | the outbox (ADR-0008)                                                                                   |

There is no `seed.save.put` skill yet (the first skill set has none), so a save reaches the Library only through the
bucket merge — which is the only path the UI uses anyway. `state/records/saves.ts`; the header's Save button, the
verse toolbar's Save action, and the Saves section of the content pane.
