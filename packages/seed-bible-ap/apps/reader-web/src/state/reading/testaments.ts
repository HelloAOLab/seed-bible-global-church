// TESTAMENTS — how the book picker groups a translation's books (the old BibleSelectorManager `groupBooks`): by the
// API's canonical `order`, 1–39 the Old Testament, 40–66 the New, anything after the Apocrypha (deuterocanon).
export type Testament = "old" | "new" | "apocrypha";
export type TestamentFilter = "all" | Testament;

export function testamentOf(order: number): Testament {
  if (order <= 39) return "old";
  if (order <= 66) return "new";
  return "apocrypha";
}

/** The books of each testament, in order; a testament the translation lacks is an empty list. */
export function groupByTestament<T extends { order: number }>(
  books: readonly T[]
): Record<Testament, T[]> {
  const out: Record<Testament, T[]> = { old: [], new: [], apocrypha: [] };
  for (const b of [...books].sort((a, z) => a.order - z.order))
    out[testamentOf(b.order)].push(b);
  return out;
}

/** The testaments to offer in the picker: the two, plus the Apocrypha only when the translation has it. */
export function testamentChoices(
  books: readonly { order: number }[]
): TestamentFilter[] {
  const g = groupByTestament(books);
  return [
    "all",
    "old",
    "new",
    ...(g.apocrypha.length ? (["apocrypha"] as const) : []),
  ];
}
