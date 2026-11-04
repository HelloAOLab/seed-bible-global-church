// SHARING WITH A FRIEND — the reader-a2a side's rules: one shelf per friend in the reader's own Library, an item shared
// again replaces itself, a removed one is gone, an unreadable shelf starts empty, and only a grant on THAT friend's
// folder that is neither revoked nor expired counts.
import { describe, expect, it } from "vitest";
import {
  addressOf,
  emptyShelf,
  folderFor,
  liveGrantFor,
  parseShelf,
  SHARE_TOOLS,
  withItem,
  type SharedItem,
} from "../../../apps/reader-a2a/src/skills/share";

const ME = "0x" + "a".repeat(40);
const RUTH = "0x" + "b".repeat(40);
const ELI = "0x" + "c".repeat(40);
const note = (key: string, text: string): SharedItem => ({
  key,
  kind: "note",
  title: "John 3:16",
  passage: "John.3.16",
  text,
  sharedAt: "2026-11-04T10:00:00Z",
});

describe("a friend's shelf", () => {
  it("lives in the reader's own Library, one folder per friend", () => {
    expect(folderFor(RUTH.toUpperCase().replace("0X", "0x"))).toBe(
      `seed-bible/shared/${RUTH}`
    );
  });

  it("an item shared again replaces itself, newest first; a removed one is gone", () => {
    let s = emptyShelf(ME, RUTH);
    s = withItem(s, note("n1", "first"));
    s = withItem(s, note("n2", "second"));
    s = withItem(s, note("n1", "edited"));
    expect(s.items.map((i) => [i.key, i.text])).toEqual([
      ["n1", "edited"],
      ["n2", "second"],
    ]);
    expect(
      withItem(s, { key: "n2", remove: true }).items.map((i) => i.key)
    ).toEqual(["n1"]);
  });

  it("reads back what it wrote, and an unreadable shelf starts empty", () => {
    const s = withItem(emptyShelf(ME, RUTH), note("n1", "x"));
    expect(parseShelf(JSON.stringify(s), ME, RUTH)).toEqual(s);
    expect(parseShelf("not json", ME, RUTH)).toEqual(emptyShelf(ME, RUTH));
    expect(
      parseShelf(
        JSON.stringify({ items: [{ key: "x", kind: "spell", text: "y" }] }),
        ME,
        RUTH
      ).items
    ).toEqual([]);
  });
});

describe("the grant that lets the friend read it", () => {
  const scope = (who: string) => `vault:content.folder:${folderFor(who)}/*`;
  it("is the live one on that friend's folder, latest first", () => {
    const grants = [
      {
        delegate: RUTH,
        resources: [scope(RUTH)],
        validUntil: "2026-12-01",
        grant: { g: 1 },
      },
      {
        delegate: RUTH,
        resources: [scope(RUTH)],
        validUntil: "2027-11-04",
        grant: { g: 2 },
      },
      {
        delegate: RUTH,
        resources: [scope(RUTH)],
        validUntil: "2028-01-01",
        revoked: true,
        grant: { g: 3 },
      },
      {
        delegate: RUTH,
        resources: [scope(RUTH)],
        validUntil: "2026-01-01",
        expired: true,
        grant: { g: 4 },
      },
      {
        delegate: ELI,
        resources: [scope(ELI)],
        validUntil: "2029-01-01",
        grant: { g: 5 },
      },
      {
        delegate: RUTH,
        resources: [scope(ELI)],
        validUntil: "2029-01-01",
        grant: { g: 6 },
      },
    ];
    expect(liveGrantFor(grants, RUTH)?.grant).toEqual({ g: 2 });
    expect(liveGrantFor([], RUTH)).toBeNull();
  });

  it("takes only an agent address", () => {
    expect(addressOf(RUTH.toUpperCase().replace("0X", "0x"))).toBe(RUTH);
    expect(() => addressOf("ruth.me")).toThrow(/agent address/);
  });

  it("offers the five share tools, the reads as lookups", () => {
    const byId = Object.fromEntries(SHARE_TOOLS.map((t) => [t.id, t]));
    expect(Object.keys(byId).sort()).toEqual([
      "seed.share.fetch",
      "seed.share.grant",
      "seed.share.grants",
      "seed.share.notify",
      "seed.share.put",
    ]);
    expect(byId["seed.share.grants"]!.establishes).toBe("lookup");
    expect(byId["seed.share.put"]!.establishes).toBeUndefined();
  });
});
