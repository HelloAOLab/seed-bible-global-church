// The edge render: a chapter URL becomes the chapter's markup with the title, description and the seed the
// client's API instance reuses; the shell is left alone when the API fails.
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  injectIntoIndex,
  renderChapterPage,
  SEED_GLOBAL,
} from "../../../apps/reader-web/src/entry-server";

const chapter = {
  translation: { id: "BSB", shortName: "BSB", language: "eng" },
  book: { id: "JHN", name: "John" },
  chapter: {
    number: 3,
    content: [
      { type: "heading", content: ["Jesus and Nicodemus"] },
      {
        type: "verse",
        number: 1,
        content: ["Now there was a Pharisee named Nicodemus"],
      },
      { type: "verse", number: 16, content: ["For God so loved the world"] },
    ],
    footnotes: [],
  },
  nextChapterApiLink: null,
  previousChapterApiLink: null,
};
const INDEX =
  '<html lang="en"><head><title>Seed Bible — faithnet</title></head><body><div id="root"></div></body></html>';

afterEach(() => vi.unstubAllGlobals());

describe("ssr", () => {
  it("renders the chapter into the shell with title, description and seed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
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
      })
    );
    const page = await renderChapterPage(
      { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
      "https://bible.test/"
    );
    expect(page).not.toBeNull();
    expect(page!.title).toBe("John 3 · BSB · Seed Bible");
    expect(page!.description).toMatch(/^Now there was a Pharisee/);
    expect(page!.html).toContain('class="sb-chapter-heading"');
    expect(page!.html).toContain('data-verse-number="16"');
    expect(
      Object.keys(page!.seed).some((k) => k.endsWith("/api/BSB/JHN/3.json"))
    ).toBe(true);

    const html = injectIntoIndex(INDEX, page!);
    expect(html).toContain("<title>John 3 · BSB · Seed Bible</title>");
    expect(html).toContain(
      '<meta name="description" content="Now there was a Pharisee'
    );
    expect(html).toContain('<div id="root"><div class="sb-app sb-app-ssr"');
    expect(html).toContain(`window.${SEED_GLOBAL}=`);
    expect(html).toContain('<html lang="en"');
  });

  it("gives null when the chapter cannot be fetched, so the Worker serves the plain shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    const page = await renderChapterPage(
      { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
      "https://bible.test/"
    );
    expect(page).toBeNull();
  });
});
