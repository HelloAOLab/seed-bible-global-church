// EVERYTHING AT A PASSAGE, FROM reader-a2a's ONE CALL (`/api/passage/<locus>`): the scripture agent's cross-references
// and people, places and events, the writings around it and the registry's publications, each anchored by canonical
// locus id. A chapter is asked once and kept on the device; the panels that used to read the datasets' files directly
// read their part of this answer instead.
import { A2A_BASE } from "../api";

export interface PassageAnchor {
  id: string;
  alias: string;
  type: "book" | "chapter" | "verse" | "range";
  span: [number, number];
  /** The reader's record form: `JHN.3.16`, `JHN.3`, `JHN.3.16-JHN.3.18`. */
  ref: string;
}

export interface PassageItem {
  source: "scripture" | "content" | "publishing" | "person" | "registry";
  kind: string;
  locus: PassageAnchor;
  title: string;
  detail?: string;
  link?: string;
  from?: string;
  data?: Record<string, unknown>;
}

export interface PassageAnswer {
  locus: PassageAnchor;
  items: PassageItem[];
  sources: Record<string, { ok: boolean; count: number; error?: string }>;
}

interface Cache {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
}

const inFlight = new Map<string, Promise<PassageAnswer | null>>();

/** A chapter's answer (`JHN.3`), from the device when read before; null when reader-a2a could not answer. Only a
 *  complete answer is kept, so a source that was down is asked again next time. */
export function loadPassage(
  chapterRef: string,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<PassageAnswer | null> {
  const key = `passage:${chapterRef}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    const hit = (await cache.get(key)) as PassageAnswer | undefined;
    if (hit?.items) return hit;
    const res = await fetchImpl(
      `${A2A_BASE}/api/passage/${encodeURIComponent(chapterRef)}`
    );
    if (!res.ok) return null;
    const out = (await res.json()) as PassageAnswer & { ok?: boolean };
    if (!out.ok || !Array.isArray(out.items)) return null;
    if (Object.values(out.sources ?? {}).every((s) => s.ok))
      await cache.set(key, {
        locus: out.locus,
        items: out.items,
        sources: out.sources,
      });
    return out;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

const parts = (ref: string) => {
  const [book, chapter, verse] = ref.split("-")[0]!.split(".");
  return { book: book!, chapter: Number(chapter), verse: Number(verse) };
};

/** The cross-references in the dataset's own chapter shape (`chapter.content[{ verse, references }]`). */
export function crossReferencesOf(answer: PassageAnswer) {
  const byVerse = new Map<
    number,
    Array<{
      book: string;
      chapter: number;
      verse: number;
      endVerse?: number;
      score?: number;
    }>
  >();
  for (const it of answer.items) {
    if (it.kind !== "cross-reference") continue;
    const to = it.data?.["to"] as PassageAnchor | undefined;
    if (!to?.ref) continue;
    const from = parts(it.locus.ref).verse;
    const t = parts(to.ref);
    const end =
      to.type === "range" ? parts(to.ref.split("-")[1]!).verse : undefined;
    const score = it.data?.["score"];
    const list = byVerse.get(from) ?? [];
    list.push({
      book: t.book,
      chapter: t.chapter,
      verse: t.verse,
      ...(end ? { endVerse: end } : {}),
      ...(typeof score === "number" ? { score } : {}),
    });
    byVerse.set(from, list);
  }
  return {
    chapter: {
      content: [...byVerse.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([verse, references]) => ({ verse, references })),
    },
  };
}

/** The people, places and events in the dataset's own chapter shape (`chapter.{people, places, events}`). */
export function theographicOf(answer: PassageAnswer) {
  const group = (kind: string) =>
    answer.items
      .filter((it) => it.source === "scripture" && it.kind === kind)
      .map((it) => ({
        ...(it.data ?? {}),
        name: it.title,
        ...(it.link ? { apiLink: it.link } : {}),
      }));
  return {
    chapter: {
      people: group("person"),
      places: group("place"),
      events: group("event"),
    },
  };
}
