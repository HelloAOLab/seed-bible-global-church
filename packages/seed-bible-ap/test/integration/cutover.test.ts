// The cutover surface end to end, offline: a chapter URL on the edge Worker carries Open Graph and a canonical
// link, robots and the sitemap answer from the same public inputs, and an embed link boots the whole reader state
// into the compact chrome with the theme the link named — the pieces an iframe host, a crawler, or a shared link
// touches before any reader signs in.
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../apps/reader-web/worker/index";
import { createReaderState } from "../../apps/reader-web/src/state";
import { createDevBackend } from "../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../apps/reader-web/src/backend/offline/db";
import type { ReadingApi } from "../../apps/reader-web/src/state/reading/reading";
import type { TranslationBookChapter } from "../../apps/reader-web/src/backend/bible";

const chapter = {
  translation: { id: "BSB", shortName: "BSB", language: "eng" },
  book: { id: "JHN", name: "John", commonName: "John", numberOfChapters: 2 },
  chapter: {
    number: 3,
    content: [
      { type: "verse", number: 16, content: ["For God so loved the world"] },
    ],
    footnotes: [],
  },
  nextChapterApiLink: null,
  previousChapterApiLink: null,
};
const INDEX =
  '<html lang="en"><head><title>Seed Bible</title></head><body><div id="root"></div></body></html>';

const bibleApi = vi.fn(async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/api/BSB/JHN/3.json"))
    return new Response(JSON.stringify(chapter), { status: 200 });
  if (url.endsWith("/api/BSB/books.json"))
    return new Response(
      JSON.stringify({
        translation: chapter.translation,
        books: [chapter.book],
      }),
      { status: 200 }
    );
  return new Response("nope", { status: 404 });
});
const env = {
  ASSETS: {
    fetch: async () =>
      new Response(INDEX, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("the cutover surface", () => {
  it("a chapter URL carries Open Graph and a canonical link for whoever shares it", async () => {
    vi.stubGlobal("fetch", bibleApi);
    const res = await worker.fetch(
      new Request("https://seed-reader.faithnet.io/read/BSB/JHN/3", {
        headers: { accept: "text/html" },
      }),
      env
    );
    const html = await res.text();
    expect(res.headers.get("x-sb-ssr")).toBe("chapter");
    expect(html).toContain(
      '<meta property="og:title" content="John 3 · BSB · Seed Bible" />'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://seed-reader.faithnet.io/read/BSB/JHN/3" />'
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://seed-reader.faithnet.io/read/BSB/JHN/3" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://seed-reader.faithnet.io/og.jpg" />'
    );
  });

  it("robots points at the sitemap, and the sitemap lists every chapter of the sitemap translations", async () => {
    vi.stubGlobal("fetch", bibleApi);
    const robots = await (
      await worker.fetch(
        new Request("https://seed-reader.faithnet.io/robots.txt"),
        env
      )
    ).text();
    expect(robots).toContain(
      "Sitemap: https://seed-reader.faithnet.io/sitemap.xml"
    );
    const res = await worker.fetch(
      new Request("https://seed-reader.faithnet.io/sitemap.xml"),
      env
    );
    expect(res.headers.get("content-type")).toBe("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<loc>https://seed-reader.faithnet.io/</loc>");
    expect(xml).toContain(
      "<loc>https://seed-reader.faithnet.io/read/BSB/JHN/1</loc>"
    );
    expect(xml).toContain(
      "<loc>https://seed-reader.faithnet.io/read/BSB/JHN/2</loc>"
    );
    expect(xml).not.toContain("/read/BSB/JHN/3</loc>");
  });

  it("the sitemap still answers (with the home page alone) when the Bible API is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    const xml = await (
      await worker.fetch(
        new Request("https://seed-reader.faithnet.io/sitemap.xml"),
        env
      )
    ).text();
    expect(xml).toContain("<loc>https://seed-reader.faithnet.io/</loc>");
    expect(xml).not.toContain("/read/");
  });

  it("an embed link boots the reader into the compact chrome with the theme it names", async () => {
    const api: ReadingApi = {
      getAvailableTranslations: async () => ({ translations: [] }),
      getTranslationBooks: async () =>
        ({ translation: { id: "BSB" }, books: [chapter.book] }) as never,
      getTranslationBookChapter: async (t, b, c) =>
        ({
          ...chapter,
          translation: { id: t },
          book: { ...chapter.book, id: b },
          chapter: { ...chapter.chapter, number: Number(c) },
        }) as unknown as TranslationBookChapter,
      getAudioTimings: async () => {
        throw new Error("none");
      },
    };
    vi.stubGlobal("location", {
      pathname: "/read/BSB/JHN/3",
      search: "?embed=minimal&theme=dark&v=16-17",
    });
    vi.stubGlobal("history", { replaceState: () => {}, pushState: () => {} });
    const state = createReaderState({
      backend: createDevBackend(null),
      stores: memoryStores(),
      api,
      session: null,
      isOnline: () => true,
    });
    const stop = await state.start();
    expect(state.ui.embed.value).toBe(true);
    expect(state.settings.theme.value).toBe("dark");
    expect(state.reading.chapterRef.value).toBe("JHN.3");
    // The shared verses are selected once the chapter is open.
    const t0 = Date.now();
    while (!state.selection.verses.value.length && Date.now() - t0 < 2000)
      await new Promise((r) => setTimeout(r, 5));
    expect(state.selection.verses.value).toEqual([16, 17]);
    stop();
  });
});
