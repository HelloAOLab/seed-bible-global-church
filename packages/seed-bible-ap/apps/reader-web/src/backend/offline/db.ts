// THE DEVICE'S READ MODEL (hard-problems §1): IndexedDB holds a copy of every bucket the reader opened, the outbox
// of buckets changed while the Library was out of reach, the chapters read (so the text works offline) and a few
// preferences. It is a cache of the Library plus a queue — the vault is the record. A tiny key-value shape per
// store, so tests run on the memory stores and the browser on IndexedDB without a library.
import type { BucketDocument, Collection } from "@seed/library-client";

export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface OutboxEntry {
  collection: Collection;
  chapter?: string;
  /** Stable per batch so a retried flush replays as the same merge (idempotent by opId on the far side). */
  batchId: string;
  queuedAt: string;
  opIds: string[];
}

export interface ReaderStores {
  buckets: KeyValueStore<BucketDocument>;
  outbox: KeyValueStore<OutboxEntry>;
  chapters: KeyValueStore<unknown>;
  prefs: KeyValueStore<unknown>;
}

const STORE_NAMES = ["buckets", "outbox", "chapters", "prefs"] as const;

export function memoryStores(): ReaderStores {
  const mk = <T>(): KeyValueStore<T> => {
    const m = new Map<string, T>();
    return {
      get: async (k) => m.get(k),
      set: async (k, v) => void m.set(k, v),
      delete: async (k) => void m.delete(k),
      keys: async () => [...m.keys()],
    };
  };
  return { buckets: mk(), outbox: mk(), chapters: mk(), prefs: mk() };
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function openDb(name: string, idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => {
      for (const s of STORE_NAMES)
        if (!r.result.objectStoreNames.contains(s))
          r.result.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

export function indexedDbStores(
  name = "seed-bible-reader",
  idb: IDBFactory | undefined = typeof indexedDB === "undefined"
    ? undefined
    : indexedDB
): ReaderStores {
  if (!idb) return memoryStores();
  const db = openDb(name, idb);
  const mk = <T>(store: (typeof STORE_NAMES)[number]): KeyValueStore<T> => ({
    get: async (k) =>
      req((await db).transaction(store).objectStore(store).get(k)) as Promise<
        T | undefined
      >,
    set: async (k, v) => {
      await req(
        (await db).transaction(store, "readwrite").objectStore(store).put(v, k)
      );
    },
    delete: async (k) => {
      await req(
        (await db).transaction(store, "readwrite").objectStore(store).delete(k)
      );
    },
    keys: async () =>
      (await req(
        (await db).transaction(store).objectStore(store).getAllKeys()
      )) as string[],
  });
  return {
    buckets: mk("buckets"),
    outbox: mk("outbox"),
    chapters: mk("chapters"),
    prefs: mk("prefs"),
  };
}
