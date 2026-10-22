# Porting `ReadingHistoryManager` (core-reader, second cut)

Source (read-only): `managers/ReadingHistoryManager.tsx`, `ReadingHistoryTimeline`, `TodayManager`'s recent reading.

| It did                                                                | Now                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recordData` one reading-history record per chapter open, per user    | one `seed:ReadingEvent` per reader, chapter and day as an item of `seed-bible/history/<BOOK>/<ch>.jsonld`; a second look the same day extends `endedAt`       |
| the open counted at once                                              | the chapter must stay open `READ_DWELL_MS` (8 s) — flipping through chapters writes nothing                                                                   |
| `listDataByMarker` for the user's history (timeline, Today, heat map) | the device's history buckets (`history.recent`, `history.heat`); another device's reads arrive through `buckets.pullAll()` after sign-in (`seed.bucket.list`) |
| `ReadingPosition` across devices                                      | not written yet; Today's **Recent reading** covers the use (the newest event is where you were)                                                               |
| the timeline view                                                     | not ported; the Scripture map's shading and Today's chips are the first cut                                                                                   |

The event carries `heldBy` like every mark (the ontology shape now requires it, `wasAssociatedWith` is optional), so
`bucket-merge` 0.3.0 covers it and a stranger's reads adopt at sign-in like highlights. The cost is one harness run
per chapter read per day (the outbox coalesces repeat looks), the same trade as marks (hard-problems §15).
