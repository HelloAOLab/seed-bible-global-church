// THE BUCKET STORE — the read model every record manager shares. A bucket is opened once per key and held in a
// signal: the device's copy first (instant, offline), then the reader's Library copy merged in when signed in and
// online. A local put applies at once, is saved to the device and queued in the outbox; the flush brings the
// merged bucket back. Marks a stranger makes are held by LOCAL_AGENT and adopted when they sign in.
import { eachLimited } from "../../backend/offline/outbox";
/** How many buckets are read at once (each is one read at the reader's agent). */
const READ_CONCURRENCY = 4;
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

/**
 * The bucket split into the reader's own marks (anonymous ones adopted) and marks held by someone else — another
 * person who signed in on this device earlier. Foreign marks are never sent as the reader's; they are parked on
 * the device under `parked:<agent>:<key>` until that person signs in here again.
 */
export function separateForeign(
  bucket: BucketDocument,
  agent: string,
  newId: () => string,
  now = () => new Date().toISOString()
): { mine: BucketDocument; foreign: Map<string, BucketDocument> } {
  const me = agentAddress(agent);
  const foreign = new Map<string, BucketDocument>();
  const mine: (typeof bucket)["@graph"] = [];
  for (const it of bucket["@graph"]) {
    const holder = agentAddress(it.heldBy);
    if (holder === me) mine.push(it);
    else if (holder === LOCAL_AGENT)
      mine.push({ ...it, heldBy: me, opId: newId(), updatedAt: now() });
    else {
      const f = foreign.get(holder) ?? { ...bucket, "@graph": [] };
      foreign.set(holder, { ...f, "@graph": [...f["@graph"], it] });
    }
  }
  return { mine: { ...bucket, "@graph": mine }, foreign };
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

/** The collections a signed-in device pulls from the Library's manifests, so marks and reads made elsewhere show. */
const PULLED: Collection[] = ["highlights", "annotations", "history"];
/** How many buckets a pull opens per collection — a bound on the harness runs a first sign-in can cost. */
const PULL_MAX = 150;

export function createBucketStore(deps: BucketStoreDeps) {
  const open = new Map<string, OpenBucket>();
  /** Bumped whenever a bucket on the device changes; the cross-chapter views re-read on it. */
  const changed = signal(0);
  const pulling = signal(false);
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
      changed.value++;
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
    changed.value++;
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
    changed.value++;
  }

  /**
   * The buckets of a collection the Library holds that this device never opened — what the reader did on another
   * device — read and kept on the device (one run for the list, one per bucket). Bounded; a stranger pulls nothing.
   */
  async function pull(collection: Collection, max = PULL_MAX): Promise<number> {
    if (!deps.backend.identity() || !isOnline()) return 0;
    const entries = await deps.backend.listBuckets(collection);
    const have = new Set(await deps.stores.buckets.keys());
    const wanted = entries
      .map((e) => (e.bucket === collection ? undefined : e.bucket))
      .filter((chapter) => {
        const k = storeKey(collection, chapter);
        return !have.has(k) && !open.has(k);
      })
      .slice(0, max);
    await eachLimited(wanted, READ_CONCURRENCY, async (chapter) => {
      await get(collection, chapter).ready;
    });
    return wanted.length;
  }

  /** Every pulled collection, in the background of a sign-in; errors are per collection and logged. */
  async function pullAll(): Promise<void> {
    if (pulling.value) return;
    pulling.value = true;
    try {
      for (const c of PULLED)
        await pull(c).catch((e) => console.warn("[buckets] pull", c, e));
    } finally {
      pulling.value = false;
    }
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
        if (k.startsWith("parked:")) continue;
        const stored = await deps.stores.buckets.get(k);
        if (!stored) continue;
        const { mine, foreign } = separateForeign(
          stored,
          who.agent,
          newId,
          now
        );
        if (serialize(mine) === serialize(stored)) continue;
        const [collection, chapter] = splitKey(k);
        for (const [holder, doc] of foreign)
          await deps.stores.buckets.set(`parked:${holder}:${k}`, doc);
        await deps.stores.buckets.set(k, mine);
        const ob = open.get(k);
        if (ob) ob.bucket.value = mine;
        await deps.outbox.queue(collection, chapter, `adopt-${newId()}`);
      }
    }
    // What waits to go up goes now, beside the re-reads (which run a few at a time): a change made just after
    // sign-in must not queue behind every open bucket being read again.
    const sent = who ? deps.outbox.flush() : Promise.resolve();
    await eachLimited([...open], READ_CONCURRENCY, async ([k, ob]) => {
      const [collection, chapter] = splitKey(k);
      await load(collection, chapter, ob);
    });
    if (who) {
      await sent;
      await deps.outbox.flush();
      void pullAll();
    }
  }

  /** Forget the open signals (sign-out): the device copies stay, the next open reads them again. */
  function reset() {
    open.clear();
  }

  return { get, put, accept, resync, reset, pull, pullAll, changed, pulling };
}

export type BucketStore = ReturnType<typeof createBucketStore>;

function splitKey(k: string): [Collection, string | undefined] {
  const i = k.indexOf(":");
  const collection = k.slice(0, i) as Collection;
  const rest = k.slice(i + 1);
  return [collection, rest === collection ? undefined : rest];
}
