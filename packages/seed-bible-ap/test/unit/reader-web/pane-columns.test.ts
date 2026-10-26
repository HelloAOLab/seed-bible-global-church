// Pane columns: dragging a divider trades width between its two neighbours within a minimum, double-click resets,
// and only a sane remembered set is used.
import { describe, expect, it } from "vitest";
import {
  columnsOf,
  defaultWeights,
  dragWeights,
  gridTemplate,
  validWeights,
} from "../../../apps/reader-web/src/components/reader/paneColumns";

describe("pane columns", () => {
  it("default to equal widths and trade width at a divider within a minimum", () => {
    expect(columnsOf("split-3v")).toBe(3);
    expect(defaultWeights("split-2v")).toEqual([0.5, 0.5]);
    const w = dragWeights([0.5, 0.5], 0, 0.2);
    expect(w[0]).toBeCloseTo(0.7);
    expect(w[1]).toBeCloseTo(0.3);
    const clamped = dragWeights([0.5, 0.5], 0, 0.9);
    expect(clamped[1]).toBeCloseTo(0.15);
    expect(clamped[0]! + clamped[1]!).toBeCloseTo(1);
    const three = dragWeights([1 / 3, 1 / 3, 1 / 3], 1, -0.1);
    expect(three[0]).toBeCloseTo(1 / 3);
    expect(three[1]).toBeCloseTo(1 / 3 - 0.1);
    expect(three[2]).toBeCloseTo(1 / 3 + 0.1);
    expect(gridTemplate([0.25, 0.75])).toBe(
      "minmax(0, 0.2500fr) minmax(0, 0.7500fr)"
    );
  });
  it("accepts only a remembered set that fits the layout and sums to the whole", () => {
    expect(validWeights("split-2v", [0.3, 0.7])).toEqual([0.3, 0.7]);
    expect(validWeights("split-2v", [0.3, 0.3])).toBeNull();
    expect(validWeights("split-2v", [0.3, 0.3, 0.4])).toBeNull();
    expect(validWeights("split-2v", [0.05, 0.95])).toBeNull();
    expect(validWeights("split-2v", "nope")).toBeNull();
  });
});
