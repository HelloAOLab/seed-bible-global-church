// AN INTERPRETATION RECORD IN PLAIN WORDS: the question as a reader asks it, the readings from the record's own list
// (no register codes), what the translation did, its "Or: …" note, the translators' note on the source and the named
// readers — all from the record (the Scripture Agent's live shapes for Gen 1:1, Gen 6:2 and Deut 32:8).
import { describe, expect, it } from "vitest";
import {
  namedReaders,
  plainQuestion,
  translatorsNote,
  verseSummary,
} from "../../../apps/reader-web/src/extensions/interpretations/plain";
import type {
  InterpretationPath,
  InterpretationQuestion,
  InterpretedVerse,
} from "../../../apps/reader-web/src/extensions/interpretations";

const q = (over: Partial<InterpretationQuestion>): InterpretationQuestion =>
  ({
    id: "q",
    kind: "referent",
    text: "",
    status: "open",
    atVerse: "Gen.6.2",
    decided: null,
    candidates: [],
    writings: { consulted: [], cited: [], total: 0 },
    registerEntries: [],
    compatibility: [],
    ...over,
  }) as InterpretationQuestion;

describe("an interpretation record in plain words", () => {
  it("an open question: who is meant, the readings on the table, left open", () => {
    const p = plainQuestion(
      q({
        text: "referent of בְּנֵי הָאֱלֹהִים (v2, v4): divine beings · Seth's line · human rulers",
      })
    );
    expect(p).toEqual({
      ask: "Who is meant here?",
      term: "בְּנֵי הָאֱלֹהִים",
      readings: ["divine beings", "Seth's line", "human rulers"],
      state: "open",
      other: null,
    });
  });

  it("a decided question keeps the reading not chosen, from the translation's own note", () => {
    const p = plainQuestion(
      q({
        kind: "textual-reading",
        text: "the attested text of the unit: sons-of-israel (MT, the base) · sons-of-god (4QDeut^j, LXX) — a textual decision, never silently substituted",
        status: "decided-for-edition",
        decided: {
          footnote:
            "Some manuscripts read 'sons of God' (4QDeut^j; the Septuagint).",
        } as InterpretationQuestion["decided"],
      })
    );
    expect(p.ask).toBe("Which wording do the oldest copies have?");
    expect(p.readings).toEqual([
      "sons of israel (MT, the base)",
      "sons of god (4QDeut^j, LXX)",
    ]);
    expect(p.state).toBe("decided");
    expect(p.other).toBe(
      "Some manuscripts read 'sons of God' (4QDeut^j; the Septuagint)"
    );
    const g = plainQuestion(
      q({
        kind: "lexical-sense",
        text: "sense of רוּחַ אֱלֹהִים: spirit-of-god (referent the Spirit) · wind",
        decided: {
          footnote: "Or: a wind from God.",
        } as InterpretationQuestion["decided"],
      })
    );
    expect(g.other).toBe("a wind from God");
  });

  it("a later belief is said as one, without its register code; a real compound keeps its hyphen", () => {
    const p = plainQuestion(
      q({
        kind: "theological-inference",
        status: "unresolved-by-policy",
        text: "theological inference laid over v1: creation without pre-existing matter (register D11, attested c. AD 180) — an overlay, never a rendering",
      })
    );
    expect(p.state).toBe("belief");
    expect(p.readings).toEqual(["creation without pre-existing matter"]);
  });

  it("the translators' note without the draft's housekeeping; readers without source codes; a verse's one line", () => {
    const v = {
      status: {
        stage: "checks-passed",
        note: "Draft: every automated check passes. Not yet reviewed by a person. Note on the source: Bərēʾšît has no article.",
      },
      interpretation: {
        questions: [
          q({ decided: {} as InterpretationQuestion["decided"] }),
          q({}),
        ],
        paths: [],
      },
    } as unknown as InterpretedVerse;
    expect(translatorsNote(v)).toBe("Bərēʾšît has no article.");
    expect(verseSummary(v)).toBe("2 questions · 1 decided · 1 left open");
    expect(
      namedReaders([
        { attributedTo: "Rashi (through bx:gen-1-1-3-cl-rashi-1-1)" },
        { attributedTo: null },
        { attributedTo: "Julius Africanus (register D18)" },
      ] as InterpretationPath[])
    ).toEqual(["Rashi", "Julius Africanus"]);
  });
});
