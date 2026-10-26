// THE OUTBOX KEEPS PACE. A mark made while a send is in flight used to sit queued until something else happened to
// flush (a reading-history save waited ~24 s behind a highlight's), and buckets went up one at a time. Now a change
// queued mid-flight gets one more pass when the flight ends, and different buckets go up side by side.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createHighlights } from "../../../apps/reader-web/src/state/records/highlights";

const READER = {
  agent: "0x" + "ab".repeat(20),
  name: "Seed Reader",
  wire: true,
};

async function until(ok: () => boolean | Promise<boolean>, ms = 3000) {
  const t0 = Date.now();
  while (!(await ok())) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A backend whose merges take a while and are counted in flight. */
function slow(delayMs: number) {
  const backend = createDevBackend(READER);
  const live = { now: 0, max: 0, done: 0 };
  const merge = backend.mergeBucket.bind(backend);
  backend.mergeBucket = async (...args: Parameters<typeof merge>) => {
    live.now++;
    live.max = Math.max(live.max, live.now);
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      return await merge(...args);
    } finally {
      live.now--;
      live.done++;
    }
  };
  return { backend, live };
}

function device(backend: ReturnType<typeof createDevBackend>) {
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
  return {
    stores,
    outbox,
    highlights: createHighlights(buckets, () => backend.identity()),
  };
}

describe("the outbox's pace", () => {
  it("sends a change queued while a send is in flight, with nothing else to trigger it", async () => {
    const { backend } = slow(60);
    const d = device(backend);
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await until(() => d.outbox.flushing.value);
    await d.highlights.set("ROM.8", 28, 28, "green");
    await until(
      async () =>
        (await d.stores.outbox.keys()).length === 0 && !d.outbox.flushing.value
    );
    const remote = await backend.readBucket("highlights", "ROM.8");
    expect(remote["@graph"].length).toBe(1);
  });

  it("sends different buckets side by side", async () => {
    const { backend, live } = slow(80);
    const d = device(backend);
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await d.highlights.set("ROM.8", 28, 28, "green");
    await d.highlights.set("PSA.23", 1, 1, "blue");
    await until(() => live.done >= 3);
    expect(live.max).toBeGreaterThan(1);
  });
});

describe("a change to another bucket during a send", () => {
  it("goes up beside the send in flight, not after it", async () => {
    const { backend, live } = slow(300);
    const d = device(backend);
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await until(() => live.now === 1);
    const t0 = Date.now();
    await d.highlights.set("ROM.8", 28, 28, "green");
    await until(() => live.now === 2, 250);
    expect(Date.now() - t0).toBeLessThan(250);
    await until(() => live.done >= 2);
  });
});

describe("what the reader did goes before reading history", () => {
  it("sends a highlight before the history waiting beside it", async () => {
    const { backend } = slow(60);
    const order: string[] = [];
    const merge = backend.mergeBucket.bind(backend);
    backend.mergeBucket = async (collection, ...rest) => {
      order.push(`start:${collection}`);
      const out = await merge(collection, ...rest);
      order.push(`done:${collection}`);
      return out;
    };
    const stores = memoryStores();
    const outbox = createOutbox({
      backend,
      stores,
      isOnline: () => false,
      settleMs: 1,
    });
    const buckets = createBucketStore({
      backend,
      stores,
      outbox,
      isOnline: () => false,
    });
    const highlights = createHighlights(buckets, () => backend.identity());
    await buckets.put("history", "JHN.3", {
      "@id": "urn:seed:read:1",
      "@type": "seed:ReadingEvent",
      heldBy: READER.agent,
      aboutPassage: "JHN.3",
      opId: "h1",
      createdAt: "2026-10-22T00:00:00Z",
      updatedAt: "2026-10-22T00:00:00Z",
    } as never);
    await highlights.set("JHN.3", 16, 16, "yellow");
    await outbox.flush().catch(() => undefined);
    const online = createOutbox({
      backend,
      stores,
      isOnline: () => true,
      settleMs: 1,
    });
    await online.flush();
    expect(order.indexOf("done:highlights")).toBeLessThan(
      order.indexOf("start:history")
    );
  });
});

describe("reading history during a send", () => {
  it("waits for the pass after the send in flight, rather than going up beside it", async () => {
    const { backend, live } = slow(200);
    const d = device(backend);
    const order: string[] = [];
    const merge = backend.mergeBucket.bind(backend);
    backend.mergeBucket = async (collection, ...rest) => {
      order.push(`start:${collection}`);
      return merge(collection, ...rest).finally(() =>
        order.push(`done:${collection}`)
      );
    };
    await d.highlights.set("JHN.3", 16, 16, "yellow");
    await until(() => live.now === 1);
    await d.stores.buckets.set("history:JHN.3", {
      "@context": {},
      "@id": "h",
      "@graph": [
        {
          "@id": "urn:seed:read:1",
          "@type": "seed:ReadingEvent",
          heldBy: READER.agent,
          aboutPassage: "JHN.3",
          opId: "h1",
          createdAt: "2026-10-22T00:00:00Z",
          updatedAt: "2026-10-22T00:00:00Z",
        },
      ],
    } as never);
    await d.outbox.queue("history", "JHN.3", "h1");
    await until(
      async () =>
        (await d.stores.outbox.keys()).length === 0 && !d.outbox.flushing.value,
      3000
    );
    expect(order.indexOf("done:highlights")).toBeLessThan(
      order.indexOf("start:history")
    );
  });
});
