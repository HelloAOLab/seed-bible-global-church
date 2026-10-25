// CROSS-REFERENCES — ported from packages/references-extension: the open cross-reference dataset the Bible API
// hosts (`/api/d/open-cross-ref/<BOOK>/<ch>.json`), asked of the scripture agent through this reader's agent, read per chapter and kept on the device, offered in Discover
// for the verses on screen (the selected ones first). Browser-local: the Bible API only.
import type { DiscoverItem, ExtensionRegistration } from "../host";
import { BIBLE_API_ENDPOINT } from "../../backend/bible";
import type { ReaderState } from "../../state";
import "./references.css";

export const REFERENCES_BASE_URL = `${BIBLE_API_ENDPOINT}api/d/open-cross-ref`;

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
  const key = `xref2:${bookId}/${chapter}`;
  const hit = (await cache.get(key)) as ChapterReferences | undefined;
  if (hit) return hit;
  const res = await fetchImpl(
    `${REFERENCES_BASE_URL}/${bookId}/${chapter}.json`
  );
  if (!res.ok) return null;
  const data = normalizeReferences(await res.json(), bookId, chapter);
  await cache.set(key, data);
  return data;
}

/**
 * The Bible API's file as this extension reads it: the dataset puts each verse's references under
 * `chapter.content` (`{ verse, references }`), not at the top level.
 */
export function normalizeReferences(
  raw: unknown,
  bookId: string,
  chapter: number
): ChapterReferences {
  const r = (raw ?? {}) as {
    references?: ChapterReferences["references"];
    chapter?: { number?: number; content?: ChapterReferences["references"] };
  };
  const list = Array.isArray(r.references)
    ? r.references
    : Array.isArray(r.chapter?.content)
      ? r.chapter.content
      : [];
  return {
    book: bookId,
    chapter: r.chapter?.number ?? chapter,
    references: list.filter(
      (v) => v && typeof v.verse === "number" && Array.isArray(v.references)
    ),
  };
}

const NEW_TESTAMENT = new Set([
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV",
]);

export function itemsFor(
  refs: ChapterReferences,
  verses: number[],
  bookName: (id: string) => string,
  max = 40,
  perVerse = 3
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
    for (const r of sorted.slice(0, verses.length ? 12 : perVerse)) {
      const to = `${bookName(r.book)} ${r.chapter}:${r.verse}${r.endVerse && r.endVerse !== r.verse ? `–${r.endVerse}` : ""}`;
      out.push({
        id: `${v.verse}→${r.book}.${r.chapter}.${r.verse}`,
        title: to,
        description: `from verse ${v.verse}`,
        icon: "link",
        section: NEW_TESTAMENT.has(r.book) ? "New Testament" : "Old Testament",
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
  settings: {
    perVerse: {
      type: "number",
      label: "References per verse",
      description:
        "How many related passages to show for each verse when none is chosen (chosen verses show up to 12).",
      default: 3,
      min: 1,
      max: 12,
    },
  },
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
        const perVerse = Number(ctx.setting("perVerse")) || 3;
        return itemsFor(refs, d.selectedVerses, name, 40, perVerse).map(
          (it) => ({
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
          })
        );
      },
    });
  },
};
export default references;
