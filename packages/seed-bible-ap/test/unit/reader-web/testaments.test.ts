// The book picker's testament filter groups by the API's canonical order, and offers the Apocrypha only when a
// translation carries it.
import { describe, expect, it } from "vitest";
import {
  groupByTestament,
  testamentChoices,
  testamentOf,
} from "../../../apps/reader-web/src/state/reading/testaments";

const book = (id: string, order: number) => ({ id, order });

describe("testaments", () => {
  it("splits at Malachi (39) and Revelation (66)", () => {
    expect([1, 39, 40, 66, 67, 80].map(testamentOf)).toEqual([
      "old",
      "old",
      "new",
      "new",
      "apocrypha",
      "apocrypha",
    ]);
  });

  it("groups books in canonical order, whatever order they came in", () => {
    const g = groupByTestament([
      book("JHN", 43),
      book("GEN", 1),
      book("TOB", 67),
      book("MAL", 39),
      book("MAT", 40),
    ]);
    expect(g.old.map((b) => b.id)).toEqual(["GEN", "MAL"]);
    expect(g.new.map((b) => b.id)).toEqual(["MAT", "JHN"]);
    expect(g.apocrypha.map((b) => b.id)).toEqual(["TOB"]);
  });

  it("offers the Apocrypha only when the translation has it, and a New-Testament-only translation still lists both testaments", () => {
    expect(testamentChoices([book("GEN", 1), book("MAT", 40)])).toEqual([
      "all",
      "old",
      "new",
    ]);
    expect(testamentChoices([book("GEN", 1), book("TOB", 67)])).toEqual([
      "all",
      "old",
      "new",
      "apocrypha",
    ]);
    expect(groupByTestament([book("MAT", 40)]).old).toEqual([]);
  });
});
