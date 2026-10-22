# ADR-0007: The Seed registry is a rebuildable index over public shelves

**Status:** accepted (2026-10-21) — settles hard-problems §12 for the first cut.

## Context

Discover and Today need "every public offering for John 3" across many shelves. The town graph holds only
markdown passages. Owners publish structured `seed:Offering` descriptors to their own public shelves; nothing
central may author them.

## Decision

1. **`seed-bible.svc` crawls shelves it is configured with** (`shelves` table: `seedreader.me`, `seed-reader.org`
   to start; town discovery to find more is later). Each crawl lists the owner's `seed-bible/public` folder through
   the estate's public door (`https://edge.faithnet.io/api/a2a/<name>`, a standard `SendMessage` whose data part
   names `library.public.list` / `library.public.read` — no credential, no task; `lib/a2a-client`).
2. **Only a released, signed `seed:Offering` the owner published is indexed.** A JSON-LD document with no release,
   or an unsigned one, or whose `publishedBy` is not the shelf's owner, or that does not fit the `Offering` shape,
   is skipped and the reason logged per crawl (`crawl_log.skipped`). The release's own version is semver and the
   Library entry's version an integer; they are not compared.
3. **Withdrawal is a tombstone.** A document the shelf no longer lists gets `withdrawn_at`; queries exclude it;
   a later crawl that finds it again clears the tombstone. Withdrawal on the owner's side is the descriptor made
   private again (`seed.publish.slice { withdraw }`).
4. **Rebuildable by construction.** `POST /admin/wipe` drops every derived row (never the shelves — configuration);
   `POST /admin/reindex` (also a 15-minute cron) rebuilds them from the same shelves. The svc smoke wipes and
   re-crawls with a row present and compares; the rebuild smoke does the same standalone.
5. **Publishing is a plan over the Home's own skills.** `seed.publish.slice` on reader-a2a saves the descriptor
   and a markdown rendering **public** under `seed-bible/public/<kind>/<slug>` and mints a release of each
   (`library.file.save` with `accessPolicy: public`, `library.file.publish`), all over the reader's ask-as-me wire.
   The workspace's `seed.workspace.discover` reads the registry by passage over the `PLATFORM` binding.

## Consequences

- The browser never reaches the registry: reader-web asks reader-a2a, which asks the svc.
- Verification today is "the shelf reports a signed release"; checking the release signature against the owner's
  account (ERC-1271) and the content commitment is a follow-up before Discover shows strangers' shelves.
- R2 was enabled on the account and the bucket `seed-bible-files` created 2026-10-22 (bound as `FILES` on `seed-bible.svc`); the file lane itself is step 7.
- Crawl budget: full re-crawl of every registered shelf each run; fine at this scale, incremental keyed by
  `(owner, entryId, version, releaseId)` when it is not.
