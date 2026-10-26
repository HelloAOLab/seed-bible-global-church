// AN INTERPRETATION RECORD IN PLAIN WORDS — for a reader who is not a scholar. The record is written for the translation
// workbench (`clause-relation=temporal`, `register D11`, `bx:…`); what a reader needs is the question in everyday words,
// the readings on the table, and what this translation did with them. Everything here is drawn from the record itself
// (the question's own list of readings, the translation's "Or: …" note, its note on the source, the readers it names);
// nothing is invented, and the full record stays one tap away for whoever wants it.
import type {
  InterpretationPath,
  InterpretationQuestion,
  InterpretedVerse,
} from "./index";

/** The question a kind of record asks, as a reader would ask it. */
const ASK: Record<string, string> = {
  referent: "Who is meant here?",
  "lexical-sense": "What does a key word mean here?",
  "clause-relation": "How does this sentence begin?",
  "textual-reading": "Which words are original?",
  "theological-inference": "A belief later readers drew from this verse",
  "implicit-information": "What is implied here?",
  "figurative-sense": "What does the figure of speech mean?",
  "grammatical-relation": "How do the words relate?",
};

/** Hebrew or Greek: original-language words a question is about. */
const ORIGINAL = /[\u0590-\u05FF\u0370-\u03FF\u1F00-\u1FFF]/;

/** The printed Greek editions a textual reading is found in, by the names readers know them by. */
const EDITION: Record<string, string> = {
  TR: "the Textus Receptus (the King James Version's Greek)",
  Byz: "the Byzantine text",
  NA28: "Nestle-Aland 28",
  NA27: "Nestle-Aland 27",
  NE1904: "Nestle 1904",
  SBL: "the SBL Greek New Testament",
  Tyn: "the Tyndale House Greek New Testament",
  WH: "Westcott-Hort",
  Treg: "Tregelles",
};

export interface PlainQuestion {
  ask: string;
  /** The original-language words the question is about, when it names them. */
  term: string | null;
  /** The readings on the table, in the record's own words (a textual one with the editions that print it). */
  readings: string[];
  /** decided: a reviewer recorded a decision; policy: the edition translates its base text (textual questions);
   *  open: no one has decided; belief: a later belief, not the text. */
  state: "decided" | "policy" | "open" | "belief";
  /** The reading the translation did not choose, from its own note ("Or: a wind from God."). */
  other: string | null;
  /** What the published English expresses — an observation, never a decision: the reading, "leaves it open", or none. */
  reads: { reading: string | null; open: boolean; how: string | null } | null;
  /** Whose notes the readings come from (e.g. unfoldingWord® Translation Notes, CC BY-SA 4.0). */
  credit: string | null;
}

const tidy = (s: string) =>
  s
    // a register or source code in brackets helps the workbench, not a reader
    .replace(/\s*\((?:register|attested|through)\b[^)]*\)/gi, "")
    // the record's joined-up readings (sons-of-israel, spirit-of-god) as words; a real compound (pre-existing) stays
    .replace(/\b[a-z]+(?:-[a-z]+){2,}\b/gi, (w) => w.replace(/-/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** Where a textual reading is printed: "Nestle-Aland 28 and 7 other editions" / "the Textus Receptus (…)". */
export function editionsWords(
  editions: string[] | null | undefined
): string | null {
  if (!editions?.length) return null;
  const named = editions.map((e) => EDITION[e] ?? e);
  if (named.length <= 2) return named.join(" and ");
  const lead = editions.includes("NA28") ? EDITION["NA28"]! : named[0]!;
  return `${lead} and ${named.length - 1} other editions`;
}

export function plainQuestion(q: InterpretationQuestion): PlainQuestion {
  const [head = "", ...restParts] = q.text.split(/:\s+/);
  const rest = restParts.join(": ").split(/\s+—\s+/)[0] ?? "";
  const textual = q.kind === "textual-reading";
  const withEditions = textual && q.candidates.some((c) => c.editions?.length);
  const readings = withEditions
    ? q.candidates.map((c) => {
        const where = editionsWords(c.editions);
        return where ? `${c.reading} — in ${where}` : c.reading;
      })
    : rest
      ? rest
          .split(/\s+·\s+/)
          .map(tidy)
          .filter(Boolean)
      : [];
  // The words asked about: after "of" (sense of רוּחַ אֱלֹהִים) or after the plain ask's dash (How the words relate — ἡ κοινωνία …).
  const termMatch =
    /\s—\s+(.+)$/.exec(head) ?? /\bof\s+(.+?)(?:\s+\(|\s+in\s+\d|$)/.exec(head);
  const term =
    termMatch && ORIGINAL.test(termMatch[1]!) ? termMatch[1]!.trim() : null;
  const state: PlainQuestion["state"] =
    q.decided?.policyUse === "textual-basis"
      ? "policy"
      : q.decided
        ? "decided"
        : q.kind === "theological-inference" || /policy/.test(q.status)
          ? "belief"
          : "open";
  const other = q.decided?.footnote
    ? q.decided.footnote.replace(/^Or:\s*/i, "").replace(/\.$/, "")
    : null;
  const o = q.observed;
  const reads =
    o && o.candidate !== "unknown"
      ? {
          reading: o.candidate === "both" ? null : (o.reading ?? null),
          open: o.candidate === "both",
          how: (o.method === "base-text" ? o.reason : o.how) ?? null,
        }
      : null;
  const consulted = q.writings?.consulted?.[0] as
    | { attribution?: string; work?: string; licence?: string }
    | undefined;
  return {
    ask: ASK[q.kind] ?? "A question translators faced here",
    term,
    readings,
    state,
    other,
    reads,
    credit: consulted?.attribution ?? null,
  };
}

/** What the translators say about the verse: their note on the source, without the draft's housekeeping. */
export function translatorsNote(v: InterpretedVerse): string | null {
  const note = v.status?.note ?? "";
  const i = note.search(/Note on the source:/i);
  const said = (
    i >= 0 ? note.slice(i).replace(/^Note on the source:\s*/i, "") : ""
  ).trim();
  return said || null;
}

/** Whether the record is still a draft no person has reviewed. */
export const isDraft = (v: InterpretedVerse) =>
  !!v.status && !/reviewed|approved|final/i.test(v.status.stage);

/** The readers a verse's story paths name (Rashi, Julius Africanus), without the record's source codes. */
export function namedReaders(paths: InterpretationPath[]): string[] {
  const out = new Set<string>();
  for (const p of paths)
    if (p.attributedTo)
      out.add(
        p.attributedTo.replace(/\s*\((?:through|register)[^)]*\)/gi, "").trim()
      );
  return [...out].filter(Boolean);
}

/** One line for a verse's card: how many questions, and what became of them. */
export function verseSummary(v: InterpretedVerse): string {
  const qs = v.interpretation.questions.map(plainQuestion);
  const decided = qs.filter((q) => q.state === "decided").length;
  const open = qs.filter((q) => q.state === "open").length;
  const n = qs.length;
  const parts = [`${n} question${n === 1 ? "" : "s"}`];
  if (decided) parts.push(`${decided} decided`);
  if (open) parts.push(`${open} not yet decided`);
  return parts.join(" · ");
}
