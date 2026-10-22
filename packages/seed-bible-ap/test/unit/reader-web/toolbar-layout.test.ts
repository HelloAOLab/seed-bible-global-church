// THE TOOLBAR CUSTOMIZER: the reader's order and hidden buttons apply; a button never placed (a new extension's)
// comes after the placed ones; a hidden button can be shown again; the choice is kept on the device.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  arrange,
  createToolbarLayout,
} from "../../../apps/reader-web/src/state/chrome/toolbarLayout";

const ids = ["session", "today", "discover", "notes", "theme"];
const items = ids.map((id) => ({ id }));

describe("toolbar layout", () => {
  it("applies the order and the hidden set; unplaced buttons follow in their own order", () => {
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
    ).toEqual(["theme", "session", "today", "discover", "notes", "ext:watch"]);
  });

  it("moves, hides, shows again, resets — and keeps it on the device", async () => {
    const stores = memoryStores();
    const t = createToolbarLayout(stores.prefs);
    t.move(ids, "notes", -1);
    t.move(ids, "notes", -1);
    t.setHidden("today", true);
    expect(arrange(items, t.layout.value).map((x) => x.id)).toEqual([
      "session",
      "notes",
      "discover",
      "theme",
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
    expect(arrange(items, again.layout.value).map((x) => x.id)).toEqual(ids);
  });
});
