// Reading state over a fake Bible API: the chapter opens, next/previous follow the API's links, and a chapter
// read once is served from the device when the API is gone.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  createReading,
  type ReadingApi,
} from "../../../apps/reader-web/src/state/reading/reading";
import {
  parseRoute,
  routeOf,
} from "../../../apps/reader-web/src/state/reading/route";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";

const translation = {
  id: "BSB",
  name: "Berean Standard Bible",
  englishName: "Berean Standard Bible",
  shortName: "BSB",
  website: "",
  licenseUrl: "",
  language: "eng",
  textDirection: "ltr",
  availableFormats: [],
  listOfBooksApiLink: "",
  numberOfBooks: 66,
  totalNumberOfChapters: 1189,
  totalNumberOfVerses: 0,
} as unknown as TranslationBookChapter["translation"];

const book = {
  id: "JHN",
  name: "John",
  commonName: "John",
  title: null,
  order: 43,
  numberOfChapters: 21,
  firstChapterApiLink: "/api/BSB/JHN/1.json",
  lastChapterApiLink: "/api/BSB/JHN/21.json",
  totalNumberOfVerses: 879,
} as unknown as TranslationBookChapter["book"];

function chapter(n: number): TranslationBookChapter {
  return {
    translation,
    book,
    thisChapterLink: `/api/BSB/JHN/${n}.json`,
    thisChapterAudioLinks: {},
    thisChapterAudioTimings: {},
    nextChapterApiLink: n < 21 ? `/api/BSB/JHN/${n + 1}.json` : null,
    nextChapterAudioLinks: {},
    previousChapterApiLink: n > 1 ? `/api/BSB/JHN/${n - 1}.json` : null,
    previousChapterAudioLinks: {},
    numberOfVerses: 1,
    chapter: {
      number: n,
      content: [
        { type: "verse", number: 1, content: [`Chapter ${n} verse 1`] },
      ],
      footnotes: [],
    },
  } as unknown as TranslationBookChapter;
}

function fakeApi(down = { value: false }): ReadingApi {
  const fail = () => {
    if (down.value) throw new Error("fetch failed");
  };
  return {
    getAvailableTranslations: async () => {
      fail();
      return { translations: [translation] };
    },
    getTranslationBooks: async () => {
      fail();
      return { translation, books: [book] };
    },
    getTranslationBookChapter: async (_t, _b, c) => {
      fail();
      return chapter(Number(c));
    },
    getAudioTimings: async () => {
      throw new Error("no audio in this fake");
    },
  };
}

describe("reading", () => {
  it("opens a chapter and follows next and previous", async () => {
    const changes: string[] = [];
    const r = createReading({
      api: fakeApi(),
      chapters: memoryStores().chapters,
      onChange: (p) => changes.push(routeOf(p)),
    });
    await r.goTo("BSB", "JHN", 3);
    expect(r.chapterData.value?.chapter.number).toBe(3);
    expect(r.bookName.value).toBe("John");
    expect(r.chapterRef.value).toBe("JHN.3");
    await r.next();
    expect(r.chapterNumber.value).toBe(4);
    await r.prev();
    await r.prev();
    expect(r.chapterNumber.value).toBe(2);
    expect(changes).toEqual([
      "/read/BSB/JHN/3",
      "/read/BSB/JHN/4",
      "/read/BSB/JHN/3",
      "/read/BSB/JHN/2",
    ]);
    expect(r.hasPrev.value).toBe(true);
  });

  it("serves a chapter read before from the device when the API is down, and errors on one never read", async () => {
    const down = { value: false };
    const chapters = memoryStores().chapters;
    const r = createReading({ api: fakeApi(down), chapters });
    await r.goTo("BSB", "JHN", 3);
    expect(r.fromDevice.value).toBe(false);
    down.value = true;
    await r.goTo("BSB", "JHN", 3);
    expect(r.chapterData.value?.chapter.number).toBe(3);
    expect(r.fromDevice.value).toBe(true);
    expect(r.error.value).toBeNull();
    await r.goTo("BSB", "JHN", 4);
    expect(r.chapterData.value).toBeNull();
    expect(r.error.value).toMatch(/fetch failed/);
  });

  it("the last navigation wins when two overlap", async () => {
    const r = createReading({
      api: fakeApi(),
      chapters: memoryStores().chapters,
    });
    const p1 = r.goTo("BSB", "JHN", 5);
    const p2 = r.goTo("BSB", "JHN", 9);
    await Promise.all([p1, p2]);
    expect(r.chapterData.value?.chapter.number).toBe(9);
    expect(r.loading.value).toBe(false);
  });

  it("parses and prints the chapter route", () => {
    expect(parseRoute("/read/BSB/jhn/3")).toEqual({
      translationId: "BSB",
      bookId: "JHN",
      chapterNumber: 3,
    });
    expect(parseRoute("/")).toBeNull();
    expect(
      routeOf({ translationId: "BSB", bookId: "1JN", chapterNumber: 2 })
    ).toBe("/read/BSB/1JN/2");
  });
});
