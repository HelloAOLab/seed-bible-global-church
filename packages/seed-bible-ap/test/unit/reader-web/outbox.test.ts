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
import { createAnnotations } from "../../../apps/reader-web/src/state/records/annotations";

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
  const notes = createAnnotations(buckets, () => backend.identity());
  return {
    backend,
    stores,
    outbox,
    buckets,
    highlights,
    bookmarks,
    notes,
    online,
  };
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

describe("marks of another person on this device", () => {
  it("are parked at sign-in, never sent as the reader's, and the reader's own go up", async () => {
    const backend = createDevBackend(null);
    const d = device(backend, { value: true });
    // Earlier on this device: Ruth signed in and highlighted; then a stranger highlighted.
    const RUTH = "0x" + "99".repeat(20);
    await d.buckets.get("highlights", "JHN.3").ready;
    await d.buckets.put("highlights", "JHN.3", {
      "@id": "urn:seed:highlight:JHN.3.2",
      "@type": "seed:Highlight",
      heldBy: RUTH,
      aboutPassage: "JHN.3.2",
      highlightColor: "seed:highlightcolor-pink",
      opId: "op-ruth",
    });
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await tick();
    backend.setIdentity(READER);
    await d.buckets.resync();
    const lib = backend.buckets
      .get("highlights:JHN.3")!
      ["@graph"].filter((it) => !it.deleted);
    expect(lib.map((it) => it.heldBy)).toEqual([READER.agent]);
    expect(d.outbox.pending.value).toBe(0);
    const parked = await d.stores.buckets.get(
      `parked:${RUTH}:highlights:JHN.3`
    );
    expect(parked?.["@graph"].map((it) => it["@id"])).toEqual([
      "urn:seed:highlight:JHN.3.2",
    ]);
    expect(
      d.highlights.forChapter("JHN.3").value.map((h) => h.colorId)
    ).toEqual(["yellow"]);
  });
});

// THE SYNC MATRIX (test-plan A3.1) — every way a bucket can move between this device and the Library, driven
// by mutating `backend.buckets` to stand for what another device already put there.
describe("the sync matrix", () => {
  const graph = (backend: ReturnType<typeof createDevBackend>, key: string) =>
    backend.buckets.get(key)?.["@graph"] ?? [];
  type NoteItem = {
    "@id": string;
    opId: string;
    note?: string;
    conflictOf?: string;
    deleted?: boolean;
  };
  const liveNotes = (backend: ReturnType<typeof createDevBackend>) =>
    graph(backend, "annotations:JHN.3").filter(
      (it) => !it.deleted
    ) as unknown as NoteItem[];
  /** What another device put in the Library: a copy of the note with a new opId, body and time, no `supersedes`. */
  const elsewhere = (
    backend: ReturnType<typeof createDevBackend>,
    id: string,
    patch: Record<string, unknown>
  ) => {
    const doc = backend.buckets.get("annotations:JHN.3")!;
    const at = doc["@graph"].findIndex((it) => it["@id"] === id);
    const cur = doc["@graph"][at]!;
    const { supersedes: _s, ...rest } = cur as Record<string, unknown>;
    const next = [...doc["@graph"]];
    next[at] = { ...rest, ...patch } as typeof cur;
    backend.buckets.set("annotations:JHN.3", { ...doc, "@graph": next });
  };
  const PAST = "2020-01-01T00:00:00.000Z";
  const FUTURE = "2099-01-01T00:00:00.000Z";

  it("create: a new note goes up once and the device holds what the Library holds", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "For God so loved");
    const r = await d.outbox.flush();
    expect(r.merged).toEqual(["annotations:JHN.3"]);
    expect(liveNotes(d.backend).map((it) => it["@id"])).toEqual([id]);
    expect(await d.stores.buckets.get("annotations:JHN.3")).toEqual(
      d.backend.buckets.get("annotations:JHN.3")
    );
  });

  it("update unchanged: nothing new on the device means no run, and the same bucket again changes nothing", async () => {
    const d = device();
    await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    const merges = () => d.backend.calls.filter((c) => c.op === "merge").length;
    expect(merges()).toBe(1);
    const again = await d.outbox.flush();
    expect(again.merged).toEqual([]);
    expect(merges()).toBe(1);
    // A second device sends the identical bucket: kept as is, the item not duplicated.
    const e = device(d.backend);
    await e.buckets.get("annotations", "JHN.3").ready;
    const before = graph(d.backend, "annotations:JHN.3");
    const rep = await d.backend.mergeBucket(
      "annotations",
      "JHN.3",
      e.buckets.get("annotations", "JHN.3").bucket.value,
      "batch-again"
    );
    expect(rep["@graph"]).toEqual(before);
    expect(liveNotes(d.backend)).toHaveLength(1);
  });

  it("changed elsewhere: an edit here collides with an edit it never saw — both kept, the copy flagged conflictOf", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    elsewhere(d.backend, id, {
      note: "one, from the phone",
      opId: "op-phone",
      updatedAt: FUTURE,
    });
    await d.notes.edit("JHN.3", id, "one, from the laptop");
    const r = await d.outbox.flush();
    expect(r.error).toBeUndefined();
    const live = liveNotes(d.backend);
    expect(live.map((it) => it.note).sort()).toEqual([
      "one, from the laptop",
      "one, from the phone",
    ]);
    const copy = live.find((it) => it.conflictOf)!;
    expect(copy.conflictOf).toBe(id);
    expect(copy.note).toBe("one, from the laptop");
    // The device took the merged bucket as its truth: it shows both, the copy flagged.
    const seen = d.notes.forChapter("JHN.3").value;
    expect(seen).toHaveLength(2);
    expect(seen.find((n) => n.conflictOf)?.conflictOf).toBe(id);
  });

  it("changed elsewhere, same words: no conflict, the later write wins and one copy remains", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    elsewhere(d.backend, id, { opId: "op-phone", updatedAt: PAST });
    await d.notes.edit("JHN.3", id, "one");
    await d.outbox.flush();
    const live = liveNotes(d.backend);
    expect(live).toHaveLength(1);
    expect(live[0]!.opId).not.toBe("op-phone");
  });

  it("deleted elsewhere: the tombstone comes down on resync; an edit made after it wins (later wins, deletes too)", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    elsewhere(d.backend, id, {
      deleted: true,
      opId: "op-phone-delete",
      updatedAt: FUTURE,
    });
    await d.buckets.resync();
    expect(d.notes.forChapter("JHN.3").value).toEqual([]);

    const e = device();
    const id2 = await e.notes.add("JHN.3", 17, 17, "two");
    await e.outbox.flush();
    elsewhere(e.backend, id2, {
      deleted: true,
      opId: "op-phone-delete",
      updatedAt: PAST,
    });
    await e.notes.edit("JHN.3", id2, "two, kept after all");
    await e.outbox.flush();
    expect(liveNotes(e.backend).map((it) => it.note)).toEqual([
      "two, kept after all",
    ]);
  });

  it("delete after edit offline: one batch, one run, and the Library ends with the tombstone, not the edit", async () => {
    const online = { value: true };
    const d = device(createDevBackend(READER), online);
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    online.value = false;
    await d.notes.edit("JHN.3", id, "one, edited");
    await d.notes.remove("JHN.3", id);
    await tick();
    expect(d.outbox.pending.value).toBe(1);
    const entry = await d.stores.outbox.get("annotations:JHN.3");
    expect(entry?.opIds).toHaveLength(2);
    online.value = true;
    const r = await d.outbox.flush();
    expect(r.merged).toEqual(["annotations:JHN.3"]);
    expect(d.backend.calls.filter((c) => c.op === "merge")).toHaveLength(2);
    const all = graph(d.backend, "annotations:JHN.3");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ "@id": id, deleted: true });
    expect(d.notes.forChapter("JHN.3").value).toEqual([]);
  });

  it("converge when already gone: deleting what another device deleted is one tombstone, no error, nothing pending", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    elsewhere(d.backend, id, {
      deleted: true,
      opId: "op-phone-delete",
      updatedAt: PAST,
    });
    await d.notes.remove("JHN.3", id);
    const r = await d.outbox.flush();
    expect(r.error).toBeUndefined();
    const all = graph(d.backend, "annotations:JHN.3");
    expect(all).toHaveLength(1);
    expect(all[0]!.deleted).toBe(true);
    expect(d.outbox.pending.value).toBe(0);
    await d.buckets.resync();
    expect(d.notes.forChapter("JHN.3").value).toEqual([]);
  });

  it("same opId twice: a replayed batch and a replayed item each leave one version", async () => {
    const d = device();
    const id = await d.notes.add("JHN.3", 16, 16, "one");
    await d.outbox.flush();
    const mine = d.buckets.get("annotations", "JHN.3").bucket.value;
    // The same bucket, the same batch, sent again (a retry after a lost reply).
    const rep = await d.backend.mergeBucket("annotations", "JHN.3", mine, "b1");
    expect(rep["@graph"]).toEqual(mine["@graph"]);
    expect(graph(d.backend, "annotations:JHN.3")).toHaveLength(1);
    // The same item put again on the device: no new version, nothing queued.
    const item = mine["@graph"].find((it) => it["@id"] === id)!;
    await d.buckets.put("annotations", "JHN.3", item);
    expect(await d.stores.outbox.get("annotations:JHN.3")).toBeUndefined();
    expect(d.notes.forChapter("JHN.3").value).toHaveLength(1);
  });

  it("offline across collections: one run per bucket, each bucket whole", async () => {
    const online = { value: false };
    const d = device(createDevBackend(READER), online);
    await d.notes.add("JHN.3", 16, 16, "a note");
    await d.notes.add("JHN.3", 17, 17, "another");
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await d.highlights.set("JHN.4", 1, 1, "green");
    await d.bookmarks.add("JHN.3", "John 3");
    await tick();
    expect(d.backend.calls.filter((c) => c.op === "merge")).toHaveLength(0);
    expect(d.outbox.pending.value).toBe(4);
    online.value = true;
    const r = await d.outbox.flush();
    expect(r.error).toBeUndefined();
    expect(r.merged.sort()).toEqual([
      "annotations:JHN.3",
      "bookmarks:bookmarks",
      "highlights:JHN.3",
      "highlights:JHN.4",
    ]);
    expect(d.backend.calls.filter((c) => c.op === "merge")).toHaveLength(4);
    expect(liveNotes(d.backend)).toHaveLength(2);
    expect(d.outbox.pending.value).toBe(0);
  });
});
