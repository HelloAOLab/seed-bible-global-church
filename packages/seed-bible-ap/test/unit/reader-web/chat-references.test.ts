// BIBLE REFERENCES IN A CHAT LINE become links: by the open translation's book names (and short names), with a chapter
// and, when given, verses; a word that only starts like a book, or a book with no chapter, is left alone.
import { describe, expect, it } from "vitest";
import { findReferences } from "../../../apps/reader-web/src/components/sessions/ChatPanel";

const BOOKS = [
  { id: "JHN", name: "John", commonName: "John" },
  { id: "1CO", name: "1 Corinthians", commonName: "1 Cor" },
  { id: "ROM", name: "Romans", commonName: "Romans" },
];

describe("chat references", () => {
  it("finds chapters, verses and ranges, by name or short name", () => {
    const text = "Read John 3:16 and 1 Cor 13, then Romans 8:28-30.";
    const refs = findReferences(text, BOOKS);
    expect(
      refs.map((r) => [
        text.slice(r.start, r.end),
        r.bookId,
        r.chapter,
        r.from,
        r.to,
      ])
    ).toEqual([
      ["John 3:16", "JHN", 3, 16, 16],
      ["1 Cor 13", "1CO", 13, undefined, undefined],
      ["Romans 8:28-30", "ROM", 8, 28, 30],
    ]);
  });

  it("leaves words that are not references", () => {
    expect(findReferences("Johnny 3 and John said hi", BOOKS)).toEqual([]);
    expect(findReferences("anything", [])).toEqual([]);
  });
});
