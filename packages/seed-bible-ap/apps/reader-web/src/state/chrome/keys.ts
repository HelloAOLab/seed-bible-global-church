// THE READER'S KEYS — the old TabsLayout key handler: Left / Right turn the chapter (the next chapter sits to the
// right in left-to-right text and to the left in right-to-left, like the toolbar chevrons and the swipe), Up opens
// search, Escape closes what is open (the book picker, then the verse selection, then the side pane). Never while
// typing in a field, and never with a modifier held (so the browser's own shortcuts stay its own).
export type ReaderKeyAction = "next" | "prev" | "search" | "escape" | null;

export interface ReaderKeyContext {
  rtl: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  /** The key landed in an input, a textarea, a select or an editable note. */
  typing: boolean;
  modifier: boolean;
}

export function readerKeyAction(
  key: string,
  c: ReaderKeyContext
): ReaderKeyAction {
  if (key === "Escape") return "escape";
  if (c.typing || c.modifier) return null;
  if (key === "ArrowUp") return "search";
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const next = key === (c.rtl ? "ArrowLeft" : "ArrowRight");
  if (next) return c.hasNext ? "next" : null;
  return c.hasPrev ? "prev" : null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}
