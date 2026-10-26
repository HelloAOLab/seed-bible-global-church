// THE READER'S TEXT STYLE: each section's font, weight and italics become the page's --text-* properties (unset
// ones removed so the default applies); a Google font is loaded only when chosen; a stored value this build does not
// offer is dropped rather than injected into the page.
import { describe, expect, it } from "vitest";
import {
  cleanTextStyle,
  textStyleProperties,
  textStyleSheets,
} from "../../../apps/reader-web/src/state/chrome/textStyle";

describe("the reader's text style", () => {
  it("sets a chosen section and removes the rest", () => {
    const p = textStyleProperties({
      verse: { font: "'Inter', sans-serif", weight: "300", italic: true },
    });
    expect(p["--text-verse-font"]).toBe("'Inter', sans-serif");
    expect(p["--text-verse-weight"]).toBe("300");
    expect(p["--text-verse-font-style"]).toBe("italic");
    expect(p["--text-heading-font"]).toBeNull();
    expect(p["--text-bookTitle-weight"]).toBeNull();
  });

  it("loads a Google font only when a section uses it", () => {
    expect(textStyleSheets({})).toEqual([]);
    expect(
      textStyleSheets({
        heading: { font: "'Roboto', sans-serif" },
        verse: { font: "'Newsreader', serif" },
      })
    ).toEqual([
      expect.stringMatching(
        /^https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto/
      ),
    ]);
  });

  it("drops a stored font or weight it does not offer", () => {
    expect(
      cleanTextStyle({
        verse: {
          font: "x; background:url(https://evil.test)",
          weight: "900",
          italic: "yes",
        },
        heading: { font: "system-ui, sans-serif", weight: "700" },
        nonsense: { font: "'Inter', sans-serif" },
      })
    ).toEqual({ heading: { font: "system-ui, sans-serif", weight: "700" } });
    expect(cleanTextStyle("garbage")).toEqual({});
  });
});
