// A WHOLE TRANSLATION ON THE DEVICE: after one download every chapter reads with the Bible API out of reach,
// next / previous run across the book boundary, and removing it takes every chapter off the device.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createReading } from "../../../apps/reader-web/src/state/reading/reading";
import { createOfflineTranslations } from "../../../apps/reader-web/src/state/reading/offlineTranslations";
import type { CompleteTranslation } from "../../../apps/reader-web/src/backend/bible";

const chapter = (n: number, words: string) => ({
  numberOfVerses: 1,
  thisChapterAudioLinks: {},
  thisChapterAudioTimings: {},
  chapter: {
    number: n,
    content: [{ type: "verse", number: 1, content: [words] }],
    footnotes: [],
  },
});
const FULL = {
  translation: {
    id: "TST",
    name: "Test Bible",
    shortName: "TST",
    language: "eng",
    textDirection: "ltr",
  },
  books: [
    {
      id: "RUT",
      name: "Ruth",
      commonName: "Ruth",
      order: 8,
      numberOfChapters: 2,
      totalNumberOfVerses: 2,
      chapters: [chapter(1, "Ruth one"), chapter(2, "Ruth two")],
    },
    {
      id: "1SA",
      name: "1 Samuel",
      commonName: "1 Samuel",
      order: 9,
      numberOfChapters: 1,
      totalNumberOfVerses: 1,
      chapters: [chapter(1, "Samuel one")],
    },
  ],
} as unknown as CompleteTranslation;

const offlineApi = {
  getAvailableTranslations: async () => {
    throw new Error("offline");
  },
  getTranslationBooks: async () => {
    throw new Error("offline");
  },
  getTranslationBookChapter: async () => {
    throw new Error("offline");
  },
  getAudioTimings: async () => {
    throw new Error("offline");
  },
};

describe("offline translations", () => {
  it("a downloaded translation reads offline, across the book boundary, and goes away when removed", async () => {
    const stores = memoryStores();
    const fractions: number[] = [];
    const offline = createOfflineTranslations({
      api: {
        getCompleteTranslation: async (_t, o) => {
          o?.onProgress?.(50, 100);
          return FULL;
        },
      },
      chapters: stores.chapters,
      prefs: stores.prefs,
      now: () => "2026-10-22T10:00:00Z",
    });
    const sub = offline.progress.subscribe(
      (p) => p && fractions.push(p.fraction)
    );
    const entry = await offline.download("TST");
    sub();
    expect(entry).toEqual({
      id: "TST",
      name: "TST",
      chapters: 3,
      at: "2026-10-22T10:00:00Z",
    });
    expect(fractions.some((f) => f > 0 && f < 1)).toBe(true);
    expect(offline.progress.value).toBeNull();

    const reading = createReading({
      api: offlineApi,
      chapters: stores.chapters,
    });
    await reading.goTo("TST", "RUT", 2);
    expect(reading.error.value).toBeNull();
    expect(reading.fromDevice.value).toBe(true);
    expect(
      JSON.stringify(reading.chapterData.value?.chapter.content)
    ).toContain("Ruth two");
    await reading.next();
    expect([reading.bookId.value, reading.chapterNumber.value]).toEqual([
      "1SA",
      1,
    ]);
    expect(
      JSON.stringify(reading.chapterData.value?.chapter.content)
    ).toContain("Samuel one");
    await reading.prev();
    expect([reading.bookId.value, reading.chapterNumber.value]).toEqual([
      "RUT",
      2,
    ]);

    // Remembered on the device, and a fresh manager sees it.
    const again = createOfflineTranslations({
      api: { getCompleteTranslation: async () => FULL },
      chapters: stores.chapters,
      prefs: stores.prefs,
    });
    await again.load();
    expect(again.has("TST")).toBe(true);

    await again.remove("TST");
    expect(
      (await stores.chapters.keys()).filter((k) => k.includes("TST"))
    ).toEqual([]);
    const fresh = createReading({ api: offlineApi, chapters: stores.chapters });
    await fresh.goTo("TST", "RUT", 1);
    expect(fresh.error.value).toMatch(/offline/);
  });

  it("a failed download leaves nothing behind and says why", async () => {
    const stores = memoryStores();
    const offline = createOfflineTranslations({
      api: {
        getCompleteTranslation: async () => {
          throw new Error("Failed request: 404");
        },
      },
      chapters: stores.chapters,
      prefs: stores.prefs,
    });
    await expect(offline.download("NOPE")).rejects.toThrow(/404/);
    expect(offline.error.value).toMatch(/404/);
    expect(offline.downloaded.value).toEqual([]);
    expect(await stores.chapters.keys()).toEqual([]);
  });
});
