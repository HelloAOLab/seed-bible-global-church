// THE TANAKH ORDER (the old reader's Book order setting): the Old Testament as the Torah, the Prophets and the
// Writings; the New Testament and a book the order does not name keep their places.
import { describe, expect, it } from "vitest";
import { groupByTestament } from "../../../apps/reader-web/src/state/reading/testaments";

const books = [
  { id: "GEN", order: 1 },
  { id: "RUT", order: 8 },
  { id: "2KI", order: 12 },
  { id: "1CH", order: 13 },
  { id: "PSA", order: 19 },
  { id: "ISA", order: 23 },
  { id: "MAL", order: 39 },
  { id: "MAT", order: 40 },
];

describe("book order", () => {
  it("is the Christian order by default", () => {
    expect(groupByTestament(books).old.map((b) => b.id)).toEqual([
      "GEN",
      "RUT",
      "2KI",
      "1CH",
      "PSA",
      "ISA",
      "MAL",
    ]);
  });
  it("follows the Tanakh when asked", () => {
    const g = groupByTestament(books, "tanakh");
    expect(g.old.map((b) => b.id)).toEqual([
      "GEN",
      "2KI",
      "ISA",
      "MAL",
      "PSA",
      "RUT",
      "1CH",
    ]);
    expect(g.new.map((b) => b.id)).toEqual(["MAT"]);
  });
});
