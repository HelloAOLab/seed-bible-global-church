# ADR-0006: Chapter buckets, manifests, and the vault path over the reader's own agent

**Status:** accepted (2026-10-21) — settles hard-problems §1, §2 and the read half of §1a; §3's merge lives in the same code.

## Context

The Library is a catalog of documents (12,000-character text cap, no query, no changed-since), and every write is a
harness act on the person's agent. The old app had `listDataByMarker`. A reader opening a chapter needs that
chapter's marks fast, offline too, and a highlight must not cost a second of UI latency.

## Decision

1. **One JSON-LD document per `(collection, book, chapter)`** — `seed-bible/highlights/JHN/3.jsonld`, a `@graph` of
   `seed:` records; bookmarks and saves keep one document per collection. A per-collection
   `seed-bible/<collection>/_manifest.jsonld` (bucket → Library version, count, updatedAt) is the index and the
   change feed. Shapes: `lib/seed-schema`; paths, parsing and the pure operations: `lib/library-client`.
2. **Idempotent by `opId`.** Every record carries the `seed:opId` of the act that last wrote it; a put whose opId is
   already in the bucket changes nothing and saves nothing (`applyPut`). The live smoke proves it: a re-put reports
   `changed: false` and the Library's version does not move.
3. **The workspace reads, merges and re-saves through the reader's agent.** reader-a2a (`skills/vault.ts`) asks the
   reader's agent `library.file.read` for the bucket, applies the put or the item-level merge locally, and asks
   `library.file.save` by id (a new version) for the bucket and then the manifest — four supplied-plan runs per
   changed mark, each admitted under the reader's ask-as-me wire. The workspace never holds the record between
   calls and never writes as itself. The merge rule is `mergeBuckets` in `lib/library-client`, also exposed by
   reader-mcp as the pure tool `bucket_merge`.
4. **The read lane is the person's playbook, not a vault credential (§1a).** ap-home's harness offers the Library
   _reads_ only from a playbook that carries them (`harness-run.ts`: `LIBRARY_TOOLS` non-acts are merged from
   `playbook.tools`); the _saves_ are always offered. A reader therefore needs a playbook with
   `library.file.read` — today the estate's `person-steward` baseline, assigned at first run
   (`scripts/assign-playbook.mjs`, the Home's `archetypeAssignmentPut` with the person's own session). No reader-mcp
   vault credential exists or is wanted.

## Consequences

- Latency is seconds per changed mark (four runs). The UI must stay optimistic with an outbox (step 4); the manifest
  write amplification is accepted until measured (§13).
- A reader with no playbook can save but not read; first-run assignment is part of consent (§5). The `seed-reader`
  archetype cannot replace `person-steward` yet: the registry compiles each skill's first `tools:` entry as the tool
  id, so five seed skills collide on `library.file.read` and the harness validator would refuse the definition.
  Composing the seed pack onto the person baseline is an open question for the estate.
- Reading history and events are bucketed by month (same shape), not implemented yet.
- A refused read of a missing document ("no document named …") is an empty shelf, never an error.
