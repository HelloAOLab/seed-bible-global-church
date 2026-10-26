// The reader's keys turn the chapter in the direction the text runs, and never steal a key from a field or a
// browser shortcut.
import { describe, expect, it } from "vitest";
import { readerKeyAction } from "../../../apps/reader-web/src/state/chrome/keys";

const ctx = {
  rtl: false,
  hasNext: true,
  hasPrev: true,
  typing: false,
  modifier: false,
};

describe("reader keys", () => {
  it("Right is next and Left is previous in left-to-right text, mirrored in right-to-left", () => {
    expect(readerKeyAction("ArrowRight", ctx)).toBe("next");
    expect(readerKeyAction("ArrowLeft", ctx)).toBe("prev");
    expect(readerKeyAction("ArrowLeft", { ...ctx, rtl: true })).toBe("next");
    expect(readerKeyAction("ArrowRight", { ...ctx, rtl: true })).toBe("prev");
  });

  it("does nothing at the first or last chapter", () => {
    expect(
      readerKeyAction("ArrowRight", { ...ctx, hasNext: false })
    ).toBeNull();
    expect(readerKeyAction("ArrowLeft", { ...ctx, hasPrev: false })).toBeNull();
  });

  it("leaves keys alone while typing or with a modifier, except Escape", () => {
    expect(readerKeyAction("ArrowRight", { ...ctx, typing: true })).toBeNull();
    expect(readerKeyAction("ArrowUp", { ...ctx, modifier: true })).toBeNull();
    expect(readerKeyAction("Escape", { ...ctx, typing: true })).toBe("escape");
    expect(readerKeyAction("ArrowUp", ctx)).toBe("search");
    expect(readerKeyAction("a", ctx)).toBeNull();
  });
});
