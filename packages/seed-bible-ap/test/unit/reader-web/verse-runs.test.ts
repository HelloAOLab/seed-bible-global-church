// Chosen verses with gaps: their runs, the reference written from them, and Copy's text in the old reader's format.
import { describe, expect, it } from "vitest";
import {
  copyTextOf,
  runsLabel,
  runsOf,
} from "../../../apps/reader-web/src/state/reading/verseRuns";

describe("chosen verses as runs", () => {
  it("splits a choice into its unbroken runs, in order, whatever order it was tapped in", () => {
    expect(runsOf([18, 16, 19, 3])).toEqual([
      [3, 3],
      [16, 16],
      [18, 19],
    ]);
    expect(runsOf([])).toEqual([]);
    expect(runsOf([5, 5])).toEqual([[5, 5]]);
  });

  it("writes the reference as the old reader does, a dash inside a run and commas between", () => {
    expect(runsLabel(runsOf([16, 18, 19]))).toBe("16, 18–19");
    expect(runsLabel(runsOf([16, 17, 18]))).toBe("16–18");
  });

  it("copies each run's words with its reference after them, runs a blank line apart", () => {
    const words: Record<number, string> = {
      16: "For God so loved the world",
      17: "For God did not send",
      19: "This is the verdict",
    };
    expect(
      copyTextOf(runsOf([16, 17, 19]), (v) => words[v] ?? "", "John", 3, "BSB")
    ).toBe(
      "For God so loved the world For God did not send (John 3:16-17 BSB)\n\nThis is the verdict (John 3:19 BSB)"
    );
  });
});
