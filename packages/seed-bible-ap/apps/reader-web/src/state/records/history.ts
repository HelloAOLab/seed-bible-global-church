// READING HISTORY — ported in role from the old ReadingHistoryManager: one `seed:ReadingEvent` per reader, chapter
// and day, kept as an item of that chapter's `history` bucket so it travels, merges and adopts like a mark. A
// chapter counts as read once it has stayed open a while (the caller decides); a second look the same day extends
// the event's end instead of adding one. Recent reading and the map's heat are read off every history bucket on
// the device — the Library's buckets from other devices arrive through the store's pull.
import type { ReadingEvent } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { agentAddress, newOpId, nowIso } from "./marks";

export interface RecentReading {
  chapterRef: string;
  edition?: string;
  /** When the chapter was last open. */
  at: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);

export function createHistory(
  buckets: BucketStore,
  stores: ReaderStores,
  identity: () => ReaderIdentity | null
) {
  const mine = (it: ReadingEvent) => {
    const me = identity()?.agent;
    const holder = agentAddress(it.heldBy);
    return holder === LOCAL_AGENT || (!!me && holder === agentAddress(me));
  };

  /** A reading of the chapter now: today's event extended, or a new one. */
  async function record(chapterRef: string, edition?: string, now = nowIso()) {
    const chapter = chapterOf(chapterRef);
    const ob = buckets.get("history", chapter);
    await ob.ready;
    const today = ob.bucket.value["@graph"].find(
      (it): it is ReadingEvent =>
        it["@type"] === "seed:ReadingEvent" &&
        !it.deleted &&
        mine(it) &&
        dayOf(it.startedAt) === dayOf(now)
    );
    const item: ReadingEvent = today
      ? { ...today, endedAt: now, opId: newOpId(), updatedAt: now }
      : {
          "@id": `urn:seed:reading:${chapter}:${dayOf(now)}`,
          "@type": "seed:ReadingEvent",
          heldBy: identity()?.agent ?? LOCAL_AGENT,
          aboutPassage: chapter,
          ...(edition ? { ofEdition: edition } : {}),
          opId: newOpId(),
          startedAt: now,
          endedAt: now,
          createdAt: now,
          updatedAt: now,
        };
    await buckets.put("history", chapter, item);
  }

  async function events(): Promise<ReadingEvent[]> {
    const out: ReadingEvent[] = [];
    for (const k of await stores.buckets.keys()) {
      if (!k.startsWith("history:")) continue;
      const b = await stores.buckets.get(k);
      for (const it of b?.["@graph"] ?? [])
        if (it["@type"] === "seed:ReadingEvent" && !it.deleted && mine(it))
          out.push(it);
    }
    return out;
  }

  /** The chapters read most recently, one entry per chapter, newest first. */
  async function recent(limit = 10): Promise<RecentReading[]> {
    const seen = new Map<string, RecentReading>();
    for (const it of await events()) {
      const at = it.endedAt ?? it.startedAt;
      const c = chapterOf(it.aboutPassage);
      const cur = seen.get(c);
      if (!cur || cur.at < at)
        seen.set(c, {
          chapterRef: c,
          ...(it.ofEdition ? { edition: it.ofEdition } : {}),
          at,
        });
    }
    return [...seen.values()]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, limit);
  }

  /** Days each chapter was read, for the map's shading. */
  async function heat(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const it of await events()) {
      const c = chapterOf(it.aboutPassage);
      out[c] = (out[c] ?? 0) + 1;
    }
    return out;
  }

  return { record, recent, heat };
}

export type History = ReturnType<typeof createHistory>;
