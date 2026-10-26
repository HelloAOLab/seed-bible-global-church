// THE DEAD SEA SCROLLS IN DISCOVER: a selected verse lists the scroll lines that hold it (a line across verses 1–2 is
// at verse 2), with no selection the whole chapter's, in verse order; the verses and the draft's state are said in
// plain words.
import { describe, expect, it } from "vitest";
import {
  plainStatus,
  scrollName,
  scrollLinesFor,
  verseLabel,
} from "../../../apps/reader-web/src/extensions/scrolls";
import type { PassageItem } from "../../../apps/reader-web/src/state/passage";

const GEN_1 = 1_001_001; // Genesis 1:1 as an ordinal (book 1, chapter 1, verse 1)
const line = (
  title: string,
  from: number,
  to: number,
  kind = "scroll-line"
): PassageItem => ({
  source: "publishing",
  kind,
  title,
  locus: {
    id: "0x",
    alias: "",
    type: from === to ? "verse" : "range",
    span: [GEN_1 - 1 + from, GEN_1 - 1 + to],
    ref: `GEN.1.${from}${from === to ? "" : `-GEN.1.${to}`}`,
  },
});

describe("Dead Sea Scrolls in Discover", () => {
  const items = [
    line("4Q7 f1:2", 2, 3),
    line("4Q7 f1:1", 1, 2),
    line("4Q2 f1:9", 9, 9),
    line("Nicodemus", 2, 2, "person"),
  ];
  it("a selected verse lists the lines that hold it, in verse order", () => {
    expect(scrollLinesFor(items, GEN_1, [2]).map((i) => i.title)).toEqual([
      "4Q7 f1:1",
      "4Q7 f1:2",
    ]);
    expect(scrollLinesFor(items, GEN_1, [5])).toEqual([]);
  });
  it("with no selection, the whole chapter's lines and nothing else", () => {
    expect(scrollLinesFor(items, GEN_1, []).map((i) => i.title)).toEqual([
      "4Q7 f1:1",
      "4Q7 f1:2",
      "4Q2 f1:9",
    ]);
  });
  it("says the verses and the draft's state in plain words", () => {
    const name = (id: string) => ({ GEN: "Genesis" })[id] ?? id;
    expect(verseLabel("GEN.1.1-GEN.1.2", name)).toBe("Genesis 1:1–2");
    expect(verseLabel("GEN.1.31-GEN.2.1", name)).toBe("Genesis 1:31–2:1");
    expect(verseLabel("GEN.1.9", name)).toBe("Genesis 1:9");
    expect(
      plainStatus(
        "first-draft · human-pending · condition: reconstructed and uncertain"
      )
    ).toBe("First draft, waiting for a person to check it");
    expect(plainStatus(null)).toBeNull();
  });
});

describe("a scroll named once", () => {
  it("says the scroll by its name and the line without the siglum twice", () => {
    expect(scrollName("4Q7 — 4Q Genesis", "4Q7 f1:1")).toEqual({
      scroll: "4Q Genesis (4Q7)",
      line: "f1:1",
    });
    expect(scrollName("Dead Sea Scrolls", "4Q2 f1:9")).toEqual({
      scroll: "Dead Sea Scrolls",
      line: "4Q2 f1:9",
    });
  });
});
