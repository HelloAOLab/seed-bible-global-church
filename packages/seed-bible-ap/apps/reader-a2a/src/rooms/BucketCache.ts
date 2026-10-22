// THE READER'S BUCKET CACHE — one Durable Object per reader, holding the last text of each bucket this workspace read
// or saved for them (with its Library id and version). Every write of these buckets goes through this workspace, so a
// fresh entry is what the Library holds; a merge then needs no read of its own and a chapter opens without one.
// REBUILDABLE, NEVER THE RECORD: entries expire on their own, a failed save drops its entry, and a wiped object only
// costs the reads it saved. One object per reader (not a colo cache), so two devices never see two different copies.
export interface CachedBucket {
  text: string;
  id: string;
  version: number;
  at: number;
}

/** The slice of the Durable Object's state this cache uses (structural, so code outside the Worker can name it). */
interface CacheState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
}

/** The binding as the workspace calls it: one object per reader, reached by name. */
export interface BucketCacheNamespace {
  idFromName(name: string): unknown;
  get(id: never): { fetch(url: string, init?: RequestInit): Promise<Response> };
}

/** What the workspace's code holds of a reader's cache (skills/vault.ts builds it from the binding). */
export interface BucketCacheHandle {
  get(key: string): Promise<CachedBucket | null>;
  put(key: string, entry: CachedBucket): Promise<void>;
  drop(key: string): Promise<void>;
}

export class BucketCache {
  constructor(private readonly state: CacheState) {}

  async fetch(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as {
      op?: string;
      key?: string;
      entry?: CachedBucket;
    };
    const key = String(body.key ?? "");
    if (!key)
      return Response.json(
        { ok: false, error: "key required" },
        { status: 400 }
      );
    if (body.op === "get")
      return Response.json({
        ok: true,
        entry: (await this.state.storage.get<CachedBucket>(key)) ?? null,
      });
    if (body.op === "put" && body.entry) {
      await this.state.storage.put(key, body.entry);
      return Response.json({ ok: true });
    }
    if (body.op === "delete") {
      await this.state.storage.delete(key);
      return Response.json({ ok: true });
    }
    return Response.json(
      { ok: false, error: "op must be get, put or delete" },
      { status: 400 }
    );
  }
}
