// THE REGISTRY BY CANONICAL LOCUS: every offering is stored with its passage's canonical id and verse span, so asking
// by a verse finds the range and the chapter that hold it, a chapter or a book finds everything inside, and an exact id
// finds what is anchored there. Run against the real migrations on SQLite (D1 is SQLite).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCrawl,
  queryByLocusId,
  queryByPassage,
} from "../../../apps/seed-bible-a2a/src/registry/store";
import type { IndexedOffering } from "../../../apps/seed-bible-a2a/src/registry/crawl";
import { parseLocus } from "../../../lib/locus";
import { d1WithMigrations } from "../../helpers/d1";

const MIGRATIONS = join(__dirname, "../../../apps/seed-bible-a2a/migrations");
const OWNER = "0x" + "22".repeat(20);

const offering = (
  entryId: string,
  passageRef: string,
  kind = "note"
): IndexedOffering => ({
  owner: OWNER,
  entryId,
  shelf: "ruth.me",
  version: 1,
  releaseId: `rel-${entryId}`,
  releaseSigned: true,
  passage:
    passageRef === "*"
      ? "*"
      : passageRef.split("-")[0]!.split(".").slice(0, 2).join("."),
  passageRef,
  kind,
  title: entryId,
  descriptorId: `urn:seed:offering:${entryId}`,
  descriptor: {},
  markdownPath: null,
});

async function registry() {
  const db = d1WithMigrations(MIGRATIONS);
  await applyCrawl(db, {
    shelf: "ruth.me",
    owner: OWNER,
    ok: true,
    listed: 5,
    skipped: [],
    offerings: [
      offering("on-316", "JHN.3.16"),
      offering("born-again", "JHN.3.1-JHN.3.8", "study"),
      offering("chapter-3", "JHN.3"),
      offering("chapter-4", "JHN.4"),
      offering("everywhere", "*", "playlist"),
    ],
  });
  return db;
}
const titles = (rows: Array<{ title: string }>) =>
  rows.map((r) => r.title).sort();

describe("the registry by canonical locus", () => {
  it("a verse finds what holds it: itself, a range around it and its chapter", async () => {
    const db = await registry();
    expect(titles(await queryByPassage(db, "John 3:5"))).toEqual([
      "born-again",
      "chapter-3",
    ]);
    expect(titles(await queryByPassage(db, "JHN.3.16"))).toEqual([
      "chapter-3",
      "on-316",
    ]);
  });

  it("a chapter or a book finds everything inside; another chapter finds none of it", async () => {
    const db = await registry();
    expect(titles(await queryByPassage(db, "JHN.3"))).toEqual([
      "born-again",
      "chapter-3",
      "on-316",
    ]);
    expect(titles(await queryByPassage(db, "John"))).toEqual([
      "born-again",
      "chapter-3",
      "chapter-4",
      "on-316",
    ]);
    expect(await queryByPassage(db, "JHN.5")).toEqual([]);
    expect(
      titles(await queryByPassage(db, "JHN.3", { kind: "study" }))
    ).toEqual(["born-again"]);
  });

  it("stores the canonical id and span, and an exact id finds its offering", async () => {
    const db = await registry();
    const [row] = await queryByLocusId(db, parseLocus("John 3:16")!.id);
    expect(row).toMatchObject({
      title: "on-316",
      locus_id:
        "0x3e443e12ab97ffd23826594b7a412c3ede0d87179e6239a18c8a12f3f0a7e9ac",
      span_start: 43003016,
      span_end: 43003016,
    });
  });

  it("a row indexed before the span existed is still found by its chapter", async () => {
    const db = await registry();
    await db
      .prepare(
        "UPDATE offerings SET locus_id = NULL, span_start = NULL, span_end = NULL WHERE entry_id = 'chapter-4'"
      )
      .run();
    expect(titles(await queryByPassage(db, "JHN.4.2"))).toEqual(["chapter-4"]);
  });

  it("answers nothing for what is not a place in the Bible", async () => {
    const db = await registry();
    expect(await queryByPassage(db, "Hezekiah 1")).toEqual([]);
  });
});
