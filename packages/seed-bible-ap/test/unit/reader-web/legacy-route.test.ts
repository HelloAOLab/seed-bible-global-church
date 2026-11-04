// SEEDBIBLE.ORG'S ADDRESS IS THE ADDRESS: `/{lang}/{translation}/{book-slug}/{chapter}`. Its other link forms (a book's
// other names, a misspelling, the three-segment and query forms, `?verse=`) and this reader's earlier `/read/…` become
// that address, `?v=` for verses; the address itself, its own pages and anything else are left alone.
import { describe, expect, it } from "vitest";
import { legacyTarget } from "../../../apps/reader-web/src/state/reading/legacyRoute";
import {
  parseRoute,
  routeOf,
} from "../../../apps/reader-web/src/state/reading/route";

describe("an old reader's link", () => {
  it("the address itself is left alone; only ?verse= becomes ?v=", () => {
    expect(legacyTarget("/en/AAB/matthew/2", "")).toBeNull();
    expect(legacyTarget("/en/BSB/john/3", "?verse=16-18")).toBe(
      "/en/BSB/john/3?v=16-18"
    );
    expect(legacyTarget("/es/spa_r09/john/3", "")).toBeNull();
  });

  it("the book by another of its names, or a close misspelling", () => {
    expect(legacyTarget("/en/BSB/1-samuel/17", "")).toBeNull();
    expect(legacyTarget("/en/BSB/song-of-songs/2", "")).toBe(
      "/en/BSB/song-of-solomon/2"
    );
    expect(legacyTarget("/en/BSB/mathew/5", "")).toBe("/en/BSB/matthew/5");
    expect(legacyTarget("/fr/BSB/Genesis/1", "")).toBe("/fr/BSB/genesis/1");
  });

  it("the three-segment form and the query form", () => {
    expect(legacyTarget("/BSB/romans/8", "")).toBe("/en/BSB/romans/8");
    expect(
      legacyTarget("/", "?translation=BSB&book=genesis&chapter=12&verse=1")
    ).toBe("/en/BSB/genesis/12?v=1");
  });

  it("this reader's earlier /read/… goes to the address", () => {
    expect(legacyTarget("/read/BSB/JHN/3", "?verse=16")).toBe(
      "/en/BSB/john/3?v=16"
    );
    expect(legacyTarget("/read/BSB/JHN/3", "?v=16")).toBe(
      "/en/BSB/john/3?v=16"
    );
    expect(legacyTarget("/read/BSB/1SA/17", "")).toBe("/en/BSB/1-samuel/17");
  });

  it("leaves everything else alone", () => {
    expect(legacyTarget("/", "")).toBeNull();
    expect(legacyTarget("/shared/seedreader.me/playlist/x", "")).toBeNull();
    expect(legacyTarget("/friend/0xabc", "?name=ezra.me")).toBeNull();
    expect(legacyTarget("/en/playlist/abc/12", "")).toBeNull();
    expect(legacyTarget("/en/BSB/notabook/3", "")).toBeNull();
    expect(legacyTarget("/assets/index-abc.js", "")).toBeNull();
  });
});

describe("the address", () => {
  it("reads both forms and writes seedbible.org's, in the language it was given", () => {
    expect(parseRoute("/en/BSB/genesis/1")).toEqual({
      lang: "en",
      translationId: "BSB",
      bookId: "GEN",
      chapterNumber: 1,
    });
    expect(parseRoute("/read/BSB/GEN/1")).toEqual({
      translationId: "BSB",
      bookId: "GEN",
      chapterNumber: 1,
    });
    expect(parseRoute("/en/BSB/Genesis/1")).toBeNull();
    expect(parseRoute("/assets/x/y/1")).toBeNull();
    expect(
      routeOf({ translationId: "BSB", bookId: "1SA", chapterNumber: 17 })
    ).toBe("/en/BSB/1-samuel/17");
    expect(
      routeOf({ translationId: "BSB", bookId: "JHN", chapterNumber: 3 }, "fr")
    ).toBe("/fr/BSB/john/3");
    expect(routeOf(parseRoute("/es/spa_r09/john/3")!)).toBe(
      "/es/spa_r09/john/3"
    );
  });
});
