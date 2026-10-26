// A BUCKET'S DOCUMENT ID IS REMEMBERED, NEVER TRUSTED. The workspace remembers which Library document holds each bucket
// so a read names it (the agent fetches the body beside the index, one vault round trip fewer). If that document was
// removed and made again under a new id, the remembered id names nothing: the read is made again by name, and the
// bucket is never mistaken for empty.
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../../apps/reader-web/src/backend/a2a";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { fakeLibrary } from "../../helpers/fakeLibrary";
import { fakePersonAgent } from "../../helpers/fakePersonAgent";
import { fakeWorkspace } from "../../helpers/fakeWorkspace";
import { installFakeNetwork } from "../../helpers/fakeNetwork";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();
afterEach(() => vi.unstubAllGlobals());

async function reader() {
  const home = fakeHomeJwks();
  const library = fakeLibrary();
  const agent = fakePersonAgent({ library });
  const workspace = fakeWorkspace({ library });
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
  return { library, backend: createA2aBackend(() => session, workspace.fetch) };
}

const mark = (id: string) => ({
  "@id": `urn:seed:bookmark:${id}`,
  "@type": "seed:Bookmark",
  heldBy: READER,
  aboutPassage: "JHN.3",
  bookmarkName: "John 3",
  opId: `op-${id}`,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
});

describe("a bucket's remembered document id", () => {
  it("reads by the remembered id, and by name again when the id has gone", async () => {
    const { library, backend } = await reader();
    const bucket = { "@context": {}, "@id": "b", "@graph": [mark("a")] };
    await backend.mergeBucket("bookmarks", undefined, bucket as never, "op1");
    const first = await backend.readBucket("bookmarks");
    expect(first["@graph"].map((i) => i["@id"])).toEqual([
      "urn:seed:bookmark:a",
    ]);
    const reads = () =>
      library.calls
        .filter((c) => c.toolId === "library.file.read")
        .map((c) => c.args["id"]);
    expect(reads().at(-1)).toEqual(expect.any(String));
    // The document is removed and made again: same folder and name, a new id.
    for (const e of library.entries(READER))
      if (e.name.startsWith("bookmarks")) e.id = "art-remade";
    const again = await backend.readBucket("bookmarks");
    expect(again["@graph"].map((i) => i["@id"])).toEqual([
      "urn:seed:bookmark:a",
    ]);
    expect(reads().at(-1)).toBeUndefined();
  });
});
