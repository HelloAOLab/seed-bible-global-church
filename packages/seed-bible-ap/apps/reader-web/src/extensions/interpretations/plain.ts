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
  "textual-reading": "Which wording do the oldest copies have?",
  "theological-inference": "A belief later readers drew from this verse",
};

const HEBREW = /[֐-׿]/;

export interface PlainQuestion {
  ask: string;
  /** The original-language words the question is about, when it names them. */
  term: string | null;
  /** The readings on the table, in the record's own words. */
  readings: string[];
  /** decided: the translation chose one; open: the evidence does not settle it; belief: a later belief, not the text. */
  state: "decided" | "open" | "belief";
  /** The reading the translation did not choose, from its own note ("Or: a wind from God."). */
  other: string | null;
}

const tidy = (s: string) =>
  s
    // a register or source code in brackets helps the workbench, not a reader
    .replace(/\s*\((?:register|attested|through)\b[^)]*\)/gi, "")
    // the record's joined-up readings (sons-of-israel, spirit-of-god) as words; a real compound (pre-existing) stays
    .replace(/\b[a-z]+(?:-[a-z]+){2,}\b/gi, (w) => w.replace(/-/g, " "))
    .replace(/\s+/g, " ")
    .trim();

export function plainQuestion(q: InterpretationQuestion): PlainQuestion {
  const [head = "", ...restParts] = q.text.split(/:\s+/);
  const rest = restParts.join(": ").split(/\s+—\s+/)[0] ?? "";
  const readings = rest
    ? rest
        .split(/\s+·\s+/)
        .map(tidy)
        .filter(Boolean)
    : [];
  const termMatch = /\bof\s+(.+?)(?:\s+\(|\s+in\s+\d|$)/.exec(head);
  const term =
    termMatch && HEBREW.test(termMatch[1]!) ? termMatch[1]!.trim() : null;
  const state: PlainQuestion["state"] = q.decided
    ? "decided"
    : q.kind === "theological-inference" || /policy/.test(q.status)
      ? "belief"
      : "open";
  const other = q.decided?.footnote
    ? q.decided.footnote.replace(/^Or:\s*/i, "").replace(/\.$/, "")
    : null;
  return {
    ask: ASK[q.kind] ?? "A question translators faced here",
    term,
    readings,
    state,
    other,
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
  const open = qs.length - decided;
  const n = qs.length;
  const parts = [`${n} question${n === 1 ? "" : "s"}`];
  if (decided) parts.push(`${decided} decided`);
  if (open) parts.push(`${open} left open`);
  return parts.join(" · ");
}
