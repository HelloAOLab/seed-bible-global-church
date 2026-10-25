// THE CHAPTER COLUMN with the highlight ribbon layer — ported from the `ChapterContent` component of
// packages/seed-bible BibleReader.tsx (`measureRibbons`): every highlighted run's live text geometry is measured
// after each render and on reflow, and drawn as one rounded SVG path BEHIND the text, so a highlight never shifts
// a line or covers a glyph. A new highlight fades in and a removed one fades out; one that only reshaped (an edit, a
// reflow, a neighbour merged in) snaps, as in the original.
import { type ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  RIBBON_PAD_X_EM,
  RIBBON_RADIUS_EM,
  adjacentInlineRect,
  buildRibbonPath,
  collectLineRects,
  type RibbonRect,
} from "./highlightRibbon";
import { OffscreenCues } from "./OffscreenCues";
import type { CueMark } from "../../state/reading/offscreenCues";

interface Ribbon {
  key: string;
  d: string;
  fill: string;
  broadcast: boolean;
  /** The verses it covers. */
  first: number;
  last: number;
  /** Genuinely new: starts transparent and fades in. */
  enter: boolean;
  /** Removed: fading out before it goes. */
  exiting: boolean;
}

const RIBBON_FADE_MS = 250;

const versesOf = (el: HTMLElement): number[] => {
  const inside = Array.from(
    el.querySelectorAll<HTMLElement>("[data-verse-number]")
  ).map((v) => Number(v.dataset["verseNumber"]));
  if (inside.length) return inside;
  const own = el.closest<HTMLElement>("[data-verse-number]");
  return own ? [Number(own.dataset["verseNumber"])] : [];
};

export function ChapterColumn(props: {
  chapterId: string;
  stale?: boolean;
  /** The session's presence gutter, drawn inside the column (which then keeps room for it). */
  gutter?: ComponentChildren;
  /** A phone's note markers down the end edge (the old reader's note gutter): the verses with notes, and what a
   *  marker opens. Given at all (even empty), the gutter is kept open so the text keeps one width. */
  notes?: {
    verses: number[];
    label: (verse: number) => string;
    open: (verse: number) => void;
  };
  /** Someone else's highlights (a live session's): when one lands off screen, a cue points to it. */
  cues?: readonly CueMark[];
  children: ComponentChildren;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const signatureRef = useRef("");
  const chapterIdRef = useRef("");
  const renderedRef = useRef<Ribbon[]>([]);
  const coverageRef = useRef<Set<number>>(new Set());
  const exitTimers = useRef(new Map<string, number>());
  useLayoutEffect(
    () => () => {
      for (const t of exitTimers.current.values()) clearTimeout(t);
    },
    []
  );
  const removeRibbon = (key: string) => {
    exitTimers.current.delete(key);
    renderedRef.current = renderedRef.current.filter((r) => r.key !== key);
    setRibbons(renderedRef.current);
  };

  const measureRibbons = () => {
    const content = contentRef.current;
    if (!content) return;
    if (props.chapterId !== chapterIdRef.current) {
      // Another chapter: nothing fades across the change.
      chapterIdRef.current = props.chapterId;
      signatureRef.current = "";
      for (const t of exitTimers.current.values()) clearTimeout(t);
      exitTimers.current.clear();
      renderedRef.current = [];
      coverageRef.current = new Set();
    }
    const box = content.getBoundingClientRect();
    const style = getComputedStyle(content);
    const fontSize = parseFloat(style.fontSize) || 16;
    const radius = RIBBON_RADIUS_EM * fontSize;
    const padX = RIBBON_PAD_X_EM * fontSize;
    const computedPitch = parseFloat(style.lineHeight);
    const linePitch = computedPitch > fontSize ? computedPitch : fontSize * 1.5;
    const rtl = style.direction === "rtl";

    const runs = Array.from(
      content.querySelectorAll<HTMLElement>("[data-highlight-fill]")
    )
      .map((el, index) => ({
        el,
        key: el.getAttribute("data-highlight-key") || `i${index}`,
        fill: el.getAttribute("data-highlight-fill") ?? "",
        broadcast: el.getAttribute("data-highlight-broadcast") === "true",
        lines: collectLineRects(el, box.left, box.top),
        verses: versesOf(el),
        leadPad: padX,
        trailPad: padX,
      }))
      .filter((run) => run.fill !== "" && run.lines.length > 0);

    // Where a run begins or ends mid-line beside another verse's text, drop the pad on that facing edge so the
    // ribbon stops at its own glyphs and leaves the verse-number margin as a clean gutter.
    const sharesLine = (r: RibbonRect, line: RibbonRect) =>
      r.top < line.bottom - 2 && r.bottom > line.top + 2;
    for (const run of runs) {
      const first = run.lines[0]!;
      const last = run.lines[run.lines.length - 1]!;
      const before = adjacentInlineRect(run.el, "before", box.left, box.top);
      const after = adjacentInlineRect(run.el, "after", box.left, box.top);
      if (before && sharesLine(before, first)) run.leadPad = 0;
      if (after && sharesLine(after, last)) run.trailPad = 0;
    }

    const next: Omit<Ribbon, "enter" | "exiting">[] = [];
    for (const run of runs) {
      const d = buildRibbonPath(run.lines, radius, padX, linePitch, {
        leadPad: run.leadPad,
        trailPad: run.trailPad,
        rtl,
      });
      if (d)
        next.push({
          key: `${props.chapterId}:${run.key}`,
          d,
          fill: run.fill,
          broadcast: run.broadcast,
          first: Math.min(...run.verses),
          last: Math.max(...run.verses),
        });
    }
    const signature = JSON.stringify(next);
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    // A run fades in only when none of its verses were highlighted before, and out only when none are now.
    const covered = new Set<number>();
    for (const r of next)
      for (let v = r.first; v <= r.last; v++) covered.add(v);
    const before = coverageRef.current;
    const liveBefore = new Set(
      renderedRef.current.filter((r) => !r.exiting).map((r) => r.key)
    );
    const liveNow = new Set(next.map((r) => r.key));
    const result: Ribbon[] = next.map((r) => {
      const timer = exitTimers.current.get(r.key);
      if (timer !== undefined) {
        clearTimeout(timer);
        exitTimers.current.delete(r.key);
      }
      let enter = !liveBefore.has(r.key);
      for (let v = r.first; enter && v <= r.last; v++)
        if (before.has(v)) enter = false;
      return { ...r, enter, exiting: false };
    });
    for (const prev of renderedRef.current) {
      if (liveNow.has(prev.key)) continue;
      if (prev.exiting) {
        if (exitTimers.current.has(prev.key)) result.push(prev);
        continue;
      }
      let still = false;
      for (let v = prev.first; !still && v <= prev.last; v++)
        still = covered.has(v);
      if (still) continue;
      result.push({ ...prev, enter: false, exiting: true });
      exitTimers.current.set(
        prev.key,
        window.setTimeout(() => removeRibbon(prev.key), RIBBON_FADE_MS + 50)
      );
    }
    renderedRef.current = result;
    coverageRef.current = covered;
    setRibbons(result);
  };

  // Each marker sits against the first line box of its verse (the line with the verse number), however it wraps.
  const [markers, setMarkers] = useState<
    { verse: number; top: number; height: number }[]
  >([]);
  const markerSignatureRef = useRef("");
  const measureMarkers = () => {
    const content = contentRef.current;
    if (!content) return;
    const next: { verse: number; top: number; height: number }[] = [];
    if (props.notes) {
      const box = content.getBoundingClientRect();
      for (const verse of props.notes.verses) {
        const el = content.querySelector<HTMLElement>(
          `[data-verse-number="${verse}"]`
        );
        const line = el && collectLineRects(el, box.left, box.top)[0];
        if (line)
          next.push({ verse, top: line.top, height: line.bottom - line.top });
      }
    }
    const signature = next
      .map((m) => `${m.verse}:${Math.round(m.top)}:${Math.round(m.height)}`)
      .join("|");
    if (signature === markerSignatureRef.current) return;
    markerSignatureRef.current = signature;
    setMarkers(next);
  };

  const remeasureRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    remeasureRef.current = () => {
      measureRibbons();
      measureMarkers();
    };
    remeasureRef.current();
  });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => remeasureRef.current());
    observer.observe(content);
    // Web fonts arriving after first paint reflow the text under the ribbons.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => remeasureRef.current());
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={contentRef}
      className={`sb-chapter-content${props.stale ? " sb-chapter-content-stale" : ""}${props.gutter ? " sb-chapter-content-presence" : ""}${props.notes ? " sb-chapter-content-note-gutter" : ""}`}
    >
      {props.gutter}
      <svg className="sb-highlight-layer" aria-hidden="true">
        {ribbons.map((ribbon) => (
          <path
            key={ribbon.key}
            className={`sb-highlight-ribbon${ribbon.broadcast ? " sb-highlight-ribbon-broadcast" : ""}${ribbon.enter ? " sb-highlight-ribbon-enter" : ""}`}
            d={ribbon.d}
            style={{
              fill: ribbon.fill,
              stroke: ribbon.broadcast ? ribbon.fill : undefined,
              opacity: ribbon.exiting ? 0 : undefined,
            }}
          />
        ))}
      </svg>
      {props.notes && (
        <div className="sb-note-gutter" aria-hidden={markers.length === 0}>
          {markers.map((m) => (
            <button
              key={m.verse}
              type="button"
              className="sb-note-gutter-marker"
              style={{ top: `${m.top}px`, height: `${m.height}px` }}
              aria-label={props.notes!.label(m.verse)}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                props.notes!.open(m.verse);
              }}
            >
              <span className="material-symbols-outlined">sticky_note_2</span>
            </button>
          ))}
        </div>
      )}
      {props.cues && props.cues.length > 0 && (
        <OffscreenCues contentRef={contentRef} marks={props.cues} />
      )}
      {props.children}
    </div>
  );
}
