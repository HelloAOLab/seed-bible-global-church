// Saves over the single bucket, and verse search: a typed reference is answered locally, free text goes to the
// search service as one GET with the search-only key.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createSaves } from "../../../apps/reader-web/src/state/records/saves";
import { createVerseSearch } from "../../../apps/reader-web/src/backend/search";

const READER = {
  agent: "0x" + "ef".repeat(20),
  name: "Seed Reader",
  wire: true,
};

describe("saves", () => {
  it("files a chapter and a verse range away, lists them newest first, and toggles them off", async () => {
    const backend = createDevBackend(READER);
    const stores = memoryStores();
    const outbox = createOutbox({
      backend,
      stores,
      isOnline: () => true,
      settleMs: 1,
    });
    const buckets = createBucketStore({ backend, stores, outbox });
    const saves = createSaves(buckets, () => READER);
    await buckets.get("saves").ready;
    await saves.toggle("JHN.3", null, "BSB");
    await saves.toggle("JHN.3", { start: 16, end: 18 }, "BSB");
    const all = saves.all.value;
    expect(all.map((s) => s.passage)).toEqual(["JHN.3.16-JHN.3.18", "JHN.3"]);
    expect(all[0]).toMatchObject({
      chapter: "JHN.3",
      start: 16,
      end: 18,
      edition: "BSB",
    });
    expect(all[1]).toMatchObject({ chapter: "JHN.3", start: null, end: null });
    expect(saves.forPassage("JHN.3")).toHaveLength(1);
    await saves.toggle("JHN.3", null);
    expect(saves.forPassage("JHN.3")).toHaveLength(0);
    expect(saves.all.value).toHaveLength(1);
    await outbox.flush();
    expect(backend.calls.filter((c) => c.op === "merge")).toHaveLength(1);
    expect(
      backend.buckets.get("saves:saves")!["@graph"].filter((it) => !it.deleted)
    ).toHaveLength(1);
  });
});

describe("verse search", () => {
  const books = [
    {
      id: "JHN",
      name: "John",
      commonName: "John",
      numberOfChapters: 21,
      firstChapterNumber: 1,
    },
    {
      id: "1KI",
      name: "1 Kings",
      commonName: "1 Kings",
      numberOfChapters: 22,
      firstChapterNumber: 1,
    },
  ];
  it("saves take a label and a folder, and are moved between folders in place", async () => {
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
    const saves = createSaves(buckets, () => READER);
    const a = await saves.add("JHN.3.16", "BSB", "Gospel", "Memory verses");
    const b = await saves.add("ROM.8", "BSB");
    expect(saves.folders.value).toEqual(["Memory verses"]);
    await saves.update(b, { folder: "Memory verses", label: "Romans 8" });
    expect(saves.all.value.map((s) => `${s.label}@${s.folder}`).sort()).toEqual(
      ["Gospel@Memory verses", "Romans 8@Memory verses"]
    );
    await saves.update(a, { folder: "" });
    expect(saves.all.value.find((s) => s.id === a)).toMatchObject({
      label: "Gospel",
    });
    expect(saves.all.value.find((s) => s.id === a)?.folder).toBeUndefined();
    // The update supersedes the earlier write, so it is a plain update rather than a conflict on merge.
    const raw = buckets
      .get("saves")
      .bucket.value["@graph"].find((it) => it["@id"] === a) as {
      supersedes?: string;
    };
    expect(raw.supersedes).toBeTruthy();
  });

  it("answers a typed reference locally", () => {
    const s = createVerseSearch({
      fetchImpl: () => Promise.reject(new Error("no network")),
    });
    expect(s.parseReference("John 3:16", books)).toMatchObject({
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
    expect(s.parseReference("1 kings 2", books)).toMatchObject({
      book: "1KI",
      chapter: 2,
    });
    expect(s.parseReference("so loved the world", books)).toBeNull();
  });
  it("asks the search service for free text, within the open translation, with the search-only key", async () => {
    const calls: Array<{ url: string; key: string | undefined }> = [];
    const s = createVerseSearch({
      url: "https://search.test",
      key: "k-search",
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          key: (init?.headers as Record<string, string>)["x-typesense-api-key"],
        });
        return new Response(
          JSON.stringify({
            found: 1,
            hits: [
              {
                document: {
                  id: "1",
                  translation: "BSB",
                  book: "JHN",
                  chapter: 3,
                  verse: 16,
                  text: "For God so loved",
                  language: "eng",
                  reference: "John 3:16",
                },
              },
            ],
          }),
          { status: 200 }
        );
      },
    });
    const r = await s.searchVerses("eng", "BSB", "so loved");
    expect(r.found).toBe(1);
    expect(r.hits[0]).toMatchObject({ book: "JHN", chapter: 3, verse: 16 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.key).toBe("k-search");
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/collections/bibleVerses.eng/documents/search");
    expect(u.searchParams.get("filter_by")).toBe("translation:=BSB");
    expect(u.searchParams.get("q")).toBe("so loved");
  });
  it("sends nothing for an empty query and reports a failed call", async () => {
    let n = 0;
    const s = createVerseSearch({
      fetchImpl: async () => (n++, new Response("nope", { status: 503 })),
    });
    expect(await s.searchVerses("eng", "BSB", "   ")).toEqual({
      found: 0,
      hits: [],
    });
    expect(n).toBe(0);
    await expect(s.searchVerses("eng", "BSB", "x")).rejects.toThrow(/503/);
  });
});
