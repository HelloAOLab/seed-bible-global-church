// A NOTE ON THE WHOLE CHAPTER (the old reader's note with no verse): stored on the chapter's passage, read back as
// whole with no verses, and listed before the chapter's verse notes.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createAnnotations } from "../../../apps/reader-web/src/state/records/annotations";

const READER = {
  agent: "0x" + "55".repeat(20),
  name: "Seed Reader",
  wire: true,
};

describe("chapter notes", () => {
  it("a note with no verses is on the whole chapter", async () => {
    const backend = createDevBackend(READER);
    const stores = memoryStores();
    const outbox = createOutbox({
      backend,
      stores,
      isOnline: () => true,
      settleMs: 1,
    });
    const buckets = createBucketStore({
      backend,
      stores,
      outbox,
      isOnline: () => true,
    });
    const notes = createAnnotations(buckets, () => READER);
    await notes.add("JHN.3", 16, 16, "<p>on a verse</p>");
    const id = await notes.add("JHN.3", 0, 0, "<p>on the chapter</p>");
    const list = notes.forChapter("JHN.3").value;
    expect(list.map((n) => [n.note, n.whole ?? false, n.start, n.end])).toEqual(
      [
        ["<p>on the chapter</p>", true, 0, 0],
        ["<p>on a verse</p>", false, 16, 16],
      ]
    );
    const raw = buckets
      .get("annotations", "JHN.3")
      .bucket.value["@graph"].find((it) => it["@id"] === id) as {
      aboutPassage: string;
    };
    expect(raw.aboutPassage).toBe("JHN.3");
  });
});
