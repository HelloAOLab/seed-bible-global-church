import { describe, expect, it } from "vitest";
import {
  companionParts,
  companionPerspective,
  companionTarget,
} from "../../../apps/reader-a2a/src/routes/companion";

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

describe('the reader\'s tradition ("Reading from") reaches the scripture agent', () => {
  const target = { edition: "rbs", reference: "John.3.16" };
  it("rides as a skill arg on the streamed ask-verse call, and inside `context` on the writings ask", () => {
    const fast = companionParts(
      { perspective: "Reformed", role: "growing" },
      target,
      "What does this say about faith?",
      []
    );
    expect(fast[0]!.data).toMatchObject({
      skill: "ask-verse",
      args: { perspective: "Reformed", role: "growing" },
    });
    const slow = companionParts(
      { perspective: " Eastern Orthodox ", mode: "writings" },
      target,
      "What does this say about faith?",
      [{ role: "user", text: "earlier" }]
    );
    expect(slow[1]!.data).toMatchObject({
      mode: "writings",
      context: { role: "growing", perspective: "Eastern Orthodox" },
    });
  });
  it("sends no perspective when none is chosen — the answer stays with Scripture and the early church", () => {
    expect(companionPerspective({ perspective: "" })).toBeUndefined();
    expect(companionPerspective({})).toBeUndefined();
    const fast = companionParts({}, target, "q", []);
    expect((fast[0]!.data as { args: object }).args).not.toHaveProperty(
      "perspective"
    );
    const slow = companionParts({ mode: "writings" }, target, "q", []);
    expect((slow[1]!.data as { context: object }).context).not.toHaveProperty(
      "perspective"
    );
  });
  it("holds the perspective to a short plain string", () => {
    expect(companionPerspective({ perspective: "x".repeat(200) })).toHaveLength(
      80
    );
  });
});
