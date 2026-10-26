// WHERE EVERYONE IS — the old reader's presence gutter (packages/seed-bible BibleReader PresenceGutter, #1692): in a
// live session, a thin bar down the start edge of the chapter for each other person, spanning the verses on their
// screen, in their colour, their initials at the top of it (held on screen while their verses run above it), an
// arrow where a bar carries on past the screen, and up to three bars side by side. This device reports its own
// verses (the session's `view`) as it scrolls, so the others see it too. Styles: the copied reader-extra.css.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";

const MAX_LANES = 3;
const LANE_OFFSETS = [0, 1, -1] as const;
const MAX_STACK = 3;
const AVATAR_PX = 20;
const STACK_STEP_PX = 12;
const PIN_INSET_PX = 14;
const ARROW_PX = 6;
const EDGE_INSET_PX = 4;
const COLORS = [
  "#e07a4a",
  "#3b82f6",
  "#16a34a",
  "#a855f7",
  "#db2777",
  "#0d9488",
  "#ca8a04",
  "#64748b",
];

/** A person's colour, the same on every device: a hash of who they are. */
export function colorOf(agent: string): string {
  let h = 0;
  for (const ch of agent) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

const initialsOf = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();

interface Marker {
  agent: string;
  name: string;
  color: string;
  top: number;
  height: number;
  lane: number;
}

/** The verses on screen in the reader this element sits in: the first and last whose lines show. */
function visibleRange(
  column: HTMLElement
): { from: number; to: number } | null {
  let from = 0;
  let to = 0;
  const bottom = window.innerHeight;
  for (const el of column.querySelectorAll<HTMLElement>(
    "[data-verse-number]"
  )) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= bottom || !r.height) continue;
    const n = Number(el.dataset["verseNumber"]);
    if (!from || n < from) from = n;
    if (n > to) to = n;
  }
  return from ? { from, to } : null;
}

export function PresenceGutter({ state }: { state: ReaderState }) {
  const { live } = state;
  const reading = live.sessionReading();
  const ref = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [view, setView] = useState({ top: 0, bottom: 0 });
  const chapter = reading.chapterRef.value;
  const me = live.me.value;
  const others = Object.values(live.presence.value).filter(
    (p) => p.agent !== me && p.chapter === chapter && p.from && p.to
  );
  const key = others.map((p) => `${p.agent}:${p.from}-${p.to}`).join("|");

  // This device's own verses, reported once the scrolling rests.
  useEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const r = visibleRange(column);
        const cur = live.view.peek();
        if (!r) return;
        if (
          cur &&
          cur.chapter === chapter &&
          cur.from === r.from &&
          cur.to === r.to
        )
          return;
        live.view.value = { chapter, ...r };
      }, 300);
    };
    report();
    window.addEventListener("scroll", report, { capture: true, passive: true });
    window.addEventListener("resize", report);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", report, true);
      window.removeEventListener("resize", report);
    };
  }, [chapter]);

  // The others' bars, measured against this column's lines; the screen's edges, to pin avatars and draw arrows.
  useLayoutEffect(() => {
    const column = ref.current?.parentElement;
    if (!column) return;
    const measure = () => {
      const box = column.getBoundingClientRect();
      setView({ top: -box.top, bottom: window.innerHeight - box.top });
      const placed: Marker[] = [];
      const sorted = [...others].sort(
        (a, b) => a.from! - b.from! || a.agent.localeCompare(b.agent)
      );
      for (const p of sorted) {
        const first = column.querySelector<HTMLElement>(
          `[data-verse-number="${p.from}"]`
        );
        const last = column.querySelector<HTMLElement>(
          `[data-verse-number="${p.to}"]`
        );
        if (!first || !last) continue;
        const a = first.getClientRects()[0];
        const lr = last.getClientRects();
        const b = lr[lr.length - 1];
        if (!a || !b) continue;
        const top = a.top - box.top;
        const height = Math.max(8, b.bottom - a.top);
        let lane = 0;
        while (
          placed.some(
            (m) =>
              m.lane === lane && m.top < top + height && top < m.top + m.height
          )
        )
          lane++;
        placed.push({
          agent: p.agent,
          name: p.name,
          color: colorOf(p.agent),
          top,
          height,
          lane,
        });
      }
      setMarkers(placed);
    };
    measure();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [key, chapter]);

  const shown = markers.filter((m) => m.lane < MAX_LANES);
  // Avatars at the top of each bar, held at the top of the screen while the bar runs above it; close ones stack.
  const anchored = shown
    .map((m) => {
      const pinTop = view.top + PIN_INSET_PX;
      const lowest = m.top + m.height - AVATAR_PX;
      if (pinTop > m.top && pinTop <= lowest)
        return { m, top: pinTop, pinned: true };
      if (pinTop > lowest && lowest > m.top)
        return { m, top: lowest, pinned: false };
      return { m, top: m.top, pinned: false };
    })
    .sort((a, b) => a.top - b.top || a.m.agent.localeCompare(b.m.agent));
  const stacks: Array<{ top: number; pinned: boolean; ms: Marker[] }> = [];
  let reach = -Infinity;
  for (const e of anchored) {
    const cur = stacks[stacks.length - 1];
    if (cur && e.top < reach) {
      cur.ms.push(e.m);
      const n =
        Math.min(cur.ms.length, MAX_STACK) +
        (cur.ms.length > MAX_STACK ? 1 : 0);
      reach = cur.top + AVATAR_PX + (n - 1) * STACK_STEP_PX;
      continue;
    }
    stacks.push({ top: e.top, pinned: e.pinned, ms: [e.m] });
    reach = e.top + AVATAR_PX;
  }

  return (
    <div ref={ref} className="sb-presence-gutter" aria-hidden="true">
      {shown.map((m) => (
        <div
          key={`${chapter}:${m.agent}`}
          className="sb-presence-marker"
          style={{
            top: `${m.top}px`,
            height: `${m.height}px`,
            background: m.color,
            "--sb-presence-lane-offset": LANE_OFFSETS[m.lane],
          }}
          data-agent={m.agent}
        />
      ))}
      {shown.flatMap((m) => {
        const out = [];
        const bottom = m.top + m.height;
        if (m.top < view.top && bottom > view.top)
          out.push({ dir: "up", top: view.top + EDGE_INSET_PX, m });
        if (bottom > view.bottom && m.top < view.bottom)
          out.push({
            dir: "down",
            top: view.bottom - EDGE_INSET_PX - ARROW_PX,
            m,
          });
        return out.map((a) => (
          <span
            key={`${chapter}:${m.agent}:${a.dir}`}
            className={`sb-presence-arrow sb-presence-arrow-${a.dir}`}
            style={{
              top: `${a.top}px`,
              "--sb-presence-lane-offset": LANE_OFFSETS[m.lane],
              "--sb-presence-arrow-color": m.color,
            }}
          />
        ));
      })}
      {stacks.map((st) => (
        <div
          key={`${chapter}:${st.ms.map((m) => m.agent).join("+")}`}
          className={`sb-presence-avatars${st.pinned ? " sb-presence-avatars-pinned" : ""}`}
          style={{ top: `${st.top}px` }}
        >
          {st.ms.slice(0, MAX_STACK).map((m) => (
            <span key={m.agent} className="sb-presence-avatar" title={m.name}>
              <span
                className="sb-presence-initials"
                style={{ background: m.color }}
              >
                {initialsOf(m.name) || "?"}
              </span>
            </span>
          ))}
          {st.ms.length > MAX_STACK && (
            <span className="sb-presence-avatars-more">
              +{st.ms.length - MAX_STACK}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
