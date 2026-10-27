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

  it("remembers the open tabs, the layout and the selection across visits", async () => {
    const stores = memoryStores();
    const first = createReaderState({
      backend: createDevBackend(null),
      stores,
      api,
      session: null,
      isOnline: () => true,
    });
    const stop = await first.start();
    first.tabs.addTab({ bookId: "JHN", chapterNumber: 5 });
    first.tabs.setLayout("split-2v");
    // The new tab sits in slot 0, the first tab moved to slot 1: select the first.
    first.tabs.selectSlot(1);
    expect(first.reading.chapterRef.value).toBe("JHN.1");
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      const saved = (await stores.prefs.get("tabs:open")) as
        | { tabs: { chapterNumber: number }[]; layout: string }
        | undefined;
      if (
        saved?.tabs.length === 2 &&
        saved.layout === "split-2v" &&
        saved.tabs.some((t) => t.chapterNumber === 5)
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
    stop();

    const again = createReaderState({
      backend: createDevBackend(null),
      stores,
      api,
      session: null,
      isOnline: () => true,
    });
    const stop2 = await again.start();
    expect(again.tabs.tabs.value).toHaveLength(2);
    expect(again.tabs.layout.value).toBe("split-2v");
    expect(again.tabs.slotTabIds.value.filter(Boolean)).toHaveLength(2);
    expect(again.tabs.selectedSlot.value).toBe(1);
    expect(again.reading.chapterRef.value).toBe("JHN.1");
    expect(
      again.tabs.slots.value.map((t) => t?.reading.chapterRef.value)
    ).toEqual(["JHN.5", "JHN.1"]);
    stop2();
  });

  it("deleting a published note takes it off the shelf first — never left readable by its link", async () => {
    const SEED = {
      agent: "0x" + "22".repeat(20),
      name: "Seed Reader",
      wire: true,
    };
    const backend = createDevBackend(SEED);
    const state = createReaderState({
      backend,
      stores: memoryStores(),
      api,
      session: null,
      isOnline: () => true,
    });
    const stop = await state.start();
    const id = await state.annotations.add("JHN.3", 16, 16, "loved, and given");
    const note = state.annotations
      .forChapter("JHN.3")
      .value.find((n) => n.id === id)!;
    await state.publishing.publishNote("JHN.3", note, "John 3:16 — Seed");
    expect(await backend.discover({ passage: "JHN.3" })).toHaveLength(1);
    await state.annotations.remove("JHN.3", id);
    expect(state.publishing.isPublished(id)).toBe(false);
    expect(await backend.discover({ passage: "JHN.3" })).toHaveLength(0);
    stop();
  });
});
