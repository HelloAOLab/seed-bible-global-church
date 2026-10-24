// THE BOTTOM TOOLBAR, AS THE READER WANTS IT — the old Settings → Toolbar customizer: which buttons sit in the bar and
// in what order (a device preference). A button taken out of the bar goes under More, never away, so every action
// stays one tap from the bar. Buttons the reader never placed (a new extension's, say) come after the placed ones in
// their own order.
import { signal } from "@preact/signals";
import type { KeyValueStore } from "../../backend/offline/db";

export interface ToolbarLayout {
  order: string[];
  hidden: string[];
}

// A new key: layouts saved under "toolbar:layout" meant "hidden is gone", made before the bar took the old reader's
// short shape.
const KEY = "toolbar:layout:2";
/** The old reader's bar: Books, Search and Discover (and each extension's button) in it; the rest under More. */
export const DEFAULT_LAYOUT: ToolbarLayout = {
  order: [],
  hidden: [
    "session",
    "today",
    "notes",
    "library",
    "content",
    "fullscreen",
    "theme",
  ],
};

/** The buttons in the reader's order, the ones under More left out. */
export function arrange<T extends { id: string }>(
  items: readonly T[],
  layout: ToolbarLayout
): T[] {
  const rank = (id: string) => {
    const i = layout.order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => rank(a.it.id) - rank(b.it.id) || a.i - b.i)
    .map((x) => x.it)
    .filter((it) => !layout.hidden.includes(it.id));
}

/** The buttons under More, in the reader's order. */
export function underMore<T extends { id: string }>(
  items: readonly T[],
  layout: ToolbarLayout
): T[] {
  return arrange(items, { ...layout, hidden: [] }).filter((it) =>
    layout.hidden.includes(it.id)
  );
}

/** Every button in the reader's order, the ones under More included (for the customizer). */
export function ordered(
  ids: readonly string[],
  layout: ToolbarLayout
): string[] {
  return arrange(
    ids.map((id) => ({ id })),
    { ...layout, hidden: [] }
  ).map((x) => x.id);
}

export function createToolbarLayout(prefs: KeyValueStore<unknown>) {
  const layout = signal<ToolbarLayout>(DEFAULT_LAYOUT);
  void prefs
    .get(KEY)
    .then((v) => {
      const l = v as ToolbarLayout | undefined;
      if (l && Array.isArray(l.order) && Array.isArray(l.hidden))
        layout.value = l;
    })
    .catch(() => undefined);
  const save = (next: ToolbarLayout) => {
    layout.value = next;
    void prefs.set(KEY, next).catch(() => undefined);
  };
  return {
    layout,
    setHidden(id: string, hidden: boolean) {
      const h = layout.value.hidden.filter((x) => x !== id);
      save({ ...layout.value, hidden: hidden ? [...h, id] : h });
    },
    /** Move a button one place up (-1) or down (+1) among all the buttons there are. */
    move(allIds: readonly string[], id: string, by: -1 | 1) {
      const list = ordered(allIds, layout.value);
      const i = list.indexOf(id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j]!, list[i]!];
      save({ ...layout.value, order: list });
    },
    reset() {
      save(DEFAULT_LAYOUT);
    },
  };
}

export type ToolbarLayoutState = ReturnType<typeof createToolbarLayout>;
