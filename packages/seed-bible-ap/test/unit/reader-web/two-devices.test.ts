// hard-problems §3 at the UI seam: two devices editing one chapter merge at the item level, and a note edited on
// both sides comes back twice with the conflict flagged for the reader to settle.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createHighlights } from "../../../apps/reader-web/src/state/records/highlights";
import { createAnnotations } from "../../../apps/reader-web/src/state/records/annotations";

const READER = {
  agent: "0x" + "cd".repeat(20),
  name: "Seed Reader",
  wire: true,
};

function device(backend: ReturnType<typeof createDevBackend>) {
  const stores = memoryStores();
  const outbox = createOutbox({
    backend,
    stores,
    isOnline: () => true,
    settleMs: 1,
    onMerged: (c, ch, b) => buckets.accept(c, ch, b),
  });
  const buckets = createBucketStore({ backend, stores, outbox });
  return {
    buckets,
    outbox,
    highlights: createHighlights(buckets, () => backend.identity()),
    notes: createAnnotations(buckets, () => backend.identity()),
  };
}

describe("two devices on one chapter", () => {
  it("merge their highlights at the item level", async () => {
    const lib = createDevBackend(READER);
    const a = device(lib);
    const b = device(lib);
    await a.highlights.set("JHN.3", 16, 16, "yellow");
    await b.highlights.set("JHN.3", 17, 17, "green");
    await a.outbox.flush();
    await b.outbox.flush();
    // Each device re-reads: both marks, neither lost.
    await a.buckets.resync();
    await b.buckets.resync();
    const seen = (d: typeof a) =>
      d.highlights
        .forChapter("JHN.3")
        .value.map((h) => `${h.colorId}:${String(h.verse)}`)
        .sort();
    expect(seen(a)).toEqual(["green:17", "yellow:16"]);
    expect(seen(b)).toEqual(["green:17", "yellow:16"]);
  });

  it("keep a note edited on both sides twice, flagged, until the reader keeps one", async () => {
    const lib = createDevBackend(READER);
    const a = device(lib);
    const id = await a.notes.add("JHN.3", 16, 16, "For God so loved");
    await a.outbox.flush();
    const b = device(lib);
    await b.buckets.get("annotations", "JHN.3").ready;
    expect(b.notes.forChapter("JHN.3").value.map((n) => n.note)).toEqual([
      "For God so loved",
    ]);

    await a.notes.edit("JHN.3", id, "For God so loved — the heart of it");
    await b.notes.edit("JHN.3", id, "For God so loved the world");
    await a.outbox.flush();
    await b.outbox.flush();

    const inLib = lib.buckets
      .get("annotations:JHN.3")!
      ["@graph"].filter((it) => !it.deleted);
    expect(inLib).toHaveLength(2);
    expect(inLib.some((it) => "conflictOf" in it && it.conflictOf === id)).toBe(
      true
    );

    await a.buckets.resync();
    const notes = a.notes.forChapter("JHN.3").value;
    expect(notes).toHaveLength(2);
    const flagged = notes.find((n) => n.conflictOf)!;
    expect(flagged.conflictOf).toBe(id);

    // The reader keeps the flagged version: its text moves into the original, the copy goes.
    await a.notes.resolve("JHN.3", flagged.id);
    await a.outbox.flush();
    const after = a.notes.forChapter("JHN.3").value;
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(id);
    expect(after[0]!.note).toBe(flagged.note);
  });
});
