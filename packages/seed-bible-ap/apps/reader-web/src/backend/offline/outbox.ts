// THE OUTBOX (hard-problems §2): a bucket changed on this device is queued by its key, not by item, so going back
// online flushes ONE merge run per bucket however many marks were made — the device's bucket goes up whole and
// the reader's agent merges it at item level. A flush that fails keeps the entry; a retry replays the same batch
// id and is idempotent on the far side.
import { signal } from "@preact/signals";
import type { Collection } from "@seed/library-client";
import { bucketKey, type BucketDocument } from "@seed/library-client";
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
  let inflight: Promise<FlushReport> | null = null;
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
    const entry: OutboxEntry = cur
      ? { ...cur, opIds: [...cur.opIds, opId] }
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
    for (const k of await deps.stores.outbox.keys()) {
      const entry = await deps.stores.outbox.get(k);
      const local = await deps.stores.buckets.get(k);
      if (!entry) continue;
      if (!local) {
        await deps.stores.outbox.delete(k);
        report.skipped.push(k);
        continue;
      }
      try {
        const merged = await deps.backend.mergeBucket(
          entry.collection,
          entry.chapter,
          local,
          entry.batchId
        );
        await deps.stores.buckets.set(k, merged);
        // Changes queued while this run was in flight start a new batch; only this one is done.
        const again = await deps.stores.outbox.get(k);
        if (again && again.batchId === entry.batchId)
          await deps.stores.outbox.delete(k);
        deps.onMerged?.(entry.collection, entry.chapter, merged);
        report.merged.push(k);
        lastError.value = null;
      } catch (e) {
        report.error = e instanceof Error ? e.message : String(e);
        lastError.value = report.error;
        if (e instanceof BackendError && e.code !== "refused") break;
      }
    }
    await count();
    return report;
  }

  function flush(): Promise<FlushReport> {
    if (inflight) return inflight;
    flushing.value = true;
    inflight = flushOnce().finally(() => {
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

  return { queue, flush, start, pending, flushing, lastError };
}

export type Outbox = ReturnType<typeof createOutbox>;
