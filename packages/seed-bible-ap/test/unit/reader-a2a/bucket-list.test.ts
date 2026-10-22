// THE BUCKET LIST NAMES EACH BUCKET THE WAY A DEVICE READS IT. A device pulls what another device did by listing a
// collection's buckets and reading each by its chapter. The list returned the manifest's entries without their keys,
// whose `bucket` field is the document's file name, so a device asked for highlights on "chapter 1.jsonld": the
// cross-device pull read nothing real. Each entry is now the chapter (or the collection), with the file name beside it.
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
  return createA2aBackend(() => session, workspace.fetch);
}

const highlight = (passage: string) => ({
  "@id": `urn:seed:highlight:${passage}`,
  "@type": "seed:Highlight",
  heldBy: READER,
  aboutPassage: passage,
  highlightColor: "seed:highlightcolor-yellow",
  opId: `op-${passage}`,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
});

describe("listing a collection's buckets", () => {
  it("names each chaptered bucket by its chapter, so another device can read it", async () => {
    const backend = await reader();
    for (const ch of ["JHN.3", "PSA.23"])
      await backend.mergeBucket(
        "highlights",
        ch,
        {
          "@context": {},
          "@id": "b",
          "@graph": [highlight(`${ch}.1`)],
        } as never,
        `op-${ch}`
      );
    const list = await backend.listBuckets("highlights");
    expect(list.map((e) => e.bucket).sort()).toEqual(["JHN.3", "PSA.23"]);
    const read = await backend.readBucket(
      "highlights",
      list.find((e) => e.bucket === "PSA.23")!.bucket
    );
    expect(read["@graph"]).toHaveLength(1);
  });
});
