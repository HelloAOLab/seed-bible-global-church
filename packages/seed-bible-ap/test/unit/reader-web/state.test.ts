// The whole reader state wires up in order — a declaration used before it exists is a crash only the browser would
// see otherwise. Over the dev backend, the memory stores and a fake Bible API.
import { describe, expect, it } from "vitest";
import { createReaderState } from "../../../apps/reader-web/src/state";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import type { ReadingApi } from "../../../apps/reader-web/src/state/reading/reading";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";

const api: ReadingApi = {
  getAvailableTranslations: async () => ({ translations: [] }),
  getTranslationBooks: async () =>
    ({
      translation: { id: "BSB" },
      books: [
        { id: "JHN", name: "John", commonName: "John", numberOfChapters: 21 },
      ],
    }) as never,
  getTranslationBookChapter: async (t, b, c) =>
    ({
      translation: { id: t },
      book: { id: b, name: "John" },
      chapter: {
        number: Number(c),
        content: [{ type: "verse", number: 1, content: ["x"] }],
        footnotes: [],
      },
      nextChapterApiLink: null,
      previousChapterApiLink: null,
    }) as unknown as TranslationBookChapter,
  getAudioTimings: async () => {
    throw new Error("none");
  },
};

describe("the reader state", () => {
  it("constructs, opens a first tab, and exposes every manager", async () => {
    const state = createReaderState({
      backend: createDevBackend(null),
      stores: memoryStores(),
      api,
      session: null,
      isOnline: () => true,
    });
    const stop = await state.start();
    expect(state.tabs.tabs.value).toHaveLength(1);
    expect(state.reading.chapterRef.value).toMatch(/^JHN\.\d+$/);
    for (const k of [
      "highlights",
      "annotations",
      "bookmarks",
      "saves",
      "search",
      "discover",
      "publishing",
      "today",
      "live",
      "audio",
      "tts",
      "settings",
      "selection",
      "ui",
    ] as const)
      expect(state[k], k).toBeTruthy();
    expect(state.live.active.value).toBe(false);
    state.selection.toggle(1);
    expect(state.selection.verses.value).toEqual([1]);
    stop();
  });
});
