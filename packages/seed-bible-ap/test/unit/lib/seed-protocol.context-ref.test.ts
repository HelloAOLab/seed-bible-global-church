import { describe, expect, it } from "vitest";
import { chapterOf, isOsisRef, passageContextRef } from "@seed/seed-protocol";

describe("passageContextRef", () => {
  it("builds a scr:Passage ref for a verse, a chapter, and a range", () => {
    expect(passageContextRef("JHN.3.16")).toEqual({
      kind: "scr:Passage",
      id: "JHN.3.16",
    });
    expect(passageContextRef(" JHN.3 ")).toEqual({
      kind: "scr:Passage",
      id: "JHN.3",
    });
    expect(passageContextRef("1JN.1.1-1JN.1.4").id).toBe("1JN.1.1-1JN.1.4");
  });

  it("refuses anything that is not OSIS-shaped", () => {
    for (const bad of [
      "John 3:16",
      "",
      "JHN.3.16-",
      "jhn.3",
      "JHN.3.16-JHN.3.18-JHN.4.1",
    ]) {
      expect(isOsisRef(bad)).toBe(false);
      expect(() => passageContextRef(bad)).toThrow(/not an OSIS reference/);
    }
  });

  it("answers the chapter a reference belongs to", () => {
    expect(chapterOf("JHN.3.16")).toBe("JHN.3");
    expect(chapterOf("JHN.3")).toBe("JHN.3");
    expect(chapterOf("JHN.3.16-JHN.4.2")).toBe("JHN.3");
  });
});
