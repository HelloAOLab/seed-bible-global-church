// TABS AND PANES — ported from the core of packages/seed-bible TabsManager + TabsLayoutManager (docs/porting/
// TabsManager.md): every tab owns a reading state; a layout has N slots, each showing one tab; the selected tab is
// the one in the selected slot. Selecting a tab that is not on screen puts it in the selected slot. Shared sessions,
// slot-only tabs and the pane resize handles of the original are not in this cut.
import { computed, signal } from "@preact/signals";
import type { Reading } from "./reading";

export type LayoutId =
  | "single"
  | "split-2v"
  | "split-left-two-right"
  | "split-3v"
  | "grid-2x2"
  | "split-4v";

export interface LayoutOption {
  id: LayoutId;
  label: string;
  slotCount: number;
}

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: "single", label: "Single pane", slotCount: 1 },
  { id: "split-2v", label: "Two vertical panes", slotCount: 2 },
  {
    id: "split-left-two-right",
    label: "Left pane with two stacked right panes",
    slotCount: 3,
  },
  { id: "split-3v", label: "Three vertical panes", slotCount: 3 },
  { id: "grid-2x2", label: "Four corner panes", slotCount: 4 },
  { id: "split-4v", label: "Four vertical panes", slotCount: 4 },
];

export const slotCountOf = (layout: LayoutId) =>
  LAYOUT_OPTIONS.find((o) => o.id === layout)?.slotCount ?? 1;

export interface ReaderTab {
  id: string;
  reading: Reading;
}

export interface TabsDeps {
  /** Builds a reading state for a new tab (wired to the device position and the URL by the caller). */
  makeReading: (tabId: string) => Reading;
  newId?: () => string;
}

export function createTabs(deps: TabsDeps) {
  const newId =
    deps.newId ?? (() => `tab-${Math.random().toString(36).slice(2, 9)}`);
  const tabs = signal<ReaderTab[]>([]);
  const layout = signal<LayoutId>("single");
  const slotTabIds = signal<(string | null)[]>([null]);
  const selectedSlot = signal(0);

  const selectedId = computed(
    () => slotTabIds.value[selectedSlot.value] ?? null
  );
  const byId = (id: string | null) =>
    tabs.value.find((t) => t.id === id) ?? null;
  const selected = computed(
    () => byId(selectedId.value) ?? tabs.value[0] ?? null
  );
  const slots = computed(() => slotTabIds.value.map((id) => byId(id)));
  const shown = (id: string) => slotTabIds.value.indexOf(id);

  function addTab(
    opts: {
      translationId?: string;
      bookId?: string;
      chapterNumber?: number;
      from?: ReaderTab;
    } = {}
  ): ReaderTab {
    const id = newId();
    const reading = deps.makeReading(id);
    const tab: ReaderTab = { id, reading };
    tabs.value = [...tabs.value, tab];
    const src = opts.from?.reading;
    const t =
      opts.translationId ??
      src?.translationId.value ??
      reading.translationId.value;
    const b = opts.bookId ?? src?.bookId.value ?? reading.bookId.value;
    const c =
      opts.chapterNumber ??
      src?.chapterNumber.value ??
      reading.chapterNumber.value;
    selectTab(id);
    void reading.goTo(t, b, c);
    return tab;
  }

  /** Show a tab: in its slot when it is on screen, else in the selected slot. */
  function selectTab(id: string) {
    if (!byId(id)) return;
    const at = shown(id);
    if (at >= 0) {
      selectedSlot.value = at;
      return;
    }
    const next = [...slotTabIds.value];
    next[selectedSlot.value] = id;
    slotTabIds.value = next;
  }

  function selectSlot(index: number) {
    if (index >= 0 && index < slotTabIds.value.length)
      selectedSlot.value = index;
  }

  /** Change the layout; new slots take the first tabs not already on screen, extra slots fall away. */
  function setLayout(id: LayoutId) {
    const count = slotCountOf(id);
    const cur = slotTabIds.value.slice(0, count);
    const unseen = tabs.value
      .map((t) => t.id)
      .filter((tid) => !cur.includes(tid));
    while (cur.length < count) cur.push(unseen.shift() ?? null);
    for (let i = 0; i < cur.length; i++)
      if (cur[i] === null) cur[i] = unseen.shift() ?? null;
    layout.value = id;
    slotTabIds.value = cur;
    if (selectedSlot.value >= count) selectedSlot.value = 0;
    // An empty slot gets a fresh tab at the selected tab's place.
    cur.forEach((tid, i) => {
      if (tid === null) {
        const from = selected.value ?? undefined;
        const keep = selectedSlot.value;
        selectedSlot.value = i;
        addTab(from ? { from } : {});
        selectedSlot.value = keep;
      }
    });
  }

  /** The old reader's "Open in new panel": the tab gets a pane of its own, one more column (up to four); with four
   *  on screen it takes the selected pane. */
  function openInNewPanel(id: string) {
    if (!byId(id)) return;
    if (shown(id) >= 0) return selectTab(id);
    const grow: Partial<Record<number, LayoutId>> = {
      1: "split-2v",
      2: "split-3v",
      3: "split-4v",
    };
    const next = grow[slotTabIds.value.length];
    if (!next) return selectTab(id);
    layout.value = next;
    slotTabIds.value = [...slotTabIds.value, id];
    selectedSlot.value = slotTabIds.value.length - 1;
  }

  function closeTab(id: string) {
    const remaining = tabs.value.filter((t) => t.id !== id);
    tabs.value = remaining;
    const taken = new Set(
      slotTabIds.value.filter((x): x is string => !!x && x !== id)
    );
    const spare = remaining.map((t) => t.id).filter((tid) => !taken.has(tid));
    slotTabIds.value = slotTabIds.value.map((tid) =>
      tid === id ? (spare.shift() ?? null) : tid
    );
    if (!remaining.length) addTab();
    else if (slotTabIds.value[selectedSlot.value] === null) {
      // Nothing left for this slot: fall back to single pane on what remains.
      layout.value = "single";
      slotTabIds.value = [remaining[0]!.id];
      selectedSlot.value = 0;
    }
  }

  return {
    tabs,
    layout,
    slots,
    slotTabIds,
    selectedSlot,
    selectedId,
    selected,
    addTab,
    selectTab,
    selectSlot,
    setLayout,
    openInNewPanel,
    closeTab,
  };
}

export type Tabs = ReturnType<typeof createTabs>;
