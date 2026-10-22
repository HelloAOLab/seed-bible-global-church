// THE IN-MEMORY BACKEND — the same contract as reader-a2a, with no network: tests and local pages run the whole UI
// against it. It keeps the buckets the way the reader's Library would (the same applyPut / mergeBuckets the
// workspace runs) and records every call so a test can assert "one run per bucket".
import {
  applyPut,
  bucketKey,
  emptyBucket,
  mergeBuckets,
  type BucketDocument,
  type Collection,
} from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";
import {
  BackendError,
  type ReaderBackend,
  type ReaderIdentity,
} from "./ReaderBackend";

export interface DevCall {
  op: "read" | "put" | "merge";
  key: string;
  opId?: string;
}

export interface DevBackend extends ReaderBackend {
  readonly buckets: Map<string, BucketDocument>;
  readonly calls: DevCall[];
  setIdentity(identity: ReaderIdentity | null): void;
  /** Make the next calls fail as if the network were down (until set back). */
  setOffline(offline: boolean): void;
}

const key = (collection: Collection, chapter?: string) =>
  `${collection}:${bucketKey(collection, chapter)}`;

export function createDevBackend(
  identity: ReaderIdentity | null = null
): DevBackend {
  const buckets = new Map<string, BucketDocument>();
  const calls: DevCall[] = [];
  let who = identity;
  let offline = false;
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const guard = () => {
    if (offline)
      throw new BackendError(
        "the reader workspace could not be reached",
        "offline"
      );
    if (!who)
      throw new BackendError("sign in to keep your marks", "signed-out");
  };
  return {
    kind: "dev",
    buckets,
    calls,
    setIdentity: (i) => (who = i),
    setOffline: (o) => (offline = o),
    identity: () => who,
    async readBucket(collection, chapter) {
      guard();
      calls.push({ op: "read", key: key(collection, chapter) });
      return clone(
        buckets.get(key(collection, chapter)) ??
          emptyBucket(collection, chapter)
      );
    },
    async putMark(collection, item: BucketItem) {
      guard();
      const k = key(collection, item.aboutPassage);
      calls.push({ op: "put", key: k, opId: item.opId });
      const cur = buckets.get(k) ?? emptyBucket(collection, item.aboutPassage);
      const out = applyPut(cur, clone(item));
      buckets.set(k, out.bucket);
      return { changed: out.changed };
    },
    async mergeBucket(collection, chapter, incoming, opId) {
      guard();
      const k = key(collection, chapter);
      calls.push({ op: "merge", key: k, opId });
      const cur = buckets.get(k) ?? emptyBucket(collection, chapter);
      const { bucket } = mergeBuckets(cur, clone(incoming));
      buckets.set(k, bucket);
      return clone(bucket);
    },
  };
}
