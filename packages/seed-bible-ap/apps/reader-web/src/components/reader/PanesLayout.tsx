// THE PANES — the old TabsLayout's grid (`sb-panes-layout[data-layout]`, one `sb-pane-shell` per slot), each slot
// a reader on its tab; a click in a slot selects it. The dividers between columns drag (the old resize handles),
// and the widths are remembered per layout on the device.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { BibleReader } from "./BibleReader";
import {
  columnsOf,
  defaultWeights,
  dragWeights,
  gridTemplate,
  validWeights,
} from "./paneColumns";

export function PanesLayout({ state }: { state: ReaderState }) {
  const { tabs } = state;
  const layout = tabs.layout.value;
  const [weights, setWeights] = useState<number[]>(() =>
    defaultWeights(layout)
  );
  const host = useRef<HTMLDivElement>(null);
  const key = `panes:columns:${layout}`;

  useEffect(() => {
    let live = true;
    void state.stores.prefs.get(key).then((v) => {
      if (live) setWeights(validWeights(layout, v) ?? defaultWeights(layout));
    });
    return () => {
      live = false;
    };
  }, [layout]);

  const startDrag = (i: number) => (e: PointerEvent) => {
    const el = host.current;
    if (!el) return;
    e.preventDefault();
    const width = el.getBoundingClientRect().width || 1;
    let lastX = e.clientX;
    let current = weights;
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - lastX) / width;
      lastX = ev.clientX;
      current = dragWeights(current, i, delta);
      setWeights(current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void state.stores.prefs.set(key, current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const n = columnsOf(layout);
  // The divider after column i sits at the running sum of the widths before it.
  const offsets = weights
    .slice(0, -1)
    .map((_, i) => weights.slice(0, i + 1).reduce((s, w) => s + w, 0));
  return (
    <div
      ref={host}
      className="sb-panes-layout"
      data-layout={layout}
      style={n > 1 ? { gridTemplateColumns: gridTemplate(weights) } : undefined}
    >
      {tabs.slots.value.map((tab, index) => (
        <div
          key={tab?.id ?? `empty-${index}`}
          className={`sb-pane-shell sb-pane-slot-${index + 1}${index === tabs.selectedSlot.value ? " sb-pane-shell-active" : ""}`}
          onClickCapture={() => tabs.selectSlot(index)}
        >
          <div className="sb-pane-reader-outer">
            <div className="sb-pane-reader">
              {tab ? (
                <BibleReader
                  state={state}
                  reading={tab.reading}
                  active={tab.id === tabs.selectedId.value}
                />
              ) : (
                <div className="sb-pane-empty" />
              )}
            </div>
          </div>
        </div>
      ))}
      {n > 1 &&
        offsets.map((at, i) => (
          <div
            key={i}
            className="sb-pane-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            style={{ left: `${(at * 100).toFixed(3)}%` }}
            onPointerDown={startDrag(i)}
            onDblClick={() => {
              const d = defaultWeights(layout);
              setWeights(d);
              void state.stores.prefs.set(key, d);
            }}
          />
        ))}
    </div>
  );
}
