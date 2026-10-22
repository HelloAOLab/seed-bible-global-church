// Tabs and panes: every tab reads on its own, the selected slot decides the selected tab, a layout change fills
// new slots with tabs not yet on screen, and closing keeps the panes consistent.
import { describe, expect, it } from "vitest";
import { createTabs } from "../../../apps/reader-web/src/state/reading/tabs";
import {
  createReading,
  type ReadingApi,
} from "../../../apps/reader-web/src/state/reading/reading";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
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
      chapter: { number: Number(c), content: [], footnotes: [] },
      nextChapterApiLink: null,
      previousChapterApiLink: null,
    }) as unknown as TranslationBookChapter,
  getAudioTimings: async () => {
    throw new Error("none");
  },
};

const settle = () => new Promise((r) => setTimeout(r, 0));

function make() {
  let n = 0;
  const chapters = memoryStores().chapters;
  return createTabs({
    newId: () => `t${++n}`,
    makeReading: () => createReading({ api, chapters }),
  });
}

describe("tabs and panes", () => {
  it("opens a first tab, a second from it, and selects between them", async () => {
    const tabs = make();
    const a = tabs.addTab({
      translationId: "BSB",
      bookId: "JHN",
      chapterNumber: 3,
    });
    await settle();
    expect(tabs.selectedId.value).toBe(a.id);
    expect(a.reading.chapterRef.value).toBe("JHN.3");
    const b = tabs.addTab({ from: a });
    await settle();
    expect(b.reading.chapterRef.value).toBe("JHN.3");
    expect(tabs.selectedId.value).toBe(b.id);
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([b.id]);
    tabs.selectTab(a.id);
    expect(tabs.selectedId.value).toBe(a.id);
    expect(tabs.tabs.value).toHaveLength(2);
  });

  it("a two-pane layout shows the selected tab and the next one not on screen", async () => {
    const tabs = make();
    const a = tabs.addTab({ bookId: "JHN", chapterNumber: 1 });
    const b = tabs.addTab({ bookId: "JHN", chapterNumber: 2 });
    tabs.selectTab(a.id);
    tabs.setLayout("split-2v");
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([a.id, b.id]);
    tabs.selectSlot(1);
    expect(tabs.selectedId.value).toBe(b.id);
    // Back to one pane keeps what the first slot showed.
    tabs.setLayout("single");
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([a.id]);
    expect(tabs.selectedId.value).toBe(a.id);
  });

  it("fills an empty slot with a fresh tab at the selected tab's place", async () => {
    const tabs = make();
    const a = tabs.addTab({ bookId: "JHN", chapterNumber: 7 });
    await settle();
    tabs.setLayout("split-2v");
    await settle();
    expect(tabs.tabs.value).toHaveLength(2);
    expect(tabs.slots.value[1]!.reading.chapterRef.value).toBe("JHN.7");
    expect(tabs.selectedId.value).toBe(a.id);
  });

  it("closing a tab gives its slot to a tab off screen, and the last tab closed makes a new one", () => {
    const tabs = make();
    const a = tabs.addTab({ bookId: "JHN", chapterNumber: 1 });
    const b = tabs.addTab({ bookId: "JHN", chapterNumber: 2 });
    const c = tabs.addTab({ bookId: "JHN", chapterNumber: 3 });
    tabs.selectTab(a.id);
    tabs.setLayout("split-2v");
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([a.id, b.id]);
    tabs.closeTab(a.id);
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([c.id, b.id]);
    tabs.closeTab(c.id);
    expect(tabs.layout.value).toBe("single");
    expect(tabs.slots.value.map((t) => t?.id)).toEqual([b.id]);
    tabs.closeTab(b.id);
    expect(tabs.tabs.value).toHaveLength(1);
    expect(tabs.selected.value).not.toBeNull();
  });
});
