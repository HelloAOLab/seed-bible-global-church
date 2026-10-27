// Friends' notes in the passage: a friend's published note is marked at the verse it starts at, in its own chapter
// only; a stranger's note, a whole-chapter note and a playlist are not.
import { describe, expect, it } from "vitest";
import {
  friendNotesByVerse,
  startVerseIn,
} from "../../../apps/reader-web/src/state/social/friendNotes";
import type { Offering } from "../../../apps/reader-web/src/state/social/discover";

const RUTH = "0x" + "11".repeat(20);
const STRANGER = "0x" + "99".repeat(20);
const offer = (owner: string, passage: string, kind = "note"): Offering =>
  ({
    owner,
    shelf: owner === RUTH ? "ruth.me" : "someone.me",
    kind,
    passage,
    title: "t",
    descriptorId: `${owner}:${passage}:${kind}`,
    descriptor: {},
    indexedAt: "2026-10-26T00:00:00Z",
    entryId: "e",
    releaseId: "r",
    version: 1,
  }) as unknown as Offering;

describe("friends' notes in the passage", () => {
  it("a note's start verse, in its own chapter only", () => {
    expect(startVerseIn("JHN.3", "JHN.3.16")).toBe(16);
    expect(startVerseIn("JHN.3", "JHN.3.16-JHN.3.17")).toBe(16);
    expect(startVerseIn("JHN.3", "JHN.3")).toBeNull();
    expect(startVerseIn("JHN.3", "JHN.4.1")).toBeNull();
  });
  it("only a friend's notes are marked, at their verses", () => {
    const marks = friendNotesByVerse(
      "JHN.3",
      [
        offer(RUTH, "JHN.3.16"),
        offer(RUTH, "JHN.3.16-JHN.3.18"),
        offer(STRANGER, "JHN.3.5"),
        offer(RUTH, "JHN.3"),
        offer(RUTH, "JHN.3.1", "playlist"),
      ],
      new Set([RUTH])
    );
    expect([...marks.keys()]).toEqual([16]);
    expect(marks.get(16)).toHaveLength(2);
  });
});
