// CROSS-REFERENCES — ported from packages/references-extension: the open cross-reference dataset the Bible API
// hosts (`/api/d/open-cross-ref/<BOOK>/<ch>.json`), read per chapter and kept on the device, offered in Discover
// for the verses on screen (the selected ones first). Browser-local: the Bible API only.
import type { DiscoverItem, ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import "./references.css";

export const REFERENCES_BASE_URL =
  "https://vmfnri.helloao.org/api/d/open-cross-ref";

export interface CrossReference {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  score?: number;
}
export interface ChapterReferences {
  book: string;
  chapter: number;
  references: Array<{ verse: number; references: CrossReference[] }>;
}

export async function loadChapterReferences(
  bookId: string,
  chapter: number,
  cache: {
    get: (k: string) => Promise<unknown>;
    set: (k: string, v: unknown) => Promise<void>;
  },
  fetchImpl: typeof fetch = fetch
): Promise<ChapterReferences | null> {
  const key = `xref:${bookId}/${chapter}`;
  const hit = (await cache.get(key)) as ChapterReferences | undefined;
  if (hit) return hit;
  const res = await fetchImpl(
    `${REFERENCES_BASE_URL}/${bookId}/${chapter}.json`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ChapterReferences;
  await cache.set(key, data);
  return data;
}

export function itemsFor(
  refs: ChapterReferences,
  verses: number[],
  bookName: (id: string) => string,
  max = 40
): Array<DiscoverItem & { ref: CrossReference; fromVerse: number }> {
  const wanted = verses.length
    ? refs.references.filter((r) => verses.includes(r.verse))
    : refs.references;
  const out: Array<DiscoverItem & { ref: CrossReference; fromVerse: number }> =
    [];
  for (const v of wanted) {
    const sorted = [...v.references].sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0)
    );
    for (const r of sorted.slice(0, verses.length ? 12 : 3)) {
      const to = `${bookName(r.book)} ${r.chapter}:${r.verse}${r.endVerse && r.endVerse !== r.verse ? `–${r.endVerse}` : ""}`;
      out.push({
        id: `${v.verse}→${r.book}.${r.chapter}.${r.verse}`,
        title: to,
        description: `from verse ${v.verse}`,
        icon: "link",
        ref: r,
        fromVerse: v.verse,
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

const references: ExtensionRegistration = {
  id: "references",
  label: "Cross-references",
  description: "Passages related to the verses on screen, in Discover.",
  init: function* (ctx) {
    const state: ReaderState = ctx.state;
    yield ctx.discover.registerProvider({
      id: "references",
      label: "Cross-references",
      discover: async (d) => {
        const [bookId, ch] = d.chapterRef.split(".");
        const refs = await loadChapterReferences(
          bookId!,
          Number(ch),
          state.stores.chapters
        ).catch(() => null);
        if (!refs) return [];
        const name = (id: string) =>
          d.books.find((b) => b.id === id)?.name ?? id;
        return itemsFor(refs, d.selectedVerses, name).map((it) => ({
          ...it,
          onOpen: () => {
            void state.reading
              .goTo(
                state.reading.translationId.value,
                it.ref.book,
                it.ref.chapter
              )
              .then(() =>
                state.selection.select(
                  it.ref.verse,
                  it.ref.endVerse ?? it.ref.verse
                )
              );
          },
        }));
      },
    });
  },
};
export default references;
