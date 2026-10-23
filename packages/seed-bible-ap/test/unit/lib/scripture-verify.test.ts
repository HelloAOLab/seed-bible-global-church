// CHECKING SCRIPTURE ON THE DEVICE, against real chapters from the scripture content service (public-domain
// translations: BSB John 3 and Matthew 5 — words of Jesus, footnotes; WEB Psalm 23 — poetry; KJV Genesis 1 — paragraph
// marks). Every verse verifies with the reader's own copy of the verse-text rule, which is what holds that copy to the
// service's. A changed word, a forged root, a repeated verse number, an attestation for another agent or translation,
// and a signature that is not the delegate's are each caught for what they are.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkAttestation,
  checkChapterText,
  type ChapterProofs,
  type ChapterVerification,
  type TranslationVerification,
} from "../../../lib/scripture/verify";

const AGENT = "0x3064d88922223881b206dcab68b992b9b2ba90b2";
const fx = <T>(name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../fixtures/scripture/${name}`, import.meta.url)
      ),
      "utf8"
    )
  ) as T;
type Chapter = {
  chapter: {
    content: Array<{ type: string; number?: number; content?: never[] }>;
  };
  verification: ChapterVerification;
};
const load = (name: string) => ({
  ch: fx<Chapter>(`${name}.json`),
  proofs: fx<ChapterProofs>(`${name}.proofs.json`),
});

describe("every verse of a served chapter checks out", () => {
  for (const name of [
    "BSB-JHN-3",
    "BSB-MAT-5",
    "ENGWEBP-PSA-23",
    "eng_kjv-GEN-1",
  ]) {
    it(name, () => {
      const { ch, proofs } = load(name);
      const out = checkChapterText(ch.chapter.content, ch.verification, proofs);
      expect(Object.keys(out).length).toBeGreaterThan(5);
      expect(new Set(Object.values(out))).toEqual(new Set(["verified"]));
    });
  }
});

describe("what is caught", () => {
  it("a changed word, a forged root, a verse with no commitment, a repeated number", () => {
    const { ch, proofs } = load("BSB-JHN-3");
    const content = structuredClone(ch.chapter.content) as Array<{
      type: string;
      number?: number;
      content?: unknown[];
    }>;
    content.find((x) => x.type === "verse" && x.number === 16)!.content = [
      "For God so loved the world that He sold His one and only Son.",
    ];
    const v1 = content.find((x) => x.type === "verse" && x.number === 1)!;
    content.push({ ...v1, content: ["The same number, again."] });
    const changed = checkChapterText(content as never, ch.verification, proofs);
    expect(changed["16"]).toBe("text-differs");
    expect(changed["15"]).toBe("verified");
    expect(changed["1"]).toBe("verified");
    expect(changed["1@2"]).toBe("repeated-number");

    const forged = checkChapterText(
      ch.chapter.content,
      { ...ch.verification, corpusRoot: `0x${"1".repeat(64)}` },
      { ...proofs, corpusRoot: `0x${"1".repeat(64)}` }
    );
    expect(forged["16"]).toBe("not-in-corpus");

    const { ["17"]: _gone, ...fewer } = ch.verification.verses;
    const missing = checkChapterText(
      ch.chapter.content,
      { ...ch.verification, verses: fewer },
      proofs
    );
    expect(missing["17"]).toBe("no-commitment");
  });
});

describe("the translation's attestation", () => {
  const v = () => fx<TranslationVerification>("BSB.verification.json");
  const root = () => load("BSB-JHN-3").ch.verification.corpusRoot;

  it("is the expected agent's, through its delegate, over this root", async () => {
    const out = await checkAttestation(v(), {
      agentSa: AGENT,
      translationId: "BSB",
      corpusRoot: root(),
    });
    expect(out).toMatchObject({ ok: true });
  });

  it("is refused for another agent, another translation, another root, or a changed credential", async () => {
    const expected = {
      agentSa: AGENT,
      translationId: "BSB",
      corpusRoot: root(),
    };
    expect(
      await checkAttestation(v(), {
        ...expected,
        agentSa: `0x${"2".repeat(40)}`,
      })
    ).toMatchObject({ ok: false, reason: "not signed for the expected agent" });
    expect(
      await checkAttestation(v(), { ...expected, translationId: "KJV" })
    ).toMatchObject({ ok: false });
    expect(
      await checkAttestation(v(), {
        ...expected,
        corpusRoot: `0x${"3".repeat(64)}`,
      })
    ).toMatchObject({ ok: false });
    const changed = v();
    (changed.attestation.credentialSubject as Record<string, unknown>)[
      "leafCount"
    ] = 1;
    expect(await checkAttestation(changed, expected)).toMatchObject({
      ok: false,
    });
  });
});
