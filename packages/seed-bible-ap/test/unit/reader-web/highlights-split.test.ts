// HIGHLIGHTS CHANGE ONLY THE VERSES YOU CHOSE, as in the old reader: clearing or re-colouring verses inside a longer
// highlight keeps the rest of it; a highlight joins the touching ones of its colour. Before, clearing verse 5 of a
// 1–10 highlight took all ten verses with it.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createHighlights } from "../../../apps/reader-web/src/state/records/highlights";

function device() {
  const backend = createDevBackend({
    agent: "0x" + "ab".repeat(20),
    name: "Seed Reader",
    wire: true,
  });
  const stores = memoryStores();
  const outbox = createOutbox({
    backend,
    stores,
    isOnline: () => true,
    settleMs: 1,
    onMerged: (c, ch, b) => buckets.accept(c, ch, b),
  });
  const buckets = createBucketStore({
    backend,
    stores,
    outbox,
    isOnline: () => true,
  });
  return createHighlights(buckets, () => backend.identity());
}

const shown = (h: ReturnType<typeof device>) =>
  h
    .forChapter("JHN.3")
    .value.map(
      (x) =>
        `${x.colorId}:${Array.isArray(x.verse) ? x.verse.join("-") : x.verse}`
    )
    .sort();

describe("highlights", () => {
  it("clearing a verse inside a highlight keeps the verses on either side", async () => {
    const h = device();
    await h.set("JHN.3", 1, 10, "yellow");
    await h.clear("JHN.3", 5);
    expect(shown(h)).toEqual(["yellow:1-4", "yellow:6-10"]);
  });

  it("clearing the start or the end trims the highlight", async () => {
    const h = device();
    await h.set("JHN.3", 1, 10, "yellow");
    await h.clear("JHN.3", 1, 3);
    await h.clear("JHN.3", 10);
    expect(shown(h)).toEqual(["yellow:4-9"]);
  });

  it("re-colouring verses inside a highlight keeps the rest in its colour", async () => {
    const h = device();
    await h.set("JHN.3", 1, 10, "yellow");
    await h.set("JHN.3", 4, 5, "green");
    expect(shown(h)).toEqual(["green:4-5", "yellow:1-3", "yellow:6-10"]);
  });

  it("joins touching highlights of the same colour, not of another", async () => {
    const h = device();
    await h.set("JHN.3", 1, 3, "yellow");
    await h.set("JHN.3", 7, 9, "yellow");
    await h.set("JHN.3", 10, 12, "blue");
    await h.set("JHN.3", 4, 6, "yellow");
    expect(shown(h)).toEqual(["blue:10-12", "yellow:1-9"]);
  });
});

describe("a colour of your own", () => {
  const withCustom = (h: ReturnType<typeof device>) =>
    h
      .forChapter("JHN.3")
      .value.map(
        (x) =>
          `${x.customColor ?? x.colorId}~${x.colorId}:${Array.isArray(x.verse) ? x.verse.join("-") : x.verse}`
      )
      .sort();

  it("is kept with the nearest of the twelve, so a reader that cannot draw it still shows something close", async () => {
    const h = device();
    await h.set("JHN.3", 16, 16, "#2a6fdb");
    expect(withCustom(h)).toEqual(["#2a6fdb~blue:16"]);
  });

  it("survives clearing a verse inside it, and joins only the same colour", async () => {
    const h = device();
    await h.set("JHN.3", 1, 6, "#2a6fdb");
    await h.clear("JHN.3", 3);
    await h.set("JHN.3", 7, 8, "#2a6fdb");
    await h.set("JHN.3", 9, 9, "blue");
    expect(withCustom(h)).toEqual([
      "#2a6fdb~blue:1-2",
      "#2a6fdb~blue:4-8",
      "blue~blue:9",
    ]);
  });
});
