// COLUMN WEIGHTS for the pane layouts: how wide each column is, as fractions that sum to the whole, dragged at the
// dividers and remembered per layout on the device. Pure, so the drag arithmetic is testable without a DOM.
import type { LayoutId } from "../../state/reading/tabs";

/** How many columns a layout has (rows are never resized). */
export const columnsOf = (layout: LayoutId): number =>
  ({
    single: 1,
    "split-2v": 2,
    "split-left-two-right": 2,
    "split-3v": 3,
    "grid-2x2": 2,
    "split-4v": 4,
  })[layout];

const MIN = 0.15;

/** Equal columns, the default; the left-plus-two layout leans left as the old grid did. */
export function defaultWeights(layout: LayoutId): number[] {
  const n = columnsOf(layout);
  if (layout === "split-left-two-right") return [1.2 / 2.2, 1 / 2.2];
  return Array.from({ length: n }, () => 1 / n);
}

/** The divider after column `i` moved by `delta` (a fraction of the whole width): the two columns beside it trade width. */
export function dragWeights(
  weights: readonly number[],
  i: number,
  delta: number
): number[] {
  const out = [...weights];
  const a = out[i];
  const b = out[i + 1];
  if (a === undefined || b === undefined) return out;
  const na = Math.min(Math.max(a + delta, MIN), a + b - MIN);
  out[i] = na;
  out[i + 1] = a + b - na;
  return out;
}

export const gridTemplate = (weights: readonly number[]): string =>
  weights.map((w) => `minmax(0, ${w.toFixed(4)}fr)`).join(" ");

/** A remembered set is used only when it fits the layout and is sane. */
export function validWeights(layout: LayoutId, v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== columnsOf(layout)) return null;
  if (!v.every((x) => typeof x === "number" && x >= MIN - 1e-9 && x <= 1))
    return null;
  const sum = (v as number[]).reduce((s, x) => s + x, 0);
  return Math.abs(sum - 1) < 1e-3 ? (v as number[]) : null;
}
