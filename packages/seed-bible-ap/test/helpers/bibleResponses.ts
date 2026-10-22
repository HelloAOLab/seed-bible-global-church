// THE BIBLE API, CANNED — the two responses every reader test needs (BSB/books.json and BSB/JHN/3.json), as a
// `ReadingApi` the state takes and as a `fetch` stub for code that reaches the API by URL (the edge Worker).
// `addChapter` extends the map; nothing here touches the network.
import type { ReadingApi } from "../../apps/reader-web/src/state/reading/reading";
import type { TranslationBookChapter } from "../../apps/reader-web/src/backend/bible";

export const BSB = { id: "BSB", shortName: "BSB", language: "eng" };
export const JOHN = {
  id: "JHN",
  name: "John",
  commonName: "John",
  numberOfChapters: 21,
};

export const JOHN_3 = {
  translation: BSB,
  book: JOHN,
  chapter: {
    number: 3,
    content: [
      { type: "verse", number: 1, content: ["Now there was a Pharisee"] },
      { type: "verse", number: 16, content: ["For God so loved the world"] },
      { type: "verse", number: 17, content: ["For God did not send"] },
      { type: "verse", number: 18, content: ["Whoever believes"] },
    ],
    footnotes: [],
  },
  nextChapterApiLink: null,
  previousChapterApiLink: null,
} as unknown as TranslationBookChapter;

export interface BibleResponses {
  api: ReadingApi;
  /** A `fetch` answering `…/api/<translation>/books.json` and `…/api/<translation>/<book>/<n>.json`. */
  fetch: (input: string | URL | Request) => Promise<Response>;
  /** Every URL the stub answered, in order. */
  requests: string[];
  addChapter(doc: TranslationBookChapter): void;
}

export function bibleResponses(): BibleResponses {
  const chapters = new Map<string, TranslationBookChapter>();
  const books = new Map<string, typeof JOHN>();
  const requests: string[] = [];
  const addChapter = (doc: TranslationBookChapter) => {
    chapters.set(
      `${doc.translation.id}/${doc.book.id}/${doc.chapter.number}`,
      doc
    );
    if (!books.has(doc.book.id)) books.set(doc.book.id, doc.book as never);
  };
  addChapter(JOHN_3);
  const booksOf = (t: string) => ({
    translation: { ...BSB, id: t },
    books: [...books.values()],
  });
  const api: ReadingApi = {
    getAvailableTranslations: async () => ({ translations: [BSB] }) as never,
    getTranslationBooks: async (t) => booksOf(t) as never,
    getTranslationBookChapter: async (t, b, c) => {
      const doc = chapters.get(`${t}/${b}/${Number(c)}`);
      if (!doc) throw new Error(`no fixture for ${t}/${b}/${c}`);
      return doc;
    },
    getAudioTimings: async () => {
      throw new Error("no audio timings in the fixture");
    },
  };
  const fetchStub = async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push(url);
    const books = /\/api\/([A-Za-z0-9]+)\/books\.json$/.exec(url);
    if (books) return Response.json(booksOf(books[1]!));
    const ch = /\/api\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)\/(\d+)\.json$/.exec(url);
    const doc = ch && chapters.get(`${ch[1]}/${ch[2]}/${Number(ch[3])}`);
    if (doc) return Response.json(doc);
    return new Response("not in the fixture", { status: 404 });
  };
  return { api, fetch: fetchStub, requests, addChapter };
}
