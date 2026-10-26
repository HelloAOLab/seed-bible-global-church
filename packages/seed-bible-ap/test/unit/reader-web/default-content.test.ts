// DEFAULT CONTENT: the old reader's curated videos and BibleProject overviews come up for the chapters they cover,
// curated first, each BibleProject video once, and each opens only its own page.
import { describe, expect, it } from "vitest";
import {
  contentForChapter,
  urlOf,
  type BibleProjectItem,
  type CuratedItem,
} from "../../../apps/reader-web/src/extensions/defaultContent";
import curated from "../../../apps/reader-web/src/extensions/defaultContent/discoveredContent.json";
import bibleProject from "../../../apps/reader-web/src/extensions/defaultContent/bibleProject.json";

const C = curated as CuratedItem[];
const B = bibleProject as BibleProjectItem[];

describe("default content for a chapter", () => {
  it("offers the Upper Room video for Matthew 26 and its verses", () => {
    const items = contentForChapter("MAT", 26, C, B);
    const upper = items.find(
      (i) => i.id === "curated:the-last-supper-and-pentecost-here"
    );
    expect(upper).toMatchObject({
      description: "Expedition Bible · 26:20–30",
      icon: "play_circle",
    });
    expect(urlOf(upper!.id, C, B)).toBe(
      "https://www.youtube.com/watch?v=1e5paRyGr0A"
    );
  });

  it("offers BibleProject's Genesis overview for Genesis 2, once, after the curated items", () => {
    const items = contentForChapter("GEN", 2, C, B);
    const bp = items.filter((i) => i.description === "BibleProject");
    expect(bp.length).toBeGreaterThan(0);
    expect(new Set(bp.map((i) => i.id)).size).toBe(bp.length);
    const firstBp = items.findIndex((i) => i.description === "BibleProject");
    expect(
      items.slice(firstBp).every((i) => i.description === "BibleProject")
    ).toBe(true);
    expect(urlOf(bp[0]!.id, C, B)).toMatch(/^https:\/\/bibleproject\.com\//);
  });

  it("offers nothing for a book it does not cover, and opens nothing it does not know", () => {
    expect(contentForChapter("XYZ", 1, C, B)).toEqual([]);
    expect(urlOf("bibleproject:https://evil.test/", C, B)).toBeNull();
    expect(urlOf("curated:nope", C, B)).toBeNull();
  });
});
