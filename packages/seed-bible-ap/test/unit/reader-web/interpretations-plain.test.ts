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
      reads: null,
      credit: null,
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
    expect(p.ask).toBe("Which words are original?");
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
    expect(verseSummary(v)).toBe("2 questions · 1 decided · 1 not yet decided");
    expect(
      namedReaders([
        { attributedTo: "Rashi (through bx:gen-1-1-3-cl-rashi-1-1)" },
        { attributedTo: null },
        { attributedTo: "Julius Africanus (register D18)" },
      ] as InterpretationPath[])
    ).toEqual(["Rashi", "Julius Africanus"]);
  });
});

// THE NEW TESTAMENT RECORDS (2026-10-26): what the published English reads is an OBSERVATION, never a decision — said as
// "this translation reads it as", with how it was read; a textual question follows the base text by policy, its readings
// with the editions that print them; the notes' source is credited (Philemon 1:6's live shapes).
describe("New Testament records in plain words", () => {
  const observed = (
    over: Partial<NonNullable<InterpretationQuestion["observed"]>>
  ) => ({
    candidate: "k1",
    reading: "that Philemon shares the same faith in Christ as Paul and others",
    method: "judge",
    how: "read by a model (Claude Haiku 5.5) from the English alone, in the candidates' terms",
    reason: "…",
    ...over,
  });
  it("an undecided question: how the words relate, the Greek, the readings, and what the English reads — not a decision", () => {
    const p = plainQuestion(
      q({
        kind: "grammatical-relation",
        status: "open",
        text: "How the words relate — ἡ κοινωνία τῆς πίστεώς σου: that Philemon shares the same faith in Christ as Paul and others · that Philemon is a partner with Paul and others in working for Christ",
        observed: observed({}),
        writings: {
          consulted: [
            { attribution: "unfoldingWord® Translation Notes, CC BY-SA 4.0" },
          ],
          cited: [],
          total: 1,
        } as unknown as InterpretationQuestion["writings"],
      })
    );
    expect(p.ask).toBe("How do the words relate?");
    expect(p.term).toBe("ἡ κοινωνία τῆς πίστεώς σου");
    expect(p.readings).toHaveLength(2);
    expect(p.state).toBe("open");
    expect(p.reads).toEqual({
      reading:
        "that Philemon shares the same faith in Christ as Paul and others",
      open: false,
      how: "read by a model (Claude Haiku 5.5) from the English alone, in the candidates' terms",
    });
    expect(p.credit).toBe("unfoldingWord® Translation Notes, CC BY-SA 4.0");
    expect(
      plainQuestion(q({ observed: observed({ candidate: "both" }) })).reads
    ).toMatchObject({ open: true, reading: null });
    expect(
      plainQuestion(q({ observed: observed({ candidate: "unknown" }) })).reads
    ).toBeNull();
  });

  it("a textual question follows the base text by policy, its readings with the editions that print them", () => {
    const p = plainQuestion(
      q({
        kind: "textual-reading",
        status: "unresolved-by-policy",
        text: "Which words are original — the words at 15: ἡμῖν · ὑμῖν",
        decided: {
          candidate: "k-base",
          policyUse: "textual-basis",
          footnote: null,
        } as unknown as InterpretationQuestion["decided"],
        candidates: [
          {
            id: "k-base",
            reading: "ἡμῖν",
            editions: [
              "NE1904",
              "NA28",
              "NA27",
              "SBL",
              "Tyn",
              "WH",
              "Treg",
              "Byz",
            ],
          },
          { id: "k-alt-1", reading: "ὑμῖν", editions: ["TR"] },
        ] as unknown as InterpretationQuestion["candidates"],
        observed: observed({
          candidate: "k-base",
          reading: "ἡμῖν",
          method: "base-text",
          how: "the edition translates its declared base text",
          reason: "the edition translates its declared base text (Nestle 1904)",
        }),
      })
    );
    expect(p.ask).toBe("Which words are original?");
    expect(p.state).toBe("policy");
    expect(p.readings).toEqual([
      "ἡμῖν — in Nestle-Aland 28 and 7 other editions",
      "ὑμῖν — in the Textus Receptus (the King James Version's Greek)",
    ]);
    expect(p.reads).toEqual({
      reading: "ἡμῖν",
      open: false,
      how: "the edition translates its declared base text (Nestle 1904)",
    });
  });
});

// A New Testament record leaves out the lists the pilot's records carry (story paths, register entries, compatibility,
// cited writings) — the pane crashed on it (2026-10-26, Philemon 1:6). Normalized, every list is there and empty.
describe("a record with lists left out", () => {
  it("is read with those lists empty, not missing", async () => {
    const { normalizeChapter } =
      await import("../../../apps/reader-web/src/extensions/interpretations");
    const out = normalizeChapter({
      edition: "rbs",
      book: "PHM",
      chapter: 1,
      count: 1,
      verses: [
        {
          osis: "Phlm.1.6",
          verse: 6,
          interpretation: {
            questions: [
              {
                id: "q",
                kind: "grammatical-relation",
                text: "",
                candidates: [{ id: "k1", reading: "a" }],
                writings: { consulted: [{ work: "uW" }] },
              },
            ],
          },
        },
      ],
    } as never);
    const v = out.verses[0]!;
    expect(v.interpretation.paths).toEqual([]);
    const q = v.interpretation.questions[0]!;
    expect(q.registerEntries).toEqual([]);
    expect(q.compatibility).toEqual([]);
    expect(q.writings).toMatchObject({ cited: [], total: 1 });
    expect(q.candidates[0]).toMatchObject({ role: "", origin: "" });
  });
});
