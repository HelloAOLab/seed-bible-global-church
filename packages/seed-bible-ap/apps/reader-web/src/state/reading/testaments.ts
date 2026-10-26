// TESTAMENTS — how the book picker groups a translation's books (the old BibleSelectorManager `groupBooks`): by the
// API's canonical `order`, 1–39 the Old Testament, 40–66 the New, anything after the Apocrypha (deuterocanon).
export type Testament = "old" | "new" | "apocrypha";
export type TestamentFilter = "all" | Testament;

export function testamentOf(order: number): Testament {
  if (order <= 39) return "old";
  if (order <= 66) return "new";
  return "apocrypha";
}

/** The Tanakh's order: the Torah, the Prophets (former and latter, the Twelve), the Writings. */
export const TANAKH_ORDER = [
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "ISA",
  "JER",
  "EZK",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
  "PSA",
  "PRO",
  "JOB",
  "SNG",
  "RUT",
  "LAM",
  "ECC",
  "EST",
  "DAN",
  "EZR",
  "NEH",
  "1CH",
  "2CH",
];

/**
 * The books of each testament, in order; a testament the translation lacks is an empty list. With `tanakh` the Old
 * Testament follows the Tanakh's order (the old reader's Book order setting); a book it does not name keeps its place
 * after those it does.
 */
export function groupByTestament<T extends { order: number; id?: string }>(
  books: readonly T[],
  bookOrder: "traditional" | "tanakh" = "traditional"
): Record<Testament, T[]> {
  const out: Record<Testament, T[]> = { old: [], new: [], apocrypha: [] };
  for (const b of [...books].sort((a, z) => a.order - z.order))
    out[testamentOf(b.order)].push(b);
  if (bookOrder === "tanakh") {
    const rank = (b: T) => {
      const i = TANAKH_ORDER.indexOf(b.id ?? "");
      return i < 0 ? TANAKH_ORDER.length + b.order : i;
    };
    out.old.sort((a, z) => rank(a) - rank(z));
  }
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
