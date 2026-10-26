# ADR-0008: The device read model, the outbox, and `seed:supersedes`

**Status:** accepted (2026-10-22) — settles hard-problems §1 (read model), §2 (coalescing), §3 (what a conflict is)
and §13 (offline) for the core reader.

## Context

The UI must open a chapter with its marks in well under a second, offline too, while every write is a harness run on
the reader's own agent that takes seconds. Two devices can edit one chapter bucket while apart. The Library has no
change feed and a bucket save does not reject a stale base.

## Decision

1. **IndexedDB is what the UI reads** (`reader-web/src/backend/offline/db.ts`): four key-value stores — `buckets`
   (a copy of every bucket opened), `outbox` (buckets changed on this device), `chapters` (text read), `prefs`. A
   bucket is a signal: the device copy first, then the Library's merged in when signed in and online
   (`state/records/buckets.ts`). The vault stays the record; the stores are a cache plus a queue.
2. **The outbox is keyed by bucket, not by item.** However many marks are made while apart, going back online
   flushes ONE `seed.bucket.merge` run per bucket, the device's bucket going up whole (`offline/outbox.ts`). The
   entry keeps a `batchId` so a retry replays the same opId and is idempotent; changes queued while a run is in
   flight start a new batch. The merge receipt always carries the merged bucket, which the device takes as truth.
3. **A stranger's marks are held by `0x0…0` and adopted at sign-in** (hard-problems §6): fresh opIds, the
   reader's agent as `heldBy`, queued, flushed.
4. **`seed:supersedes` makes an edit distinguishable from a concurrent edit.** Every note edit names the `opId` it
   was made from. The merge (`lib/library-client`, `skill:seed/bucket-merge` 0.2.0) takes an incoming note whose
   `supersedes` is the current `opId` as a plain update, keeps the current one when IT supersedes the incoming,
   and keeps both flagged `conflictOf` only when neither saw the other. Without it every edit was a conflict.
5. **The Bible text is the one third party the browser calls** (`backend/bible.ts`, ported FreeUseBibleAPI); every
   chapter read is kept in `chapters` so it reads again offline, and the reader says so (`fromDevice`).

## Consequences

- `ReaderBackend` has three methods (`readBucket`, `putMark`, `mergeBucket`) and `identity()`; `state/` imports
  nothing else for I/O. `backend/dev.ts` is the same contract in memory and records calls, which is how the tests
  assert "one run per bucket" and the two-device merge.
- Reading position is a device preference for now; `seed:ReadingPosition` in the Library follows with reading
  history.
- The manifest-as-change-feed (§13) is not consulted yet: an open bucket is re-read on sign-in and on demand. Fine
  for a handful of open chapters; the manifest read comes with the Today pane.
- Proof: `pnpm test` (outbox, two devices, reading, chapter markup) and `pnpm smoke:reader-web` against faithnet.
