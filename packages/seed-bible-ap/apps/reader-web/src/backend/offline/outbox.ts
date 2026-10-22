// THE OUTBOX (hard-problems §2): a bucket changed on this device is queued by its key, not by item, so going back
// online flushes ONE merge run per bucket however many marks were made — the device's bucket goes up whole and
// the reader's agent merges it at item level. A flush that fails keeps the entry; a retry replays the same batch
// id and is idempotent on the far side.
import { signal } from "@preact/signals";
import type { Collection } from "@seed/library-client";
import { applyPut, bucketKey, type BucketDocument } from "@seed/library-client";
import { BackendError, type ReaderBackend } from "../ReaderBackend";
import type { OutboxEntry, ReaderStores } from "./db";

export interface FlushReport {
  merged: string[];
  skipped: string[];
  error?: string;
}

export interface OutboxDeps {
  backend: ReaderBackend;
  stores: ReaderStores;
  /** The merged bucket, after a successful run — the read model takes it as the new truth. */
  onMerged?: (
    collection: Collection,
    chapter: string | undefined,
    bucket: BucketDocument
  ) => void;
  isOnline?: () => boolean;
  newId?: () => string;
  now?: () => string;
  /** How long to coalesce further local changes before the flush runs (ms). */
  settleMs?: number;
  /** Given a bucket the workspace refused for an item not held by the reader, the bucket set right — or null. */
  repair?: (
    collection: Collection,
    chapter: string | undefined,
    bucket: BucketDocument
  ) => BucketDocument | null;
}

/** The merged bucket with every device item it does not carry yet (by opId) put back on top. */
export function foldUnsent(
  merged: BucketDocument,
  device: BucketDocument
): BucketDocument {
  const sent = new Set(merged["@graph"].map((it) => it.opId));
  let out = merged;
  for (const it of device["@graph"])
    if (!sent.has(it.opId)) out = applyPut(out, it).bucket;
  return out;
}

export const storeKey = (collection: Collection, chapter?: string) =>
  `${collection}:${bucketKey(collection, chapter)}`;

export function createOutbox(deps: OutboxDeps) {
  const isOnline =
    deps.isOnline ??
    (() =>
      typeof navigator === "undefined" ? true : navigator.onLine !== false);
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const settleMs = deps.settleMs ?? 400;
  const pending = signal(0);
  const flushing = signal(false);
  const lastError = signal<string | null>(null);
  /** The last error's kind (a BackendError code, else "error"); null once a flush goes through. */
  const lastErrorCode = signal<BackendError["code"] | "error" | null>(null);
  let inflight: Promise<FlushReport> | null = null;
  /** A flush was asked for while one was in flight. */
  let again = false;
  /** The pass started beside a flush in flight, for the buckets it is not sending. */
  let beside: Promise<unknown> | null = null;
  /** The buckets whose batch a run is sending right now. */
  const sending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const count = async () => {
    pending.value = (await deps.stores.outbox.keys()).length;
  };

  async function queue(
    collection: Collection,
    chapter: string | undefined,
    opId: string
  ) {
    const k = storeKey(collection, chapter);
    const cur = await deps.stores.outbox.get(k);
    // A bucket whose batch is on its way gets a NEW batch id: the run in flight will finish and drop its own
    // entry by id, and this change must still go up after it.
    const entry: OutboxEntry = cur
      ? {
          ...cur,
          ...(sending.has(k) ? { batchId: newId() } : {}),
          opIds: [...cur.opIds, opId],
        }
      : {
          collection,
          ...(chapter ? { chapter } : {}),
          batchId: newId(),
          queuedAt: now(),
          opIds: [opId],
        };
    await deps.stores.outbox.set(k, entry);
    await count();
    schedule();
  }

  function schedule() {
    if (!isOnline() || !deps.backend.identity()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, settleMs);
  }

  async function flushOnce(): Promise<FlushReport> {
    const report: FlushReport = { merged: [], skipped: [] };
    if (!deps.backend.identity()) {
      report.error = "signed out";
      return report;
    }
    // A flush scheduled before the device went offline must not run now: the entries wait for the next online.
    if (!isOnline()) {
      report.error = "offline";
      return report;
    }
    // Buckets go up side by side (a few at a time): each is one merge at the reader's agent, seconds long, and one
    // bucket never waits for another's. A failure other than a refusal stops new sends (the network or the session).
    let stopped = false;
    await eachLimited(
      await deps.stores.outbox.keys(),
      FLUSH_CONCURRENCY,
      async (k) => {
        // A bucket another pass is sending now is that pass's (its change queued meanwhile gets the pass after it).
        if (stopped || sending.has(k)) return;
        const entry = await deps.stores.outbox.get(k);
        const local = await deps.stores.buckets.get(k);
        if (!entry) return;
        if (!local) {
          await deps.stores.outbox.delete(k);
          report.skipped.push(k);
          return;
        }
        sending.add(k);
        try {
          let merged: BucketDocument;
          try {
            merged = await deps.backend.mergeBucket(
              entry.collection,
              entry.chapter,
              local,
              entry.batchId
            );
          } catch (e) {
            const fixed =
              e instanceof BackendError && /not held by/i.test(e.message)
                ? deps.repair?.(entry.collection, entry.chapter, local)
                : null;
            if (!fixed) throw e;
            await deps.stores.buckets.set(k, fixed);
            merged = await deps.backend.mergeBucket(
              entry.collection,
              entry.chapter,
              fixed,
              `${entry.batchId}-repaired`
            );
          }
          // Changes made on the device while this run was in flight are not in `merged`: fold them back on top,
          // or the merged copy would overwrite them (they stay queued and go up with the next batch).
          const latest = await deps.stores.buckets.get(k);
          if (latest) merged = foldUnsent(merged, latest);
          await deps.stores.buckets.set(k, merged);
          // Changes queued while this run was in flight start a new batch; only this one is done.
          const again = await deps.stores.outbox.get(k);
          if (again && again.batchId === entry.batchId)
            await deps.stores.outbox.delete(k);
          deps.onMerged?.(entry.collection, entry.chapter, merged);
          report.merged.push(k);
          lastError.value = null;
          lastErrorCode.value = null;
        } catch (e) {
          report.error = e instanceof Error ? e.message : String(e);
          lastError.value = report.error;
          lastErrorCode.value = e instanceof BackendError ? e.code : "error";
          if (e instanceof BackendError && e.code !== "refused") stopped = true;
        } finally {
          sending.delete(k);
        }
      }
    );
    await count();
    return report;
  }

  function flush(): Promise<FlushReport> {
    if (inflight) {
      // A change queued while a flush is on its way is not in it: one more pass when this one ends — and a change to
      // ANOTHER bucket goes up now, beside it, rather than waiting for a pass that may take seconds.
      again = true;
      if (!beside)
        beside = flushOnce()
          .catch(() => undefined)
          .finally(() => {
            beside = null;
          });
      return inflight;
    }
    flushing.value = true;
    inflight = (async () => {
      let report = await flushOnce();
      while (again && !report.error) {
        again = false;
        report = await flushOnce();
      }
      again = false;
      return report;
    })().finally(() => {
      inflight = null;
      flushing.value = false;
    });
    return inflight;
  }

  /** Listen for the network coming back; returns the cleanup. */
  function start(): () => void {
    void count();
    if (typeof window === "undefined") return () => {};
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    if (isOnline()) schedule();
    return () => window.removeEventListener("online", onOnline);
  }

  return { queue, flush, start, pending, flushing, lastError, lastErrorCode };
}

export type Outbox = ReturnType<typeof createOutbox>;

/** How many buckets go up at once. */
const FLUSH_CONCURRENCY = 3;

/** Run `fn` over `items`, at most `limit` at a time; resolves when all have finished. */
export async function eachLimited<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}
