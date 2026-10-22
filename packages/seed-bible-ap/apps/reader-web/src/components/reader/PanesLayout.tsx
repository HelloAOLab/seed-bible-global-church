// THE PANES — the old TabsLayout's grid (`sb-panes-layout[data-layout]`, one `sb-pane-shell` per slot), each slot
// a reader on its tab; a click in a slot selects it. The resize handles of the original are not in this cut.
import type { ReaderState } from "../../state";
import { BibleReader } from "./BibleReader";

export function PanesLayout({ state }: { state: ReaderState }) {
  const { tabs } = state;
  return (
    <div className="sb-panes-layout" data-layout={tabs.layout.value}>
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
    </div>
  );
}
