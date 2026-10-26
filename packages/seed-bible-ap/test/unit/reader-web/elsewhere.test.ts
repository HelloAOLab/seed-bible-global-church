// ELSEWHERE AT A VERSE: the parallels and the Greek at the selected verse (or the chapter), parallels first; a parallel
// is listed by what it is to the verse; a quoting scroll is named by the work it belongs to.
import { describe, expect, it } from "vitest";
import {
  elsewhereFor,
  relationSection,
} from "../../../apps/reader-web/src/extensions/elsewhere";
import {
  quoteName,
  scrollName,
} from "../../../apps/reader-web/src/extensions/scrolls";
import type { PassageItem } from "../../../apps/reader-web/src/state/passage";

const ISA_40 = 23_040_001; // Isaiah 40:1 as an ordinal
const at = (kind: string, verse: number, title: string): PassageItem => ({
  source: "scripture",
  kind,
  title,
  locus: {
    id: "0x",
    alias: "",
    type: "verse",
    span: [ISA_40 - 1 + verse, ISA_40 - 1 + verse],
    ref: `ISA.40.${verse}`,
  },
});

describe("Elsewhere in the Bible", () => {
  const items = [
    at("septuagint", 3, "Septuagint"),
    at("parallel", 3, "Matt.3.3"),
    at("parallel", 9, "Isa.52.7"),
    at("cross-reference", 3, "Mal.3.1"),
  ];
  it("a selected verse: its parallels, then its Greek — nothing else", () => {
    expect(elsewhereFor(items, ISA_40, [3]).map((i) => i.title)).toEqual([
      "Matt.3.3",
      "Septuagint",
    ]);
  });
  it("the chapter: every verse's, parallels first", () => {
    expect(elsewhereFor(items, ISA_40, []).map((i) => i.title)).toEqual([
      "Matt.3.3",
      "Isa.52.7",
      "Septuagint",
    ]);
  });
  it("says what a parallel is, and names a quoting scroll by its work", () => {
    expect(relationSection("ot-in-nt")).toBe("Quoted in the New Testament");
    expect(relationSection("ot-parallel")).toBe("Parallel passages");
    expect(
      scrollName(
        quoteName("1QS — 1Q Community Rule", "Community Rule"),
        "1QS 8:14"
      )
    ).toEqual({
      scroll: "Community Rule (1QS)",
      line: "8:14",
    });
  });
});

describe("a quotation found by code", () => {
  it("says so plainly, with how often such a match is right", async () => {
    const { foundByWords } =
      await import("../../../apps/reader-web/src/extensions/scrolls");
    expect(
      foundByWords(
        "derived by code (scripts/dss/find-quotations.py, ≥ 14 preserved consonants, restorations excluded; precision 0.9888 on the biblical lines)"
      )
    ).toBe(
      "Found by a computer matching the scroll's words to the verse — right about 99 times in 100."
    );
    expect(foundByWords(null)).toBeNull();
  });
});
