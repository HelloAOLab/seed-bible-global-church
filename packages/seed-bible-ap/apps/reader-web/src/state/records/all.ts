// EVERY MARK ON THE DEVICE, across chapters — what Your Content's "all chapters" view and the map read. Device
// buckets only (what this reader opened or pulled); never a network call.
import type { BucketItem } from "@seed/seed-schema";
import type { Collection } from "@seed/library-client";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "./buckets";
import { agentAddress } from "./marks";

export interface StoredChapter<T extends BucketItem> {
  chapterRef: string;
  items: T[];
}

/** The live items of a chaptered collection on this device, by chapter, the reader's own (or anonymous) only. */
export async function listStored<T extends BucketItem>(
  stores: ReaderStores,
  collection: Collection,
  type: T["@type"],
  identity: () => ReaderIdentity | null
): Promise<StoredChapter<T>[]> {
  const me = identity()?.agent;
  const out: StoredChapter<T>[] = [];
  for (const k of await stores.buckets.keys()) {
    if (!k.startsWith(`${collection}:`)) continue;
    const chapterRef = k.slice(collection.length + 1);
    const b = await stores.buckets.get(k);
    const items = (b?.["@graph"] ?? []).filter((it): it is T => {
      if (it["@type"] !== type || it.deleted) return false;
      const holder = agentAddress(it.heldBy);
      return holder === LOCAL_AGENT || (!!me && holder === agentAddress(me));
    });
    if (items.length) out.push({ chapterRef, items });
  }
  return out.sort((a, b) => a.chapterRef.localeCompare(b.chapterRef));
}
