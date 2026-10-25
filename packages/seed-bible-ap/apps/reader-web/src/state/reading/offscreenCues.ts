// OFF-SCREEN HIGHLIGHTS — the old reader's offscreenHighlightCues: which of someone else's highlights (a live
// session's) lie wholly above or below the visible reader, gathered into one bubble per run of verses of the same
// colour by the same person, nearest last above and first below.

/** Who made a highlight, drawn on its bubble. */
export interface CueAuthor {
  key: string;
  name: string;
  color: string;
}

/** One highlighted verse, ready to be placed against the visible reader. */
export interface CueMark {
  verse: number;
  styleKey: string;
  background: string;
  textColor: string;
  author: CueAuthor | null;
}

export interface MeasuredCueMark extends CueMark {
  /** Its box, in chapter-content coordinates. */
  top: number;
  bottom: number;
}

/** One bubble for a run of off-screen highlighted verses. */
export interface OffscreenCue {
  key: string;
  direction: "up" | "down";
  /** The run's first verse: a click goes there. */
  verse: number;
  /** "12", or "12–14" when several verses share the bubble. */
  label: string;
  background: string;
  textColor: string;
  author: CueAuthor | null;
}

/** The visible part of the reader, in chapter-content coordinates. */
export interface CueViewport {
  top: number;
  bottom: number;
}

/** One highlighted verse as one particular person painted it. */
export const cueMarkId = (m: CueMark) =>
  `${m.verse}|${m.styleKey}|${m.author?.key ?? ""}`;

/** A listed colour as the ribbon paints it. */
export const cueStyle = (colorId: string) => ({
  styleKey: `preset:${colorId}`,
  background: `var(--sb-highlight-${colorId}-color, transparent)`,
  textColor: `var(--sb-highlight-${colorId}-font-color, #333333)`,
});

/** So close to the edge counts as on screen: a highlight a hair past the fold doesn't flicker a bubble. */
const SLACK_PX = 2;

export function offscreenSide(
  m: MeasuredCueMark,
  v: CueViewport
): "up" | "down" | null {
  if (m.bottom <= m.top) return null;
  if (m.bottom <= v.top + SLACK_PX) return "up";
  if (m.top >= v.bottom - SLACK_PX) return "down";
  return null;
}

export function placeOffscreenCues(
  marks: readonly MeasuredCueMark[],
  v: CueViewport
): { up: OffscreenCue[]; down: OffscreenCue[] } {
  const up: OffscreenCue[] = [];
  const down: OffscreenCue[] = [];
  if (v.bottom <= v.top) return { up, down };
  let run: {
    side: "up" | "down";
    from: number;
    to: number;
    mark: MeasuredCueMark;
  } | null = null;
  const flush = () => {
    if (!run) return;
    const { side, from, to, mark } = run;
    (side === "up" ? up : down).push({
      key: `${side}:${mark.styleKey}:${mark.author?.key ?? ""}:${from}`,
      direction: side,
      verse: from,
      label: from === to ? String(from) : `${from}–${to}`,
      background: mark.background,
      textColor: mark.textColor,
      author: mark.author,
    });
    run = null;
  };
  for (const m of [...marks].sort((a, b) => a.verse - b.verse)) {
    const side = offscreenSide(m, v);
    if (
      run &&
      side === run.side &&
      m.styleKey === run.mark.styleKey &&
      m.author?.key === run.mark.author?.key &&
      m.verse === run.to + 1
    ) {
      run.to = m.verse;
      continue;
    }
    flush();
    if (side) run = { side, from: m.verse, to: m.verse, mark: m };
  }
  flush();
  return { up, down };
}

/** A row that fits shows no arrows; otherwise only on a side with bubbles past the edge. */
export function scrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number
): { left: boolean; right: boolean } {
  const max = scrollWidth - clientWidth;
  if (max <= 1) return { left: false, right: false };
  return { left: scrollLeft > 1, right: scrollLeft < max - 1 };
}
