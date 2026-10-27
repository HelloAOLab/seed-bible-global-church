import { describe, expect, it } from "vitest";
import { companionTarget } from "../../../apps/reader-a2a/src/routes/companion";

describe("the study companion's target", () => {
  it("asks about the selected verses (at most five) in the reader's translation", () => {
    expect(
      companionTarget({
        translationId: "rbs",
        bookId: "JHN",
        chapter: 2,
        verses: [4],
      })
    ).toEqual({ edition: "rbs", editionNote: null, reference: "John.2.4" });
    expect(
      companionTarget({
        translationId: "rbs",
        bookId: "JHN",
        chapter: 2,
        verses: [9, 1, 3],
      })?.reference
    ).toBe("John.2.1-5");
  });
  it("falls back to the chapter's first verse, and to the BSB for a translation the agent does not hold, saying so", () => {
    const t = companionTarget({
      translationId: "eng_niv",
      bookId: "GEN",
      chapter: 6,
      verses: [],
    });
    expect(t).toMatchObject({ edition: "bsb", reference: "Gen.6.1" });
    expect(t?.editionNote).toMatch(/BSB/);
  });
  it("refuses a place that is not in the canon", () => {
    expect(
      companionTarget({
        translationId: "rbs",
        bookId: "XYZ",
        chapter: 1,
        verses: [1],
      })
    ).toBeNull();
  });
});
