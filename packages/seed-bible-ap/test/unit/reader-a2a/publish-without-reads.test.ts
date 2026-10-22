// PUBLISHING WHEN THE AGENT CANNOT BE ASKED WHAT IT HOLDS: a playbook assigned before the Library reads joined the
// corpus offers the saves but refuses `library.file.read` (the Home brings the reads on its next open). The reader
// still publishes — under ids it can name itself — and a second publish is a new version of the same two
// documents, never twins on the shelf; a withdraw finds them the same way.
import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../../apps/reader-web/src/backend/a2a";
import { deterministicId } from "../../../apps/reader-a2a/src/skills/publish";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { fakeLibrary } from "../../helpers/fakeLibrary";
import { fakePersonAgent } from "../../helpers/fakePersonAgent";
import { fakeWorkspace } from "../../helpers/fakeWorkspace";
import { installFakeNetwork } from "../../helpers/fakeNetwork";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();

afterEach(() => vi.unstubAllGlobals());

async function readerWith(refuse: string[]) {
  const home = fakeHomeJwks();
  const library = fakeLibrary();
  const agent = fakePersonAgent({ library, refuse });
  const workspace = fakeWorkspace({ library });
  installFakeNetwork({
    "a2a.faithnet.io": agent.app,
    "www.faithnet.me": home.app,
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
    agent,
    backend: createA2aBackend(() => session, workspace.fetch),
  };
}

const args = {
  kind: "note",
  passage: "GEN.2",
  title: "This is a test",
  markdown: "# This is a test\n\nGenesis 2:9",
};

describe("publishing without the Library reads", () => {
  it("names the ids itself: a publish, a re-publish as a new version, a withdraw", async () => {
    const { library, agent, backend } = await readerWith([
      "library.file.read",
      "library.files.list",
    ]);
    const first = await backend.publishSlice(args);
    expect(first).toBeTruthy();
    const jsonId = deterministicId(
      "seed-bible/public/note",
      "this-is-a-test.jsonld"
    );
    const mdId = deterministicId("seed-bible/public/note", "this-is-a-test.md");
    expect(jsonId).toBe("sb-seed-bible-public-note-this-is-a-test-jsonld");
    const docs = () =>
      library
        .entries(READER)
        .filter((e) => e.folder === "seed-bible/public/note");
    expect(
      docs().map((e) => [
        e.id,
        e.name,
        e.version,
        e.accessPolicy,
        e.releases?.length,
      ])
    ).toEqual([
      [jsonId, "this-is-a-test.jsonld", 1, "public", 1],
      [mdId, "this-is-a-test.md", 1, "public", 1],
    ]);
    // The read was asked for and refused, once per document; the saves went through regardless.
    expect(
      agent.asks
        .filter((a) => a.steps[0]?.toolId === "library.file.read")
        .map((a) => a.reply.kind)
    ).toEqual(["error", "error"]);

    await backend.publishSlice({
      ...args,
      markdown: "# This is a test\n\nedited",
    });
    expect(docs().map((e) => [e.id, e.version, e.releases?.length])).toEqual([
      [jsonId, 2, 2],
      [mdId, 2, 2],
    ]);
    expect(
      library.text(READER, "seed-bible/public/note", "this-is-a-test.md")
    ).toContain("edited");

    await backend.withdrawSlice("note", "this-is-a-test");
    expect(docs().map((e) => e.accessPolicy)).toEqual(["private", "private"]);
  });

  it("with the reads offered, a re-publish still lands on the document the agent already holds", async () => {
    const { library, backend } = await readerWith([]);
    await backend.publishSlice(args);
    await backend.publishSlice(args);
    const docs = library
      .entries(READER)
      .filter((e) => e.folder === "seed-bible/public/note");
    expect(docs.map((e) => [e.name, e.version])).toEqual([
      ["this-is-a-test.jsonld", 2],
      ["this-is-a-test.md", 2],
    ]);
    expect(docs.every((e) => e.id.startsWith("art-"))).toBe(true);
  });
});
