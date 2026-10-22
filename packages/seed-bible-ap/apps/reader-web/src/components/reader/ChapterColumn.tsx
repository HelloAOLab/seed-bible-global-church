// THE CHAPTER COLUMN with the highlight ribbon layer — ported from the `ChapterContent` component of
// packages/seed-bible BibleReader.tsx (`measureRibbons`): every highlighted run's live text geometry is measured
// after each render and on reflow, and drawn as one rounded SVG path BEHIND the text, so a highlight never shifts
// a line or covers a glyph. The fade in/out bookkeeping of the original is left out of this cut.
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

interface Ribbon {
  key: string;
  d: string;
  fill: string;
  broadcast: boolean;
}

export function ChapterColumn(props: {
  chapterId: string;
  stale?: boolean;
  children: ComponentChildren;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const signatureRef = useRef("");
  const chapterIdRef = useRef("");

  const measureRibbons = () => {
    const content = contentRef.current;
    if (!content) return;
    if (props.chapterId !== chapterIdRef.current) {
      chapterIdRef.current = props.chapterId;
      signatureRef.current = "";
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

    const next: Ribbon[] = [];
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
        });
    }
    const signature = JSON.stringify(next);
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    setRibbons(next);
  };

  const remeasureRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    remeasureRef.current = measureRibbons;
    measureRibbons();
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
      className={`sb-chapter-content${props.stale ? " sb-chapter-content-stale" : ""}`}
    >
      <svg className="sb-highlight-layer" aria-hidden="true">
        {ribbons.map((ribbon) => (
          <path
            key={ribbon.key}
            className={`sb-highlight-ribbon${ribbon.broadcast ? " sb-highlight-ribbon-broadcast" : ""}`}
            d={ribbon.d}
            style={{
              fill: ribbon.fill,
              stroke: ribbon.broadcast ? ribbon.fill : undefined,
            }}
          />
        ))}
      </svg>
      {props.children}
    </div>
  );
}
