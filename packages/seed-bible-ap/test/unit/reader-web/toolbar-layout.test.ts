// THE TOOLBAR CUSTOMIZER: the reader's order and the buttons taken out of the bar apply; a button the old reader never
// had (an extension's) starts under More until the reader places it; a button out of the bar is under More, never gone,
// and can be put back; a new device starts with seedbible.org's bar (Today, Books, Search, Discover); the choice is kept.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  arrange,
  createToolbarLayout,
  underMore,
} from "../../../apps/reader-web/src/state/chrome/toolbarLayout";

const ids = ["session", "today", "discover", "notes", "theme"];
const items = ids.map((id) => ({ id }));

describe("toolbar layout", () => {
  it("applies the order and the hidden set; an extension's button waits under More until it is placed", () => {
    expect(
      arrange(items, { order: ["notes", "today"], hidden: ["session"] }).map(
        (x) => x.id
      )
    ).toEqual(["notes", "today", "discover", "theme"]);
    expect(
      arrange([...items, { id: "ext:watch" }], {
        order: ["theme"],
        hidden: [],
      }).map((x) => x.id)
    ).toEqual(["theme", "session", "today", "discover", "notes"]);
    expect(
      underMore([...items, { id: "ext:watch" }], {
        order: ["theme"],
        hidden: [],
      }).map((x) => x.id)
    ).toEqual(["ext:watch"]);
    expect(
      arrange([...items, { id: "ext:watch" }], {
        order: ["ext:watch"],
        hidden: [],
      }).map((x) => x.id)
    ).toEqual(["ext:watch", "session", "today", "discover", "notes", "theme"]);
  });

  it("starts as seedbible.org's bar: Today and Discover in it, the rest under More, none lost", () => {
    const t = createToolbarLayout(memoryStores().prefs);
    const all = [...items, { id: "ext:watch" }, { id: "faith" }];
    expect(arrange(all, t.layout.value).map((x) => x.id)).toEqual([
      "today",
      "discover",
    ]);
    expect(underMore(all, t.layout.value).map((x) => x.id)).toEqual([
      "session",
      "notes",
      "theme",
      "ext:watch",
      "faith",
    ]);
  });

  it("an extension's button put in the bar stays there", () => {
    const t = createToolbarLayout(memoryStores().prefs);
    const all = [...items, { id: "ext:watch" }];
    t.setHidden("ext:watch", false);
    expect(arrange(all, t.layout.value).map((x) => x.id)).toContain(
      "ext:watch"
    );
    t.setHidden("ext:watch", true);
    expect(underMore(all, t.layout.value).map((x) => x.id)).toContain(
      "ext:watch"
    );
  });

  it("moves, takes out, puts back, resets — and keeps it on the device", async () => {
    const stores = memoryStores();
    const t = createToolbarLayout(stores.prefs);
    for (const id of ids) t.setHidden(id, false);
    t.move(ids, "notes", -1);
    t.move(ids, "notes", -1);
    t.setHidden("today", true);
    expect(arrange(items, t.layout.value).map((x) => x.id)).toEqual([
      "session",
      "notes",
      "discover",
      "theme",
    ]);
    expect(underMore(items, t.layout.value).map((x) => x.id)).toEqual([
      "today",
    ]);
    t.move(ids, "session", -1); // already first: nothing
    t.setHidden("today", false);
    expect(arrange(items, t.layout.value).map((x) => x.id)).toEqual([
      "session",
      "notes",
      "today",
      "discover",
      "theme",
    ]);
    await new Promise((r) => setTimeout(r, 0));
    const again = createToolbarLayout(stores.prefs);
    await new Promise((r) => setTimeout(r, 0));
    expect(again.layout.value.order.slice(0, 2)).toEqual(["session", "notes"]);
    again.reset();
    expect(arrange(items, again.layout.value).map((x) => x.id)).toEqual([
      "today",
      "discover",
    ]);
  });
});
