// THE FIXTURES, END TO END (test-plan §A2 "done when"): a reader signs in with a token the fake Home minted, marks
// a highlight through the reader state over the LIVE backend, flushes the outbox, and the mark is in the fake
// Library — put there by the real vault code through the fake person agent, which admitted the workspace's
// assertion under the reader's wire. Then the bucket reads back. No network: the blocker would fail the test.
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../apps/reader-web/src/backend/a2a";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { fakeHomeJwks } from "../helpers/fakeHomeJwks";
import { fakeLibrary } from "../helpers/fakeLibrary";
import { fakePersonAgent } from "../helpers/fakePersonAgent";
import { fakeWorkspace } from "../helpers/fakeWorkspace";
import { installFakeNetwork } from "../helpers/fakeNetwork";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();

afterEach(() => vi.unstubAllGlobals());

/** `want` appears in `seen` in this order, other entries allowed between (a read left over from boot, under load). */
const inOrder = (seen: readonly string[], want: readonly string[]) => {
  let i = 0;
  for (const s of seen) if (s === want[i]) i++;
  return i === want.length;
};

describe("the test fixtures", () => {
  it("sign in with a fake token, highlight, flush, read back from the fake Library — no network", async () => {
    const home = fakeHomeJwks();
    const library = fakeLibrary();
    const agent = fakePersonAgent({ library });
    const workspace = fakeWorkspace({ library });
    const network = installFakeNetwork({
      "a2a.faithnet.io": agent.app,
      "www.faithnet.me": home.app,
    });
    await workspace.connect(
      READER,
      await syntheticAskAsMeWire({ reader: READER, askKey: workspace.askKey })
    );
    const token = await home.issueIdToken({ sub: READER, name: "Ruth" });
    const session = await workspace.sessionFor(token);
    expect(session).toMatchObject({ sub: READER, name: "Ruth", via: "home" });

    const backend = createA2aBackend(() => session, workspace.fetch);
    const { state } = await createTestReaderState({ backend, session });
    expect(backend.identity()).toMatchObject({ agent: READER, name: "Ruth" });

    const asksBefore = workspace.asks.length;
    const stepsBefore = agent.asks.flatMap((a) => a.steps).length;
    await state.highlights.set("JHN.3", 16, 16, "yellow");
    const report = await state.outbox.flush();
    expect(report.error).toBeUndefined();
    expect(report.merged).toEqual(["highlights:JHN.3"]);

    const saved = library.text(READER, "seed-bible/highlights/JHN", "3.jsonld");
    expect(saved).not.toBeNull();
    const doc = JSON.parse(saved!) as {
      "@graph": Array<Record<string, unknown>>;
    };
    expect(doc["@graph"]).toHaveLength(1);
    expect(doc["@graph"][0]).toMatchObject({
      highlightColor: expect.stringMatching(/yellow$/),
      aboutPassage: "JHN.3.16",
    });
    // The manifest followed the bucket.
    expect(
      library.text(READER, "seed-bible/highlights", "_manifest.jsonld")
    ).toContain("JHN.3");

    const back = await backend.readBucket("highlights", "JHN.3");
    expect(back["@graph"].map((it) => it.aboutPassage)).toEqual(["JHN.3.16"]);

    // Every hop was in-process: the workspace's door, then the person's agent under the wire, then the Home's keys.
    // (The state read its collections at boot; after the highlight come the merge and the read-back.)
    const asks = workspace.asks.slice(asksBefore).map((a) => a.toolId);
    expect(inOrder(asks, ["seed.bucket.merge", "seed.bucket.read"])).toBe(true);
    expect(agent.refusals).toEqual([]);
    const steps = agent.asks
      .flatMap((a) => a.steps.map((s) => s.toolId))
      .slice(stepsBefore);
    expect(
      inOrder(steps, [
        "library.file.read",
        "library.file.save",
        "library.file.read",
        "library.file.save",
        "library.file.read",
      ])
    ).toBe(true);
    expect(
      network.requests.some(
        (r) => r.host === "www.faithnet.me" && r.path === "/jwks"
      )
    ).toBe(true);
  });

  it("a token from another issuer, or signed by another key, is nobody", async () => {
    const home = fakeHomeJwks();
    const workspace = fakeWorkspace();
    installFakeNetwork({ "www.faithnet.me": home.app });
    expect(
      await workspace.sessionFor(
        await home.issueIdToken({ sub: READER, iss: "https://evil.example" })
      )
    ).toBeNull();
    expect(
      await workspace.sessionFor(
        await home.issueIdToken({ sub: READER, aud: "another-app" })
      )
    ).toBeNull();
    expect(
      await workspace.sessionFor(
        await home.issueIdToken({
          sub: READER,
          exp: Math.floor(Date.now() / 1000) - 10,
        })
      )
    ).toBeNull();
    expect(await workspace.sessionFor("not-a-token")).toBeNull();
  });

  it("the person's agent refuses a wire its delegator did not sign, in words the reader sees", async () => {
    const home = fakeHomeJwks();
    const library = fakeLibrary();
    const agent = fakePersonAgent({ library });
    const workspace = fakeWorkspace({ library });
    installFakeNetwork({
      "a2a.faithnet.io": agent.app,
      "www.faithnet.me": home.app,
    });
    const other = "0x" + "cd".repeat(20);
    // Shape passes at the door (it names `other` and this workspace's key), so the workspace keeps it; the person's
    // agent is what checks the signature — and the test reader's key signed it, not `other`.
    await workspace.connect(
      other,
      await syntheticAskAsMeWire({ reader: other, askKey: workspace.askKey })
    );
    const session = await workspace.sessionFor(
      await home.issueIdToken({ sub: other, name: "Nobody" })
    );
    const backend = createA2aBackend(() => session, workspace.fetch);
    await expect(backend.readBucket("highlights", "JHN.3")).rejects.toThrow(
      /not signed by its delegator/
    );
    expect(agent.refusals).toEqual([
      { status: 401, error: "the wire was not signed by its delegator" },
    ]);
    expect(library.calls).toEqual([]);
  });
});
