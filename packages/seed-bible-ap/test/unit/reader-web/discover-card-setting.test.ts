// @vitest-environment jsdom
// THE DISCOVER CARD STARTS ON, BESIDE THE TEXT — seedbible.org's discoveredContent.showContent and
// discoverContentPanelInline both default to true. A day of this reader's builds saved the card as off for everyone
// (`showDiscovered: false`); that old value is not read, so it comes back. A reader's own later choice is kept.
import { afterEach, describe, expect, it } from "vitest";
import { createSettings } from "../../../apps/reader-web/src/state/chrome/settings";

const KEY = "sbr.settings";
afterEach(() => localStorage.clear());

describe("the Discover card setting", () => {
  it("is on and beside the text on a new device", () => {
    const s = createSettings();
    expect(s.showDiscovered.value).toBe(true);
    expect(s.discoverInline.value).toBe(true);
  });

  it("comes back for a reader whose settings saved the old default (off)", () => {
    localStorage.setItem(KEY, JSON.stringify({ showDiscovered: false }));
    expect(createSettings().showDiscovered.value).toBe(true);
  });

  it("keeps a reader's own choice: hidden, or below the text", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ showDiscoverCard: false, discoverInline: false })
    );
    const s = createSettings();
    expect(s.showDiscovered.value).toBe(false);
    expect(s.discoverInline.value).toBe(false);
  });
});
