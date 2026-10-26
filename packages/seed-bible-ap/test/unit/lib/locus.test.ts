// THE CANONICAL LOCUS: a verse's id is agenticprimitives' own (the values below were computed by its
// scripture-content-extension, so the reader's ids meet the scripture agent's corpus); every way the sources write a
// reference lands on the same locus; a chapter, a book and a range have ids of their own; and spans answer "what
// contains this verse".
import { describe, expect, it } from "vitest";
import { overlaps, parseLocus, seedRef, within } from "../../../lib/locus";

describe("canonical locus", () => {
  it("a verse's id is agenticprimitives' ap-locus-id-v1", () => {
    expect(parseLocus("John 3:16")?.id).toBe(
      "0x3e443e12ab97ffd23826594b7a412c3ede0d87179e6239a18c8a12f3f0a7e9ac"
    );
    expect(parseLocus("Gen 1:1")?.id).toBe(
      "0xc98e646bcbf0bfa06a1e099e594ba060e134eab9516a56d21ed583ee5de8bbd9"
    );
    expect(parseLocus("1John 1:1")?.id).toBe(
      "0x730c09af2bbb0859513ce37128a1c2fabc11bd2d9c092a5082fd43950f498ccd"
    );
    expect(parseLocus("Rev 22:21")?.id).toBe(
      "0x69e242f36d7c10c21d1c476e82b7d19f6f4c6fa7e2743793e051d6c69fa4dc0b"
    );
  });

  it("every way of writing a place is the same place", () => {
    const id = parseLocus("John 3:16")!.id;
    for (const r of [
      "JHN.3.16",
      "John.3.16",
      "scripture:John.3.16",
      "john 3.16",
      "JHN 3:16",
    ])
      expect(parseLocus(r)?.id, r).toBe(id);
    expect(parseLocus("JHN.3.16-JHN.3.18")?.id).toBe(
      parseLocus("John 3:16-18")!.id
    );
    expect(parseLocus("John.3.16-John.3.18")?.alias).toBe(
      "John.3.16-John.3.18"
    );
  });

  it("chapters, books and ranges have ids and spans; a one-verse range is that verse", () => {
    const ch = parseLocus("JHN.3")!;
    expect(ch).toMatchObject({
      type: "chapter",
      alias: "John.3",
      span: [43003001, 43003036],
    });
    expect(parseLocus("JHN")).toMatchObject({
      type: "book",
      alias: "John",
      span: [43001001, 43021025],
    });
    const r = parseLocus("Gen 1:1-2:3")!;
    expect(r).toMatchObject({ type: "range", span: [1001001, 1002003] });
    expect(parseLocus("John 3:16-16")?.type).toBe("verse");
    expect(
      new Set([ch.id, r.id, parseLocus("JHN")!.id, parseLocus("JHN.3.16")!.id])
        .size
    ).toBe(4);
  });

  it("spans answer containment", () => {
    const v = parseLocus("JHN.3.16")!.span;
    expect(within(v, parseLocus("JHN.3")!.span)).toBe(true);
    expect(within(v, parseLocus("JHN")!.span)).toBe(true);
    expect(within(v, parseLocus("JHN.4")!.span)).toBe(false);
    expect(overlaps(parseLocus("John 3:14-17")!.span, v)).toBe(true);
    expect(overlaps(parseLocus("John 3:17-20")!.span, v)).toBe(false);
  });

  it("refuses what is not one place in the canon", () => {
    for (const r of [
      "",
      "Hezekiah 1:1",
      "John 22:1",
      "John 3:99",
      "John 3:18-16",
      "Gen 1:1-Exod 1:1",
      "Jöhn 3:16",
    ])
      expect(parseLocus(r), r).toBeNull();
  });

  it("writes back the reader's record form", () => {
    for (const r of ["JHN", "JHN.3", "JHN.3.16", "JHN.3.16-JHN.3.18"])
      expect(seedRef(parseLocus(r)!)).toBe(r);
  });
});
