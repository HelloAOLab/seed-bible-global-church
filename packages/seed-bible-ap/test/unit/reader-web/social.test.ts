// Publishing and discovering over the dev backend: a note published becomes an offering Discover lists for its
// chapter and friends' Today feeds carry; withdrawn, it is gone. Markdown of a note is what goes on the shelf.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createDiscover } from "../../../apps/reader-web/src/state/social/discover";
import { createPublishing } from "../../../apps/reader-web/src/state/social/publishing";
import { createToday } from "../../../apps/reader-web/src/state/social/today";
import { noteHtmlToMarkdown } from "../../../apps/reader-web/src/components/records/noteMarkdown";
import type { Note } from "../../../apps/reader-web/src/state/records/annotations";

const RUTH = { agent: "0x" + "11".repeat(20), name: "Ruth", wire: true };
const SEED = { agent: "0x" + "22".repeat(20), name: "Seed Reader", wire: true };

const note: Note = {
  id: "urn:seed:note:JHN.3:abcdef123456",
  start: 16,
  end: 17,
  note: "<p>For <strong>God</strong> so loved</p><ul><li>the world</li></ul>",
  updatedAt: "2026-10-22T00:00:00Z",
};

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("publish and discover", () => {
  it("a published note is listed for its chapter with its markdown, and withdrawing removes it", async () => {
    const backend = createDevBackend(RUTH);
    const stores = memoryStores();
    const publishing = createPublishing(backend, stores);
    const discover = createDiscover(backend);
    await publishing.publishNote("JHN.3", note, "Ruth on John 3");
    expect(publishing.isPublished(note.id)).toBe(true);
    expect(publishing.recordOf(note.id)).toMatchObject({
      noteId: note.id,
      passage: "JHN.3.16-JHN.3.17",
    });
    expect(publishing.recordOf(note.id)?.descriptorId).toBeTruthy();
    await discover.refresh("JHN.3");
    const list = discover.forChapter("JHN.3").value!.offerings;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "note",
      title: "Ruth on John 3",
      passage: "JHN.3.16-JHN.3.17",
      owner: RUTH.agent,
    });
    const body = discover.body(list[0]!);
    await settle();
    expect(body.value).toContain("# Ruth on John 3");
    expect(body.value).toContain("For **God** so loved");
    expect(body.value).toContain("- the world");
    await discover.refresh("JHN.4");
    expect(discover.forChapter("JHN.4").value!.offerings).toHaveLength(0);

    await publishing.withdrawNote(note);
    expect(publishing.isPublished(note.id)).toBe(false);
    await discover.refresh("JHN.3");
    expect(discover.forChapter("JHN.3").value!.offerings).toHaveLength(0);
  });

  it("a friend's Today feed carries what contacts released and nothing else", async () => {
    const backend = createDevBackend(RUTH);
    const stores = memoryStores();
    await createPublishing(backend, stores).publishNote(
      "JHN.3",
      note,
      "Ruth's note"
    );
    backend.setIdentity({
      agent: "0x" + "33".repeat(20),
      name: "Stranger",
      wire: true,
    });
    await createPublishing(backend, memoryStores()).publishNote(
      "JHN.3",
      { ...note, id: "urn:seed:note:JHN.3:stranger" },
      "A stranger's note"
    );
    backend.setIdentity(SEED);
    backend.contactList = [{ contact: RUTH.agent, name: "Ruth", mutual: true }];
    const today = createToday(backend, memoryStores());
    await today.refresh();
    expect(today.friends.value.map((c) => c.name)).toEqual(["Ruth"]);
    expect(today.feed.value.map((o) => o.title)).toEqual(["Ruth's note"]);
  });

  it("the feed follows the Home's friends — mutual only — and Today shows who is waiting on whom", async () => {
    const backend = createDevBackend(RUTH);
    const stores = memoryStores();
    await createPublishing(backend, stores).publishNote(
      "JHN.3",
      note,
      "Ruth's note"
    );
    const stranger = {
      agent: "0x" + "33".repeat(20),
      name: "Stranger",
      wire: true,
    };
    backend.setIdentity(stranger);
    await createPublishing(backend, memoryStores()).publishNote(
      "JHN.3",
      { ...note, id: "urn:seed:note:JHN.3:stranger" },
      "A stranger's note"
    );
    backend.setIdentity(SEED);
    // Ruth is a friend; the stranger added Seed (a request); Seed added Dan, who has not added back.
    backend.friendsView = {
      friends: [
        { agent: RUTH.agent, name: "Ruth", since: "2026-10-01T00:00:00Z" },
      ],
      requests: [
        { agent: stranger.agent, name: "Stranger", at: "2026-10-22T00:00:00Z" },
      ],
      requested: [{ agent: "0x" + "44".repeat(20), name: "Dan" }],
    };
    const today = createToday(backend, stores);
    await today.refresh();
    expect(today.friends.value.map((c) => `${c.name}:${c.mutual}`)).toEqual([
      "Ruth:true",
    ]);
    expect(today.requests.value.map((r) => r.name)).toEqual(["Stranger"]);
    expect(today.requested.value.map((r) => r.name)).toEqual(["Dan"]);
    expect(today.feed.value.map((o) => o.title)).toEqual(["Ruth's note"]);
    // The friends view is remembered on the device for the next open.
    expect(await stores.prefs.get("friends")).toMatchObject({
      friends: [{ name: "Ruth" }],
    });
  });

  it("an agent without the friends read answers with its contacts", async () => {
    const backend = createDevBackend(SEED);
    backend.contactList = [
      { contact: RUTH.agent, name: "Ruth", mutual: true },
      { contact: "0x" + "44".repeat(20), name: "Dan", mutual: false },
    ];
    const original = backend.friends.bind(backend);
    backend.friends = async () => {
      throw new Error("unknown tool person.friend.list");
    };
    const today = createToday(backend, memoryStores());
    await today.refresh();
    expect(today.friendsView.value).toBeNull();
    expect(today.friends.value.map((c) => c.name)).toEqual(["Ruth", "Dan"]);
    expect(today.requests.value).toEqual([]);
    backend.friends = original;
  });

  it("notes become shelf markdown", () => {
    expect(
      noteHtmlToMarkdown(
        '<h2>Title</h2><p class="text-center">A <em>b</em> <a href="/read/BSB/JHN/3" data-verse="16">John 3:16</a></p><ol><li>x</li><li>y</li></ol>'
      )
    ).toBe("## Title\n\nA _b_ [John 3:16](/read/BSB/JHN/3)\n\n1. x\n2. y");
  });
});

describe("profiles", () => {
  it("a published profile reaches a friend's Today as their name, line and picture", async () => {
    const { createProfile } =
      await import("../../../apps/reader-web/src/state/social/profile");
    const backend = createDevBackend(RUTH);
    const ruthStores = memoryStores();
    const profile = createProfile(backend, ruthStores, () => RUTH);
    await profile.save({
      displayName: "Ruth of Moab",
      about: "Where you go, I will go.",
    });
    await profile.save({ picture: "https://files.test/ruth.jpg" });
    expect(profile.mine.value).toMatchObject({
      displayName: "Ruth of Moab",
      about: "Where you go, I will go.",
      picture: "https://files.test/ruth.jpg",
    });
    const publishing = createPublishing(backend, ruthStores);
    await publishing.publishProfile(profile.mine.value!);
    expect(publishing.isPublished(profile.mine.value!["@id"])).toBe(true);
    // A friend's Today, over the registry.
    backend.setIdentity(SEED);
    backend.friendsView = {
      friends: [{ agent: RUTH.agent, name: "ruth.me" }],
      requests: [],
      requested: [],
    };
    const today = createToday(backend, memoryStores());
    await today.refresh();
    expect(today.profiles.value[RUTH.agent.toLowerCase()]).toMatchObject({
      displayName: "Ruth of Moab",
      picture: "https://files.test/ruth.jpg",
    });
    // The profile is shown with the friend, not among their releases.
    expect(today.releases.value.map((o) => o.kind)).not.toContain("profile");
  });
});

describe("connectors", () => {
  it("are listed from the Home, read-only", async () => {
    const backend = createDevBackend(SEED);
    backend.connectorList = [
      {
        id: "c1",
        name: "Ligonier",
        url: "https://mcp.ligonier.test",
        server: "ligonier",
        attachedAt: null,
        tools: [
          { name: "search_resources", kind: "read", why: null },
          { name: "post_note", kind: "act", why: null },
        ],
      },
    ];
    const rows = await backend.connectors();
    expect(
      rows.map(
        (c) =>
          `${c.name}:${c.tools.filter((t) => t.kind === "read").length}/${c.tools.length}`
      )
    ).toEqual(["Ligonier:1/2"]);
  });
});
