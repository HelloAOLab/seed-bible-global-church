// THE READER'S VIEWPORT — ported from the old reader (TabsLayout's scroll effects and chapter swipe, BibleReader's
// readerViewport.ts), trimmed to this reader's one scroller per pane. Three behaviours, each a pure rule plus the
// wiring (`attachReaderViewport`):
//   · the scroll offset is the TAB's: saved as the pane scrolls (only while the chapter on screen is the tab's),
//     restored when the tab comes back, zero for a new chapter;
//   · a linked verse (`?v=`) is brought into view once its chapter is on screen, then forgotten;
//   · a horizontal swipe turns the page — next for a swipe towards the end of the text, so mirrored in a
//     right-to-left translation; a vertical drag or a short nudge does nothing.
import { effect } from "@preact/signals";
import type { Reading } from "../../state/reading/reading";

/** How far a finger must travel before the gesture is a swipe rather than a scroll. */
export const SWIPE_LOCK_THRESHOLD_PX = 10;
/** How far a horizontal swipe must go to turn the page. */
export const SWIPE_COMMIT_PX = 60;

export interface SwipeInput {
  dx: number;
  dy: number;
  rtl: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  commitPx?: number;
}

/** What a finished gesture asks for: the next chapter, the previous, or nothing. */
export function swipeOutcome(input: SwipeInput): "next" | "prev" | null {
  const { dx, dy, rtl, hasNext, hasPrev } = input;
  const commitPx = input.commitPx ?? SWIPE_COMMIT_PX;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  if (Math.abs(dx) < Math.max(commitPx, SWIPE_LOCK_THRESHOLD_PX)) return null;
  // Towards the end of the text: left in left-to-right, right in right-to-left.
  const towardsNext = rtl ? dx > 0 : dx < 0;
  if (towardsNext) return hasNext ? "next" : null;
  return hasPrev ? "prev" : null;
}

/** The nearest ancestor that scrolls, else the pane the reader sits in, else the root itself. */
/** Whether the page itself scrolls the reader (a phone-width layout). */
export const pageScrolls = () =>
  typeof matchMedia !== "undefined" && matchMedia("(max-width: 720px)").matches;

export function scrollerOf(root: HTMLElement): HTMLElement {
  for (
    let node = root.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  // A phone scrolls the PAGE (styles/app.css), so the browser can fold its own bars away as the reader reads.
  if (pageScrolls()) return document.scrollingElement as HTMLElement;
  return root.closest<HTMLElement>(".sb-pane-reader") ?? root;
}

/** Whether the chapter on screen is the one the reading points at (content can lag a navigation). */
export function contentMatches(reading: Reading): boolean {
  const c = reading.chapterData.value;
  return (
    !!c &&
    c.translation.id === reading.translationId.value &&
    c.book.id === reading.bookId.value &&
    c.chapter.number === reading.chapterNumber.value
  );
}

export interface ViewportHooks {
  /** Before the page turns on a swipe (the selection is cleared, say). */
  onNavigate?: () => void;
  commitPx?: number;
}

/**
 * Wire a reader's root to its tab's reading: scroll memory, the linked verse, and the swipe. Returns the detach.
 */
export function attachReaderViewport(
  root: HTMLElement,
  reading: Reading,
  hooks: ViewportHooks = {}
): () => void {
  const scroller = scrollerOf(root);
  const stops: Array<() => void> = [];

  // Scroll memory: saved while the chapter on screen is the tab's (a scroll while the next chapter loads would
  // stamp the old offset onto the new one).
  const onScroll = () => {
    if (contentMatches(reading))
      reading.scrollPosition.value = scroller.scrollTop;
  };
  // The page's scroll is reported on the window, not on its scrolling element.
  const scrollEvents: EventTarget =
    typeof document !== "undefined" && scroller === document.scrollingElement
      ? window
      : scroller;
  scrollEvents.addEventListener("scroll", onScroll, { passive: true });
  stops.push(() => scrollEvents.removeEventListener("scroll", onScroll));

  // Restore on a position change (the tab coming back, a navigation: zero), once more when matching content
  // arrives (the first write was clamped against the skeleton), never on later content identity changes. A linked
  // verse, asked for before or after the chapter is on screen, is brought into view as soon as both hold.
  let lastKey = "";
  let appliedForContent = false;
  let frame = 0;
  stops.push(
    effect(() => {
      const key = `${reading.translationId.value}:${reading.bookId.value}:${reading.chapterNumber.value}`;
      const matches = contentMatches(reading);
      const verse = reading.scrollToVerse.value;
      if (key !== lastKey) {
        lastKey = key;
        appliedForContent = false;
        scroller.scrollTop = reading.scrollPosition.peek();
      }
      if (!matches) return;
      if (verse !== null) {
        appliedForContent = true;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const el = root.querySelector<HTMLElement>(
            `[data-verse-number="${verse}"]`
          );
          el?.scrollIntoView({ block: "center", inline: "nearest" });
          if (reading.scrollToVerse.peek() === verse)
            reading.scrollToVerse.value = null;
        });
        return;
      }
      if (appliedForContent) return;
      appliedForContent = true;
      const offset = reading.scrollPosition.peek();
      if (offset !== 0 && scroller.scrollTop !== offset)
        scroller.scrollTop = offset;
    })
  );
  stops.push(() => cancelAnimationFrame(frame));

  // The swipe.
  let startX: number | null = null;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  const touchOf = (e: Event) =>
    (e as TouchEvent).touches?.[0] ?? (e as TouchEvent).changedTouches?.[0];
  const onTouchStart = (e: Event) => {
    const t = touchOf(e);
    if (!t) return;
    startX = lastX = t.clientX;
    startY = lastY = t.clientY;
  };
  const onTouchMove = (e: Event) => {
    const t = touchOf(e);
    if (!t || startX === null) return;
    lastX = t.clientX;
    lastY = t.clientY;
  };
  const onTouchEnd = () => {
    if (startX === null) return;
    const dx = lastX - startX;
    const dy = lastY - startY;
    startX = null;
    const outcome = swipeOutcome({
      dx,
      dy,
      rtl: reading.translation.value?.textDirection === "rtl",
      hasNext: reading.hasNext.value,
      hasPrev: reading.hasPrev.value,
      ...(hooks.commitPx ? { commitPx: hooks.commitPx } : {}),
    });
    if (!outcome) return;
    hooks.onNavigate?.();
    void (outcome === "next" ? reading.next() : reading.prev());
  };
  root.addEventListener("touchstart", onTouchStart, { passive: true });
  root.addEventListener("touchmove", onTouchMove, { passive: true });
  root.addEventListener("touchend", onTouchEnd);
  root.addEventListener("touchcancel", () => (startX = null));
  stops.push(() => {
    root.removeEventListener("touchstart", onTouchStart);
    root.removeEventListener("touchmove", onTouchMove);
    root.removeEventListener("touchend", onTouchEnd);
  });

  return () => stops.forEach((s) => s());
}
