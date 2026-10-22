// THE BUCKET STORE — the read model every record manager shares. A bucket is opened once per key and held in a
// signal: the device's copy first (instant, offline), then the reader's Library copy merged in when signed in and
// online. A local put applies at once, is saved to the device and queued in the outbox; the flush brings the
// merged bucket back. Marks a stranger makes are held by LOCAL_AGENT and adopted when they sign in.
import { signal, type Signal } from "@preact/signals";
import {
  applyPut,
  emptyBucket,
  mergeBuckets,
  serialize,
  type BucketDocument,
  type Collection,
} from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";
import { BackendError, type ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { storeKey, type Outbox } from "../../backend/offline/outbox";
import { agentAddress } from "./marks";

/** `heldBy` of a mark made before signing in — never a real agent. */
export const LOCAL_AGENT = "0x0000000000000000000000000000000000000000";

/**
 * The bucket with every anonymous mark made the reader's: fresh opIds so the Library takes them, updatedAt now.
 * Null when nothing needed adopting. Marks held by anyone else are left as they are (the workspace refuses them).
 */
export function adoptBucket(
  bucket: BucketDocument,
  agent: string,
  newId: () => string,
  now = () => new Date().toISOString()
): BucketDocument | null {
  const mine = agentAddress(agent);
  let changed = false;
  const graph = bucket["@graph"].map((it) => {
    if (agentAddress(it.heldBy) !== LOCAL_AGENT) return it;
    changed = true;
    return { ...it, heldBy: mine, opId: newId(), updatedAt: now() };
  });
  return changed ? { ...bucket, "@graph": graph } : null;
}

export interface BucketStoreDeps {
  backend: ReaderBackend;
  stores: ReaderStores;
  outbox: Outbox;
  newId?: () => string;
  isOnline?: () => boolean;
}

export interface OpenBucket {
  bucket: Signal<BucketDocument>;
  /** "device" until the Library copy was merged in this session; "library" after; "local" for a stranger. */
  source: Signal<"device" | "library" | "local">;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  /** Settles when the first load (device copy, then the Library's when signed in and online) is done. */
  ready: Promise<void>;
}

export function createBucketStore(deps: BucketStoreDeps) {
  const open = new Map<string, OpenBucket>();
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const isOnline =
    deps.isOnline ??
    (() =>
      typeof navigator === "undefined" ? true : navigator.onLine !== false);

  function get(collection: Collection, chapter?: string): OpenBucket {
    const k = storeKey(collection, chapter);
    let ob = open.get(k);
    if (!ob) {
      ob = {
        bucket: signal(emptyBucket(collection, chapter)),
        source: signal<"device" | "library" | "local">("local"),
        loading: signal(true),
        error: signal(null),
        ready: Promise.resolve(),
      };
      open.set(k, ob);
      ob.ready = load(collection, chapter, ob);
    }
    return ob;
  }

  async function load(
    collection: Collection,
    chapter: string | undefined,
    ob: OpenBucket
  ) {
    const k = storeKey(collection, chapter);
    ob.loading.value = true;
    try {
      const local = await deps.stores.buckets.get(k);
      if (local) {
        ob.bucket.value = local;
        ob.source.value = "device";
      }
      const who = deps.backend.identity();
      if (!who) {
        ob.source.value = "local";
        return;
      }
      if (!isOnline()) return;
      const remote = await deps.backend.readBucket(collection, chapter);
      const { bucket: merged } = mergeBuckets(remote, ob.bucket.value);
      ob.bucket.value = merged;
      ob.source.value = "library";
      await deps.stores.buckets.set(k, merged);
      // The device held something the Library did not — a change made offline or before sign-in — so it goes up.
      if (serialize(merged) !== serialize(remote))
        await deps.outbox.queue(collection, chapter, `resync-${newId()}`);
      ob.error.value = null;
    } catch (e) {
      ob.error.value = e instanceof Error ? e.message : String(e);
      if (!(e instanceof BackendError) || e.code === "unavailable")
        console.warn("[buckets]", k, e);
    } finally {
      ob.loading.value = false;
    }
  }

  /** The idempotent put, applied at once on this device and queued for the reader's Library. */
  async function put(
    collection: Collection,
    chapter: string | undefined,
    item: BucketItem
  ) {
    const ob = get(collection, chapter);
    const out = applyPut(ob.bucket.value, item);
    if (!out.changed) return;
    ob.bucket.value = out.bucket;
    await deps.stores.buckets.set(storeKey(collection, chapter), out.bucket);
    await deps.outbox.queue(collection, chapter, item.opId);
  }

  /** The outbox's merged bucket is the new truth for that key. */
  function accept(
    collection: Collection,
    chapter: string | undefined,
    bucket: BucketDocument
  ) {
    const ob = open.get(storeKey(collection, chapter));
    if (!ob || !bucket) return;
    ob.bucket.value = bucket;
    ob.source.value = "library";
  }

  /**
   * On sign-in: marks made as a stranger become the reader's (fresh opIds so the Library takes them), every open
   * bucket is re-read and merged, and the outbox is flushed.
   */
  async function resync(now = () => new Date().toISOString()) {
    const who = deps.backend.identity();
    if (who) {
      // Every bucket this device holds — open in this session or kept from an earlier one — gives its anonymous
      // marks to the reader and goes up.
      for (const k of await deps.stores.buckets.keys()) {
        const stored = await deps.stores.buckets.get(k);
        if (!stored) continue;
        const adopted = adoptBucket(stored, who.agent, newId, now);
        if (!adopted) continue;
        const [collection, chapter] = splitKey(k);
        await deps.stores.buckets.set(k, adopted);
        const ob = open.get(k);
        if (ob) ob.bucket.value = adopted;
        await deps.outbox.queue(collection, chapter, `adopt-${newId()}`);
      }
    }
    for (const [k, ob] of open) {
      const [collection, chapter] = splitKey(k);
      await load(collection, chapter, ob);
    }
    if (who) await deps.outbox.flush();
  }

  /** Forget the open signals (sign-out): the device copies stay, the next open reads them again. */
  function reset() {
    open.clear();
  }

  return { get, put, accept, resync, reset };
}

export type BucketStore = ReturnType<typeof createBucketStore>;

function splitKey(k: string): [Collection, string | undefined] {
  const i = k.indexOf(":");
  const collection = k.slice(0, i) as Collection;
  const rest = k.slice(i + 1);
  return [collection, rest === collection ? undefined : rest];
}
