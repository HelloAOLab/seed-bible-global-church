// Share links: `?v=16-18` names verses of the chapter; the link is built on this origin; the verses do not follow
// the reader to the next chapter; and the edge render titles and describes the shared verses themselves.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shareUrl,
  versesOf,
} from "../../../apps/reader-web/src/state/reading/route";
import {
  renderChapterPage,
  versesDescription,
} from "../../../apps/reader-web/src/entry-server";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";

const chapter = {
  translation: { id: "BSB", shortName: "BSB", language: "eng" },
  book: { id: "JHN", name: "John" },
  chapter: {
    number: 3,
    content: [
      { type: "verse", number: 15, content: ["that everyone who believes"] },
      { type: "verse", number: 16, content: ["For God so loved the world"] },
      { type: "verse", number: 17, content: ["For God did not send"] },
      { type: "verse", number: 18, content: ["Whoever believes in Him"] },
    ],
    footnotes: [],
  },
  nextChapterApiLink: null,
  previousChapterApiLink: null,
} as unknown as TranslationBookChapter;

afterEach(() => vi.unstubAllGlobals());

describe("share links", () => {
  it("read the verses a link names, and refuse nonsense", () => {
    expect(versesOf("?v=16")).toEqual([16, 16]);
    expect(versesOf("?v=16-18")).toEqual([16, 18]);
    expect(versesOf("?embed=minimal&v=2-3")).toEqual([2, 3]);
    expect(versesOf("?v=18-16")).toBeNull();
    expect(versesOf("?v=abc")).toBeNull();
    expect(versesOf("")).toBeNull();
  });

  it("build the link on this origin", () => {
    const r = { translationId: "BSB", bookId: "JHN", chapterNumber: 3 };
    expect(shareUrl("https://seed-reader.faithnet.io", r, 16)).toBe(
      "https://seed-reader.faithnet.io/read/BSB/JHN/3?v=16"
    );
    expect(shareUrl("https://x.test", r, 16, 18)).toBe(
      "https://x.test/read/BSB/JHN/3?v=16-18"
    );
  });

  it("describe the shared verses, and title the page with the reference", async () => {
    expect(versesDescription(chapter, [16, 17])).toBe(
      "For God so loved the world For God did not send"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.endsWith("/api/BSB/JHN/3.json"))
          return new Response(JSON.stringify(chapter), { status: 200 });
        return new Response("nope", { status: 404 });
      })
    );
    const page = await renderChapterPage(
      { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
      "https://bible.test/",
      [16, 18]
    );
    expect(page!.title).toBe("John 3:16–18 · BSB · Seed Bible");
    expect(page!.description).toBe(
      "For God so loved the world For God did not send Whoever believes in Him"
    );
    const one = await renderChapterPage(
      { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
      "https://bible.test/",
      [16, 16]
    );
    expect(one!.title).toBe("John 3:16 · BSB · Seed Bible");
  });
});
