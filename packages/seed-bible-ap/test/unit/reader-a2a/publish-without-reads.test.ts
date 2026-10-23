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
  // The registry: after a publish or a withdraw the workspace asks it to crawl the owner's shelf now.
  const crawls: unknown[] = [];
  installFakeNetwork({
    "a2a.faithnet.io": agent.app,
    "www.faithnet.me": home.app,
    "seed-bible-a2a.faithnet.io": async (request: Request) => {
      if (new URL(request.url).pathname === "/registry/crawl")
        crawls.push(await request.json());
      return Response.json({ ok: true });
    },
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
    crawls,
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
    const { library, agent, backend, crawls } = await readerWith([
      "library.file.read",
      "library.files.list",
    ]);
    const first = await backend.publishSlice(args);
    expect(first).toBeTruthy();
    expect(crawls).toEqual([{ owner: READER }]);
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

  it("keeps the playlist itself on the published descriptor, so a reader can save it and play it", async () => {
    const { library, backend } = await readerWith([]);
    const work = {
      "@id": "urn:seed:playlist:p1",
      "@type": "seed:Playlist",
      publishedBy: READER,
      label: "Lent",
      hasItem: [{ "@type": "seed:ScriptureItem", aboutPassage: "MAT.4" }],
    };
    await backend.publishSlice({
      kind: "playlist",
      passage: "MAT.4",
      title: "Lent",
      slug: "playlist-p1",
      markdown: "# Lent\n\n- MAT.4",
      descriptor: {
        "prov:wasDerivedFrom": work["@id"],
        work,
        label: "not this",
      },
    });
    const text = library.text(
      READER,
      "seed-bible/public/playlist",
      "playlist-p1.jsonld"
    );
    const d = JSON.parse(text ?? "{}") as Record<string, unknown>;
    expect(d["work"]).toEqual(work);
    expect(d["prov:wasDerivedFrom"]).toBe(work["@id"]);
    expect(d["label"]).toBe("Lent");
    expect(d["@type"]).toBe("seed:Offering");
  });

  it("publishes into the newest of two documents that share a name, instead of refusing every time", async () => {
    const { library, backend } = await readerWith([]);
    const folder = "seed-bible/public/profile";
    const older = library.seed(READER, {
      folder,
      name: "profile.jsonld",
      kind: "json-ld",
      text: "{}",
      createdAt: 1,
    });
    const newer = library.seed(READER, {
      folder,
      name: "profile.jsonld",
      kind: "json-ld",
      text: "{}",
      createdAt: 2,
    });
    await backend.publishSlice({
      kind: "profile",
      title: "Ruth",
      slug: "profile",
      markdown: "# Ruth",
    });
    const twins = library
      .entries(READER)
      .filter((e) => e.folder === folder && e.name === "profile.jsonld");
    expect(
      twins.map((e) => [e.id, e.version, e.releases?.length ?? 0])
    ).toEqual([
      [older.id, 1, 0],
      [newer.id, 2, 1],
    ]);
  });
});
