// THE BUCKET CACHE SAVES THE READ, NEVER THE RECORD. With the reader's cache bound, a merge needs no read of its own and
// a read after it is answered without asking the reader's agent at all; a save that fails drops the entry, so the next
// read goes to the Library; and an entry past its freshness is not used.
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../../apps/reader-web/src/backend/a2a";
import { BucketCache } from "../../../apps/reader-a2a/src/rooms/BucketCache";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { fakeLibrary } from "../../helpers/fakeLibrary";
import { fakePersonAgent } from "../../helpers/fakePersonAgent";
import { fakeWorkspace } from "../../helpers/fakeWorkspace";
import { installFakeNetwork } from "../../helpers/fakeNetwork";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function cacheNamespace() {
  const stores = new Map<string, Map<string, unknown>>();
  const objects = new Map<string, BucketCache>();
  return {
    stores,
    idFromName: (name: string) => name,
    get: (id: never) => {
      const name = String(id);
      if (!objects.has(name)) {
        const m = new Map<string, unknown>();
        stores.set(name, m);
        objects.set(
          name,
          new BucketCache({
            storage: {
              get: async (k: string) => m.get(k) as never,
              put: async (k: string, v: unknown) =>
                void m.set(k, structuredClone(v)),
              delete: async (k: string) => m.delete(k),
            },
          } as never)
        );
      }
      const obj = objects.get(name)!;
      return {
        fetch: (url: string, init?: RequestInit) =>
          obj.fetch(new Request(url, init)),
      };
    },
  };
}

async function reader(refuse: string[] = []) {
  const home = fakeHomeJwks();
  const library = fakeLibrary();
  const agent = fakePersonAgent({ library, refuse });
  const workspace = fakeWorkspace({ library });
  const cache = cacheNamespace();
  (workspace.env as Record<string, unknown>)["BUCKET_CACHE"] = cache;
  installFakeNetwork({
    "a2a.faithnet.io": agent.app,
    "www.faithnet.me": home.app,
    "seed-bible-a2a.faithnet.io": async () => Response.json({ ok: true }),
  });
  await workspace.connect(
    READER,
    await syntheticAskAsMeWire({ reader: READER, askKey: workspace.askKey })
  );
  const session = await workspace.sessionFor(
    await home.issueIdToken({ sub: READER, name: "Ruth" })
  );
  return {
    library,
    cache,
    refuse,
    backend: createA2aBackend(() => session, workspace.fetch),
  };
}

const bookmark = (id: string) => ({
  "@id": `urn:seed:bookmark:${id}`,
  "@type": "seed:Bookmark",
  heldBy: READER,
  aboutPassage: "JHN.3",
  bookmarkName: "John 3",
  opId: `op-${id}`,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
});
const bucket = (...ids: string[]) => ({
  "@context": {},
  "@id": "b",
  "@graph": ids.map(bookmark),
});
/** Reads of the bookmarks bucket itself (the manifest's bookkeeping reads its own document). */
const runs = (library: ReturnType<typeof fakeLibrary>, toolId: string) =>
  library.calls.filter(
    (c) => c.toolId === toolId && c.args["name"] === "bookmarks.jsonld"
  ).length;

describe("the reader's bucket cache", () => {
  it("answers a read after a merge, and the next merge, without reading the Library", async () => {
    const { library, backend } = await reader();
    await backend.mergeBucket(
      "bookmarks",
      undefined,
      bucket("a") as never,
      "op1"
    );
    const readsAfterFirst = runs(library, "library.file.read");
    const read = await backend.readBucket("bookmarks");
    expect(read["@graph"].map((i) => i["@id"])).toEqual([
      "urn:seed:bookmark:a",
    ]);
    await backend.mergeBucket(
      "bookmarks",
      undefined,
      bucket("a", "b") as never,
      "op2"
    );
    expect(runs(library, "library.file.read")).toBe(readsAfterFirst);
    expect(
      library.text(READER, "seed-bible/bookmarks", "bookmarks.jsonld")
    ).toContain("urn:seed:bookmark:b");
  });

  it("drops the entry when a save fails, so the next read goes to the Library", async () => {
    const { library, refuse, backend } = await reader();
    await backend.mergeBucket(
      "bookmarks",
      undefined,
      bucket("a") as never,
      "op1"
    );
    refuse.push("library.file.save");
    await expect(
      backend.mergeBucket(
        "bookmarks",
        undefined,
        bucket("a", "b") as never,
        "op2"
      )
    ).rejects.toThrow();
    refuse.length = 0;
    const before = runs(library, "library.file.read");
    const read = await backend.readBucket("bookmarks");
    expect(runs(library, "library.file.read")).toBe(before + 1);
    expect(read["@graph"].map((i) => i["@id"])).toEqual([
      "urn:seed:bookmark:a",
    ]);
  });

  it("does not use an entry past its freshness", async () => {
    const { library, backend } = await reader();
    await backend.mergeBucket(
      "bookmarks",
      undefined,
      bucket("a") as never,
      "op1"
    );
    const before = runs(library, "library.file.read");
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ["Date"] });
    await backend.readBucket("bookmarks");
    expect(runs(library, "library.file.read")).toBe(before + 1);
  });
});
