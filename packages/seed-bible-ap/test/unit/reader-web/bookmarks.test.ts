// Bookmarks carry a name and a colour of the reader's choosing, both changed in place; the chapter toggle keeps
// working without either.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createBookmarks } from "../../../apps/reader-web/src/state/records/bookmarks";

const READER = {
  agent: "0x" + "55".repeat(20),
  name: "Seed Reader",
  wire: true,
};

describe("bookmarks", () => {
  it("are named and coloured, renamed and recoloured in place, and toggled off", async () => {
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
    const bookmarks = createBookmarks(buckets, () => READER);
    await bookmarks.add("JHN.3", "John 3", "green");
    await bookmarks.toggle("ROM.8", "Romans 8");
    expect(
      bookmarks.all.value.map((b) => `${b.name}:${b.colorId ?? "-"}`).sort()
    ).toEqual(["John 3:green", "Romans 8:-"]);
    const john = bookmarks.onChapter("JHN.3")[0]!;
    await bookmarks.update(john.id, { name: "Born again", colorId: "blue" });
    expect(bookmarks.onChapter("JHN.3")[0]).toMatchObject({
      name: "Born again",
      colorId: "blue",
    });
    await bookmarks.update(john.id, { colorId: null });
    expect(bookmarks.onChapter("JHN.3")[0]?.colorId).toBeUndefined();
    expect(bookmarks.onChapter("JHN.3")[0]?.name).toBe("Born again");
    const raw = buckets
      .get("bookmarks")
      .bucket.value["@graph"].find((it) => it["@id"] === john.id) as {
      bookmarkColor?: string;
      supersedes?: string;
    };
    expect(raw.bookmarkColor).toBeUndefined();
    expect(raw.supersedes).toBeTruthy();
    await bookmarks.toggle("JHN.3", "x");
    expect(bookmarks.onChapter("JHN.3")).toEqual([]);
  });
});
