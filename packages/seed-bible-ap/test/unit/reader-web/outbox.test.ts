// hard-problems §2 proven at the seam: marks made while the Library is out of reach flush as ONE merge run per
// bucket when it is back, and the device ends up holding what the Library holds.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import {
  adoptBucket,
  createBucketStore,
} from "../../../apps/reader-web/src/state/records/buckets";
import { createHighlights } from "../../../apps/reader-web/src/state/records/highlights";
import { createBookmarks } from "../../../apps/reader-web/src/state/records/bookmarks";

const READER = {
  agent: "0x" + "ab".repeat(20),
  name: "Seed Reader",
  wire: true,
};

function device(backend = createDevBackend(READER), online = { value: true }) {
  const stores = memoryStores();
  const outbox = createOutbox({
    backend,
    stores,
    isOnline: () => online.value,
    settleMs: 1,
    onMerged: (c, ch, b) => buckets.accept(c, ch, b),
  });
  const buckets = createBucketStore({
    backend,
    stores,
    outbox,
    isOnline: () => online.value,
  });
  const highlights = createHighlights(buckets, () => backend.identity());
  const bookmarks = createBookmarks(buckets, () => backend.identity());
  return { backend, stores, outbox, buckets, highlights, bookmarks, online };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("the offline outbox", () => {
  it("flushes one merge run per bucket, however many marks were made offline", async () => {
    const online = { value: false };
    const d = device(createDevBackend(READER), online);
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await d.highlights.set("JHN.3", 17, 18, "green");
    await d.highlights.set("JHN.3", 1, 1, "blue");
    await d.bookmarks.add("JHN.3", "John 3");
    await tick();
    expect(d.backend.calls.filter((c) => c.op === "merge")).toHaveLength(0);
    expect(d.outbox.pending.value).toBe(2);

    online.value = true;
    const report = await d.outbox.flush();
    expect(report.error).toBeUndefined();
    expect(report.merged.sort()).toEqual([
      "bookmarks:bookmarks",
      "highlights:JHN.3",
    ]);
    expect(d.backend.calls.filter((c) => c.op === "merge")).toHaveLength(2);
    expect(d.outbox.pending.value).toBe(0);

    const inLibrary = d.backend.buckets.get("highlights:JHN.3")!["@graph"];
    expect(inLibrary.filter((it) => !it.deleted)).toHaveLength(3);
    expect(await d.stores.buckets.get("highlights:JHN.3")).toEqual(
      inLibrary.length ? { ...d.backend.buckets.get("highlights:JHN.3") } : null
    );
    expect(
      d.highlights.forChapter("JHN.3").value.map((h) => [h.colorId, h.verse])
    ).toEqual([
      ["yellow", 16],
      ["green", [17, 18]],
      ["blue", 1],
    ]);
  });

  it("keeps the entry and reports the error when the workspace is unreachable, then succeeds on retry", async () => {
    const backend = createDevBackend(READER);
    const d = device(backend, { value: true });
    await d.highlights.set("JHN.3", 16, 16, "pink");
    backend.setOffline(true);
    const r1 = await d.outbox.flush();
    expect(r1.merged).toEqual([]);
    expect(r1.error).toMatch(/could not be reached/);
    expect(d.outbox.pending.value).toBe(1);
    backend.setOffline(false);
    const r2 = await d.outbox.flush();
    expect(r2.merged).toEqual(["highlights:JHN.3"]);
    // The retry replayed the same batch id — idempotent on the far side.
    const merges = backend.calls.filter((c) => c.op === "merge");
    expect(merges).toHaveLength(1);
  });

  it("never sends a stranger's marks, and adopts them on sign-in", async () => {
    const backend = createDevBackend(null);
    const d = device(backend, { value: true });
    await d.highlights.set("JHN.3", 16, 16, "orange");
    await tick();
    expect(d.outbox.pending.value).toBe(1);
    expect(backend.calls).toHaveLength(0);
    const before = d.highlights.forChapter("JHN.3").value;
    expect(before).toHaveLength(1);

    backend.setIdentity(READER);
    await d.buckets.resync();
    const lib = backend.buckets.get("highlights:JHN.3")!["@graph"];
    expect(lib.filter((it) => !it.deleted).map((it) => it.heldBy)).toEqual([
      READER.agent,
    ]);
    expect(d.outbox.pending.value).toBe(0);
  });

  it("a replayed put changes nothing and queues nothing", async () => {
    const d = device();
    const item = {
      "@id": "urn:seed:highlight:JHN.3.16",
      "@type": "seed:Highlight" as const,
      heldBy: READER.agent,
      aboutPassage: "JHN.3.16",
      highlightColor: "seed:highlightcolor-yellow",
      opId: "op-1",
    };
    await d.buckets.get("highlights", "JHN.3").ready;
    await d.buckets.put("highlights", "JHN.3", item);
    const once = await d.stores.outbox.get("highlights:JHN.3");
    expect(once?.opIds).toEqual(["op-1"]);
    await d.buckets.put("highlights", "JHN.3", item);
    const twice = await d.stores.outbox.get("highlights:JHN.3");
    expect(twice).toEqual(once);
  });
});

describe("adoption of anonymous marks", () => {
  it("adopts marks kept from an earlier session (buckets not open now) at sign-in", async () => {
    const backend = createDevBackend(null);
    const online = { value: true };
    const stores = memoryStores();
    // An earlier session left a stranger's highlight on the device, with its outbox entry.
    const d1 = device(backend, online);
    const d1b = { ...d1, stores };
    void d1b;
    const first = device(backend, online);
    await first.highlights.set("JHN.3", 16, 16, "yellow");
    await tick();
    // A new session on the same device: nothing opened yet, then the reader signs in.
    const second = createBucketStore({
      backend,
      stores: first.stores,
      outbox: first.outbox,
      isOnline: () => true,
    });
    backend.setIdentity(READER);
    await second.resync();
    const lib = backend.buckets
      .get("highlights:JHN.3")!
      ["@graph"].filter((it) => !it.deleted);
    expect(lib.map((it) => it.heldBy)).toEqual([READER.agent]);
    expect(first.outbox.pending.value).toBe(0);
  });

  it("repairs and retries a bucket the workspace refuses for an anonymous item", async () => {
    const backend = createDevBackend(READER);
    const stores = memoryStores();
    const outbox = createOutbox({
      backend,
      stores,
      isOnline: () => true,
      settleMs: 1,
      repair: (_c, _ch, b) =>
        adoptBucket(b, READER.agent, () => `fix-${Math.random()}`),
    });
    const buckets = createBucketStore({
      backend,
      stores,
      outbox,
      isOnline: () => true,
    });
    await buckets.get("highlights", "JHN.3").ready;
    await buckets.put("highlights", "JHN.3", {
      "@id": "urn:seed:highlight:JHN.3.1",
      "@type": "seed:Highlight",
      heldBy: "0x0000000000000000000000000000000000000000",
      aboutPassage: "JHN.3.1",
      highlightColor: "seed:highlightcolor-blue",
      opId: "op-anon",
    });
    const r = await outbox.flush();
    expect(r.error).toBeUndefined();
    expect(r.merged).toEqual(["highlights:JHN.3"]);
    const lib = backend.buckets.get("highlights:JHN.3")!["@graph"];
    expect(lib.map((it) => it.heldBy)).toEqual([READER.agent]);
    expect(
      backend.calls
        .filter((c) => c.op === "merge")
        .map((c) => c.opId?.endsWith("-repaired"))
    ).toEqual([false, true]);
  });
});
