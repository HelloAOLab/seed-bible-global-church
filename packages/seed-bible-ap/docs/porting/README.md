# Porting notes

One file per manager in `packages/seed-bible/seed-bible/managers/` (read-only source). Each note records:

- the CasualOS calls the manager made (`getData`, `recordData`, `listDataByMarker`, `getSharedDocument`, `recordProxy`, …) and the markers it used
- the `ReaderBackend` method that replaces each call, and the `skill:seed/*` it maps to on the person or org agent
- what moved to the serving plane, to the room, or to Home (friends, invitations)
- what was dropped, with the reason (e.g. legal acceptance never persisted; `publicRead` on private items)

Template: `_template.md`. Order of porting follows [`feature-map.md`](../architecture/feature-map.md).

Step 9: [`OnboardingAboutEmbedAndMap.md`](./OnboardingAboutEmbedAndMap.md). Core-reader second cut: [`ReadingHistoryManager.md`](./ReadingHistoryManager.md).
