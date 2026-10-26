// THE FLOATING SEARCH's books: the words name the book (its id, name or common name; the closest first), a trailing
// number its chapter when the book has one; a bare number or nothing names no book.
import { describe, expect, it } from "vitest";
import { matchBookReferences } from "../../../apps/reader-web/src/components/reader/FloatingSearch";
import type { TranslationBook } from "../../../apps/reader-web/src/backend/bible";

const book = (
  id: string,
  name: string,
  order: number,
  chapters: number
): TranslationBook =>
  ({
    id,
    name,
    commonName: name,
    title: null,
    order,
    numberOfChapters: chapters,
    firstChapterNumber: 1,
    lastChapterNumber: chapters,
  }) as unknown as TranslationBook;

const BOOKS = [
  book("GEN", "Genesis", 1, 50),
  book("JHN", "John", 43, 21),
  book("1JN", "1 John", 62, 5),
  book("PSA", "Psalms", 19, 150),
];

describe("books in the floating search", () => {
  it("matches a book and its chapter", () => {
    expect(matchBookReferences("Gen 2", BOOKS)).toEqual([
      { bookId: "GEN", bookName: "Genesis", chapterNumber: 2 },
    ]);
  });
  it("puts the book that starts with the words before one that only contains them", () => {
    expect(matchBookReferences("john", BOOKS).map((m) => m.bookId)).toEqual([
      "JHN",
      "1JN",
    ]);
  });
  it("keeps the book but drops a chapter it does not have", () => {
    expect(matchBookReferences("1 john 9", BOOKS)).toEqual([
      { bookId: "1JN", bookName: "1 John", chapterNumber: null },
    ]);
  });
  it("names no book for a bare number or nothing", () => {
    expect(matchBookReferences("5", BOOKS)).toEqual([]);
    expect(matchBookReferences("  ", BOOKS)).toEqual([]);
  });
});
