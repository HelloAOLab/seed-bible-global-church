// THE READER'S VIEWPORT (test-plan A3.8): the scroll offset is the tab's — saved as the pane scrolls, restored when
// the tab comes back, zero for a new chapter — on a desktop and a phone width; a linked verse is brought into view
// once; a horizontal swipe turns the page, mirrored for a right-to-left translation; a vertical drag or a nudge
// does nothing. Mounted through createTestReaderState and TestHost; geometry stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "preact/test-utils";
import { waitFor } from "@testing-library/preact";
import { PanesLayout } from "../../apps/reader-web/src/components/reader/PanesLayout";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";
import { bibleResponses, BSB, JOHN } from "../helpers/bibleResponses";
import type { TranslationBookChapter } from "../../apps/reader-web/src/backend/bible";

const API = "https://bible.helloao.org/api";
function johnChapter(n: number, rtl = false): TranslationBookChapter {
  return {
    translation: { ...BSB, textDirection: rtl ? "rtl" : "ltr" },
    book: JOHN,
    chapter: {
      number: n,
      content: [1, 16, 17].map((v) => ({
        type: "verse",
        number: v,
        content: [`John ${n}:${v}`],
      })),
      footnotes: [],
    },
    nextChapterApiLink: n < 21 ? `${API}/BSB/JHN/${n + 1}.json` : null,
    previousChapterApiLink: n > 1 ? `${API}/BSB/JHN/${n - 1}.json` : null,
  } as unknown as TranslationBookChapter;
}

async function mount(opts: { width: number; rtl?: boolean }) {
  vi.stubGlobal("innerWidth", opts.width);
  const bible = bibleResponses();
  for (const n of [1, 2, 3, 4]) bible.addChapter(johnChapter(n, opts.rtl));
  const t = await createTestReaderState({
    url: "/read/BSB/JHN/3",
    bible,
    identity: null,
  });
  const stop = await t.state.start();
  const r = renderInHost(<PanesLayout state={t.state} />);
  await waitFor(() =>
    expect(r.container.querySelector('[data-verse-number="16"]')).not.toBeNull()
  );
  const scroller = () =>
    r.container.querySelector<HTMLElement>(".sb-pane-reader")!;
  const tab = () => t.state.tabs.selected.value!;
  const scrollTo = (top: number) =>
    act(() => {
      scroller().scrollTop = top;
      scroller().dispatchEvent(new Event("scroll"));
    });
  const touch = (type: string, x: number, y: number) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "touches", {
      value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
    });
    Object.defineProperty(e, "changedTouches", {
      value: [{ clientX: x, clientY: y }],
    });
    r.container.querySelector(".sb-bible-reader")!.dispatchEvent(e);
  };
  const swipe = (dx: number, dy = 0) => {
    touch("touchstart", 200, 300);
    touch("touchmove", 200 + dx / 2, 300 + dy / 2);
    touch("touchmove", 200 + dx, 300 + dy);
    touch("touchend", 200 + dx, 300 + dy);
  };
  return { ...t, r, stop, scroller, tab, scrollTo, swipe, bible };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe.each([
  ["desktop", 1280],
  ["phone", 390],
])("the reader viewport on a %s", (_name, width) => {
  it("saves the scroll offset on the tab and restores it when the tab comes back; a new chapter starts at the top", async () => {
    const m = await mount({ width });
    const first = m.tab();
    m.scrollTo(87);
    expect(first.reading.scrollPosition.value).toBe(87);
    expect(
      Object.getOwnPropertyDescriptor(m.scroller(), "scrollTop")
    ).toBeUndefined();

    // A second tab in the same slot: its own chapter, its own offset (zero).
    const second = m.state.tabs.addTab({
      translationId: "BSB",
      bookId: "JHN",
      chapterNumber: 4,
    });
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 4:16")
    );
    expect(m.scroller().scrollTop).toBe(0);
    m.scrollTo(240);
    expect(second.reading.scrollPosition.value).toBe(240);
    expect(first.reading.scrollPosition.value).toBe(87);

    // Back to the first: the pane is where it was.
    act(() => m.state.tabs.selectTab(first.id));
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 3:16")
    );
    expect(m.scroller().scrollTop).toBe(87);

    // Turning the page puts the pane at the top.
    await act(() => first.reading.next());
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 4:16")
    );
    expect(first.reading.scrollPosition.value).toBe(0);
    expect(m.scroller().scrollTop).toBe(0);
    m.stop();
  });

  it("does not stamp a scroll onto a chapter the tab has already left", async () => {
    const m = await mount({ width });
    const reading = m.tab().reading;
    // The reading points at the next chapter while its text is still loading.
    reading.chapterNumber.value = 4;
    m.scrollTo(211);
    expect(reading.scrollPosition.value).toBe(0);
    m.stop();
  });
});

describe("a linked verse", () => {
  it("is brought into view once its chapter is on screen, then forgotten", async () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const m = await mount({ width: 1280 });
      const reading = m.tab().reading;
      // Asked while the chapter is on screen: now.
      act(() => {
        reading.scrollToVerse.value = 16;
      });
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "center",
          inline: "nearest",
        })
      );
      const first = scrollIntoView.mock.instances[0] as HTMLElement;
      expect(first.getAttribute("data-verse-number")).toBe("16");
      expect(first.textContent).toContain("John 3:16");
      expect(reading.scrollToVerse.value).toBeNull();

      // Asked while the next chapter is still loading (a share link): once its text is on screen, and once only.
      scrollIntoView.mockClear();
      const opening = reading.goTo("BSB", "JHN", 2);
      reading.scrollToVerse.value = 17;
      expect(scrollIntoView).not.toHaveBeenCalled();
      await act(() => opening);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      const second = scrollIntoView.mock.instances[0] as HTMLElement;
      expect(second.textContent).toContain("John 2:17");
      expect(reading.scrollToVerse.value).toBeNull();
      await new Promise((r) => setTimeout(r, 20));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      m.stop();
    } finally {
      raf.mockRestore();
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
        "scrollIntoView"
      ];
    }
  });
});

describe("a swipe", () => {
  it("turns the page: left for the next chapter, right for the previous, in a left-to-right text", async () => {
    const m = await mount({ width: 390 });
    const reading = m.tab().reading;
    m.state.selection.select(16, 16);
    m.swipe(-120);
    await waitFor(() => expect(reading.chapterNumber.value).toBe(4));
    expect(m.state.selection.verses.value).toEqual([]);
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 4:16")
    );
    m.swipe(120);
    await waitFor(() => expect(reading.chapterNumber.value).toBe(3));
    m.stop();
  });

  it("is mirrored in a right-to-left text", async () => {
    const m = await mount({ width: 390, rtl: true });
    const reading = m.tab().reading;
    m.swipe(-120);
    await waitFor(() => expect(reading.chapterNumber.value).toBe(2));
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 2:16")
    );
    m.swipe(120);
    await waitFor(() => expect(reading.chapterNumber.value).toBe(3));
    m.stop();
  });

  it("ignores a vertical drag, a short nudge, and a page there is none of", async () => {
    const m = await mount({ width: 390 });
    const reading = m.tab().reading;
    m.swipe(-120, 200);
    m.swipe(-30);
    await new Promise((r) => setTimeout(r, 20));
    expect(reading.chapterNumber.value).toBe(3);
    await act(() => reading.goTo("BSB", "JHN", 1));
    await waitFor(() =>
      expect(m.r.container.textContent).toContain("John 1:16")
    );
    m.swipe(120);
    await new Promise((r) => setTimeout(r, 20));
    expect(reading.chapterNumber.value).toBe(1);
    m.stop();
  });
});
