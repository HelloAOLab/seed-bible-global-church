// OFF-SCREEN HIGHLIGHTS — the old reader's OffscreenHighlightCueLayer: when someone else's highlight (a live
// session's) lands above or below the visible reader, pills open at that edge for a few seconds — the highlight's
// colour, who made it, an arrow and "Highlighted verse N" — then fold into a small indicator in the end corner, which
// opens them again on hover and goes to the nearest one on a click. A row too wide for the reader scrolls sideways.
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "../../i18n";
import {
  cueMarkId,
  offscreenSide,
  placeOffscreenCues,
  scrollEdges,
  type CueMark,
  type CueViewport,
  type MeasuredCueMark,
  type OffscreenCue,
} from "../../state/reading/offscreenCues";
import { scrollerOf } from "./readerViewport";

/** How long the pills stay open after a new highlight lands off screen. */
const NOTIFY_MS = 3000;
/** Time to cross from the indicator to the pills before they close. */
const HOVER_CLOSE_MS = 250;
const MAX_ICONS = 3;
const DRAG_PX = 6;

/** The part of the reader that can be seen, in the chapter content's coordinates: inside its scroller and the
 *  window, above the bar along the bottom. */
function visibleBounds(
  content: HTMLElement,
  scroller: HTMLElement
): CueViewport {
  const c = content.getBoundingClientRect();
  const page = scroller === document.scrollingElement;
  const s = page
    ? { top: 0, bottom: window.innerHeight }
    : scroller.getBoundingClientRect();
  const top = Math.max(s.top, 0);
  let bottom = Math.min(s.bottom, window.innerHeight);
  for (const sel of [
    ".sb-phone-nav",
    ".sb-reader-toolbar-desk",
    ".sb-reader-toolbar-wrap-embed",
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    const r = el?.getBoundingClientRect();
    if (r && r.height > 0 && r.top > top && r.top < bottom) bottom = r.top;
  }
  return { top: top - c.top, bottom: bottom - c.top };
}

const reduceMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function OffscreenCues({
  contentRef,
  marks,
}: {
  contentRef: RefObject<HTMLDivElement>;
  marks: readonly CueMark[];
}) {
  const { t } = useI18n();
  const [cues, setCues] = useState<{
    up: OffscreenCue[];
    down: OffscreenCue[];
    top: number;
    height: number;
  } | null>(null);
  const [notifying, setNotifying] = useState(false);
  const notifyTimer = useRef<number | null>(null);
  const signature = useRef("");
  const frame = useRef<number | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  // Highlights already seen, and the new ones still to be judged: only a new one landing off screen opens the pills.
  const known = useRef<Set<string>>(new Set());
  const pending = useRef<Set<string>>(new Set());

  const notify = () => {
    setNotifying(true);
    if (notifyTimer.current !== null) clearTimeout(notifyTimer.current);
    notifyTimer.current = window.setTimeout(() => {
      notifyTimer.current = null;
      setNotifying(false);
    }, NOTIFY_MS);
  };

  const measure = () => {
    const content = contentRef.current;
    if (!content || !marks.length || !scroller.current) {
      if (signature.current !== "") {
        signature.current = "";
        setCues(null);
      }
      return;
    }
    const box = content.getBoundingClientRect();
    const measured: MeasuredCueMark[] = [];
    for (const m of marks) {
      const el = content.querySelector<HTMLElement>(
        `[data-verse-number="${m.verse}"]`
      );
      if (!el) continue;
      const r = el.getBoundingClientRect();
      measured.push({ ...m, top: r.top - box.top, bottom: r.bottom - box.top });
    }
    const viewport = visibleBounds(content, scroller.current);
    let landed = false;
    for (const m of measured) {
      if (m.bottom <= m.top) continue;
      if (!pending.current.delete(cueMarkId(m))) continue;
      if (offscreenSide(m, viewport)) landed = true;
    }
    if (landed) notify();
    const placed = placeOffscreenCues(measured, viewport);
    const height = Math.max(0, viewport.bottom - viewport.top);
    const sig = [
      Math.round(viewport.top),
      Math.round(height),
      placed.up.map((c) => `${c.key}~${c.label}`).join(","),
      placed.down.map((c) => `${c.key}~${c.label}`).join(","),
    ].join("|");
    if (sig === signature.current) return;
    signature.current = sig;
    setCues(
      placed.up.length || placed.down.length
        ? { ...placed, top: viewport.top, height }
        : null
    );
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const schedule = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measureRef.current();
    });
  };
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    scroller.current = scrollerOf(content);
    const target: EventTarget =
      scroller.current === document.scrollingElement
        ? window
        : scroller.current;
    const on = () => scheduleRef.current();
    target.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      target.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [contentRef]);

  const ids = marks.map(cueMarkId);
  const idsKey = ids.join(",");
  // Before the measuring effect, so a measure in this same commit already knows which highlights are new.
  useLayoutEffect(() => {
    const now = new Set(ids);
    const next = new Set<string>();
    for (const id of now)
      if (!known.current.has(id) || pending.current.has(id)) next.add(id);
    known.current = now;
    pending.current = next;
  }, [idsKey]);
  useLayoutEffect(() => scheduleRef.current());
  useEffect(
    () => () => {
      if (notifyTimer.current !== null) clearTimeout(notifyTimer.current);
    },
    []
  );

  if (!cues) return null;
  const jump = (verse: number) =>
    contentRef.current
      ?.querySelector<HTMLElement>(`[data-verse-number="${verse}"]`)
      ?.scrollIntoView({
        block: "center",
        behavior: reduceMotion() ? "auto" : "smooth",
      });
  return (
    <div
      className="sb-offscreen-cues"
      style={{ top: `${cues.top}px`, height: `${cues.height}px` }}
    >
      {cues.up.length > 0 && (
        <CueEdge
          direction="up"
          cues={cues.up}
          notifying={notifying}
          labelFor={(verses) =>
            t("offscreen-highlight-above", {
              verses,
              defaultValue: "Highlight above, verse {{verses}}. Show it",
            })
          }
          onJump={jump}
        />
      )}
      {cues.down.length > 0 && (
        <CueEdge
          direction="down"
          cues={cues.down}
          notifying={notifying}
          labelFor={(verses) =>
            t("offscreen-highlight-below", {
              verses,
              defaultValue: "Highlight below, verse {{verses}}. Show it",
            })
          }
          onJump={jump}
        />
      )}
    </div>
  );
}

function CueArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className="sb-offscreen-cue-arrow"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path
        d={
          direction === "up"
            ? "M6 10.5 V1.5 M2 5.5 L6 1.5 L10 5.5"
            : "M6 1.5 V10.5 M2 6.5 L6 10.5 L10 6.5"
        }
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** One edge: the pills while a notice shows or the pointer is over them, otherwise the folded indicator. */
function CueEdge(props: {
  direction: "up" | "down";
  cues: OffscreenCue[];
  notifying: boolean;
  labelFor: (label: string) => string;
  onJump: (verse: number) => void;
}) {
  const { direction, cues, notifying, labelFor, onJump } = props;
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const open = () => {
    cancelClose();
    setHovered(true);
  };
  const close = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setHovered(false);
    }, HOVER_CLOSE_MS);
  };
  useEffect(() => cancelClose, []);
  // A tap fires pointerenter too and would leave the pills open behind its jump: only a mouse hovers.
  const hover = {
    onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && open(),
    onPointerLeave: (e: PointerEvent) => e.pointerType === "mouse" && close(),
    onFocusIn: open,
    onFocusOut: close,
  };
  // In verse order, so the nearest above is the last.
  const nearestFirst = direction === "up" ? [...cues].reverse() : cues;
  const nearest = nearestFirst[0]!;
  const icons = nearestFirst.slice(0, MAX_ICONS);
  return (
    <>
      {(notifying || hovered) && (
        <CueRow
          direction={direction}
          cues={cues}
          labelFor={labelFor}
          onJump={onJump}
          hover={hover}
        />
      )}
      {!notifying && (
        <button
          type="button"
          className={`sb-offscreen-cue-indicator sb-offscreen-cue-indicator-${direction}`}
          aria-label={labelFor(nearest.label)}
          onClick={() => onJump(nearest.verse)}
          {...hover}
        >
          <CueArrow direction={direction} />
          <span className="sb-offscreen-cue-indicator-icons">
            {icons.map((c, i) => (
              <span
                key={c.key}
                className="sb-offscreen-cue-indicator-icon"
                data-verse={c.verse}
                style={{
                  background: c.background,
                  color: c.textColor,
                  zIndex: icons.length - i,
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  format_ink_highlighter
                </span>
              </span>
            ))}
          </span>
        </button>
      )}
    </>
  );
}

function CueRow(props: {
  direction: "up" | "down";
  cues: OffscreenCue[];
  labelFor: (label: string) => string;
  onJump: (verse: number) => void;
  hover: Record<string, (e: PointerEvent) => unknown>;
}) {
  const { t } = useI18n();
  const { direction, cues, labelFor, onJump, hover } = props;
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef({ id: -1, x: 0, from: 0, moved: false });
  const updateEdges = () => {
    const el = row.current;
    if (!el) return;
    const next = scrollEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
    setEdges((p) =>
      p.left === next.left && p.right === next.right ? p : next
    );
  };
  const updateRef = useRef(updateEdges);
  updateRef.current = updateEdges;
  useLayoutEffect(() => updateRef.current());
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const on = () => updateRef.current();
    el.addEventListener("scroll", on, { passive: true });
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(on);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", on);
      ro?.disconnect();
    };
  }, []);
  const scrollTo = (side: "left" | "right") => {
    const el = row.current;
    if (!el) return;
    el.scrollTo({
      left: side === "left" ? 0 : Math.max(0, el.scrollWidth - el.clientWidth),
      behavior: reduceMotion() ? "auto" : "smooth",
    });
  };
  const end = (e: PointerEvent) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    d.id = -1;
    // The click after a drag is swallowed; one that never comes must not eat the next tap.
    if (d.moved)
      setTimeout(() => {
        if (drag.current.id === -1) drag.current.moved = false;
      }, 0);
  };
  return (
    <div
      className={`sb-offscreen-cues-row sb-offscreen-cues-${direction}`}
      {...hover}
    >
      {edges.left && (
        <button
          type="button"
          className="sb-offscreen-cues-scroll sb-offscreen-cues-scroll-left"
          aria-label={t("offscreen-highlight-scroll-left", {
            defaultValue: "More highlights to the left",
          })}
          onClick={() => scrollTo("left")}
        >
          ‹
        </button>
      )}
      <div
        ref={row}
        className="sb-offscreen-cues-stack"
        onPointerDown={(e: PointerEvent) => {
          if (e.button !== 0 || !row.current) return;
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            from: row.current.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(e: PointerEvent) => {
          const d = drag.current;
          const el = row.current;
          if (d.id !== e.pointerId || !el) return;
          const dx = e.clientX - d.x;
          if (!d.moved) {
            if (Math.abs(dx) < DRAG_PX) return;
            d.moved = true;
            el.setPointerCapture?.(e.pointerId);
          }
          el.scrollLeft = d.from - dx;
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e: MouseEvent) => {
          if (e.detail === 0 || !drag.current.moved) return;
          drag.current.moved = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {cues.map((c) => (
          <button
            key={c.key}
            type="button"
            className="sb-offscreen-cue"
            data-verse={c.verse}
            style={{ background: c.background, color: c.textColor }}
            aria-label={labelFor(c.label)}
            onClick={() => onJump(c.verse)}
          >
            {c.author && (
              <span className="sb-offscreen-cue-avatar">
                <span
                  className="sb-tab-user-icon sb-tab-user-icon-animal"
                  title={c.author.name}
                  style={{
                    borderColor: c.author.color,
                    backgroundColor: c.author.color,
                  }}
                >
                  <span className="material-symbols-outlined">person</span>
                </span>
              </span>
            )}
            <CueArrow direction={direction} />
            <span className="sb-offscreen-cue-text">
              {c.label === String(c.verse)
                ? t("highlighted-verse", {
                    verse: c.label,
                    defaultValue: "Highlighted verse {{verse}}",
                  })
                : t("highlighted-verses", {
                    verses: c.label,
                    defaultValue: "Highlighted verses {{verses}}",
                  })}
            </span>
          </button>
        ))}
      </div>
      {edges.right && (
        <button
          type="button"
          className="sb-offscreen-cues-scroll sb-offscreen-cues-scroll-right"
          aria-label={t("offscreen-highlight-scroll-right", {
            defaultValue: "More highlights to the right",
          })}
          onClick={() => scrollTo("right")}
        >
          ›
        </button>
      )}
    </div>
  );
}
