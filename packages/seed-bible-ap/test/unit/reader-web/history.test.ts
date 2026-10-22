// Reading history: a chapter read is one event per day in that chapter's history bucket (a second look extends
// it); recent reading and the map's heat come off the device's buckets; a second device pulls what the first
// wrote through the Library's manifest; and Your Content's "all chapters" lists marks across chapters.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createHistory } from "../../../apps/reader-web/src/state/records/history";
import { createHighlights } from "../../../apps/reader-web/src/state/records/highlights";
import { listStored } from "../../../apps/reader-web/src/state/records/all";
import { createReaderState } from "../../../apps/reader-web/src/state";
import type { ReadingApi } from "../../../apps/reader-web/src/state/reading/reading";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";
import type { Highlight } from "@seed/seed-schema";

const READER = {
  agent: "0x" + "ab".repeat(20),
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
  const who = () => backend.identity();
  return {
    stores,
    buckets,
    outbox,
    history: createHistory(buckets, stores, who),
    highlights: createHighlights(buckets, who),
  };
}

const until = async (cond: () => Promise<boolean> | boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("reading history", () => {
  it("keeps one event per chapter and day, extending it on a second look", async () => {
    const d = device(createDevBackend(READER));
    await d.history.record("JHN.3", "BSB", "2026-10-22T10:00:00.000Z");
    await d.history.record("JHN.3", "BSB", "2026-10-22T11:30:00.000Z");
    await d.history.record("JHN.3", "BSB", "2026-10-23T08:00:00.000Z");
    const events = d.buckets.get("history", "JHN.3").bucket.value["@graph"];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      "@type": "seed:ReadingEvent",
      heldBy: READER.agent,
      aboutPassage: "JHN.3",
      ofEdition: "BSB",
      startedAt: "2026-10-22T10:00:00.000Z",
      endedAt: "2026-10-22T11:30:00.000Z",
    });
    expect(events[1]).toMatchObject({ startedAt: "2026-10-23T08:00:00.000Z" });
  });

  it("lists recent chapters newest first and counts days read for the map", async () => {
    const d = device(createDevBackend(READER));
    await d.history.record("JHN.3", "BSB", "2026-10-20T10:00:00.000Z");
    await d.history.record("ROM.8", "BSB", "2026-10-21T10:00:00.000Z");
    await d.history.record("JHN.3", "BSB", "2026-10-22T10:00:00.000Z");
    const recent = await d.history.recent();
    expect(recent.map((r) => r.chapterRef)).toEqual(["JHN.3", "ROM.8"]);
    expect(recent[0]).toMatchObject({
      edition: "BSB",
      at: "2026-10-22T10:00:00.000Z",
    });
    expect(await d.history.heat()).toEqual({ "JHN.3": 2, "ROM.8": 1 });
  });

  it("a second device pulls the chapters the first read, through the Library's manifest", async () => {
    const lib = createDevBackend(READER);
    const a = device(lib);
    await a.history.record("JHN.3", "BSB", "2026-10-22T10:00:00.000Z");
    await a.highlights.set("ROM.8", 28, 28, "green");
    await a.outbox.flush();

    const b = device(lib);
    expect(await b.history.recent()).toEqual([]);
    await b.buckets.pullAll();
    expect((await b.history.recent()).map((r) => r.chapterRef)).toEqual([
      "JHN.3",
    ]);
    expect(
      b.highlights.forChapter("ROM.8").value.map((h) => String(h.verse))
    ).toEqual(["28"]);
    expect(
      lib.calls
        .filter((c) => c.op === "list")
        .map((c) => c.key)
        .sort()
    ).toEqual(["annotations", "highlights", "history"]);
    // A second pull opens nothing new: the device already holds those buckets.
    expect(await b.buckets.pull("history")).toBe(0);
  });

  it("a stranger pulls nothing, and a pull is bounded", async () => {
    const lib = createDevBackend(null);
    const s = device(lib);
    expect(await s.buckets.pull("highlights")).toBe(0);
    const signed = createDevBackend(READER);
    const a = device(signed);
    for (const ch of [1, 2, 3])
      await a.highlights.set(`JHN.${ch}`, 1, 1, "yellow");
    await a.outbox.flush();
    const b = device(signed);
    expect(await b.buckets.pull("highlights", 2)).toBe(2);
  });

  it("lists every highlight on the device by chapter for Your Content's all-chapters view", async () => {
    const d = device(createDevBackend(READER));
    await d.highlights.set("ROM.8", 28, 28, "green");
    await d.highlights.set("JHN.3", 16, 17, "yellow");
    await d.highlights.set("JHN.3", 1, 1, "blue");
    const all = await listStored<Highlight>(
      d.stores,
      "highlights",
      "seed:Highlight",
      () => READER
    );
    expect(all.map((c) => `${c.chapterRef}:${c.items.length}`)).toEqual([
      "JHN.3:2",
      "ROM.8:1",
    ]);
    expect(all[0]!.items.map((h) => h.aboutPassage).sort()).toEqual([
      "JHN.3.1",
      "JHN.3.16-JHN.3.17",
    ]);
  });

  it("a chapter that stays open counts as read", async () => {
    const api: ReadingApi = {
      getAvailableTranslations: async () => ({ translations: [] }),
      getTranslationBooks: async () =>
        ({
          translation: { id: "BSB" },
          books: [
            {
              id: "JHN",
              name: "John",
              commonName: "John",
              numberOfChapters: 21,
            },
          ],
        }) as never,
      getTranslationBookChapter: async (t, b, c) =>
        ({
          translation: { id: t },
          book: { id: b, name: "John" },
          chapter: {
            number: Number(c),
            content: [{ type: "verse", number: 1, content: ["x"] }],
            footnotes: [],
          },
          nextChapterApiLink: null,
          previousChapterApiLink: null,
        }) as unknown as TranslationBookChapter,
      getAudioTimings: async () => {
        throw new Error("none");
      },
    };
    const state = createReaderState({
      backend: createDevBackend(READER),
      stores: memoryStores(),
      api,
      session: null,
      isOnline: () => true,
      readDwellMs: 5,
    });
    const stop = await state.start();
    await until(async () => (await state.history.recent()).length > 0);
    const [r] = await state.history.recent();
    expect(r!.chapterRef).toBe(state.reading.chapterRef.value);
    expect(r!.edition).toBe("BSB");
    stop();
  });
});
