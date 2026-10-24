// SEEDBIBLE.ORG LINKS OPEN HERE: the old reader's reading paths, its query form and `?verse=` become this reader's
// `/read/{translation}/{BOOK}/{chapter}?v=`; its own pages and anything else are left alone.
import { describe, expect, it } from "vitest";
import { legacyTarget } from "../../../apps/reader-web/src/state/reading/legacyRoute";

describe("an old reader's link", () => {
  it("/{lang}/{translation}/{book}/{chapter}, with ?verse=", () => {
    expect(legacyTarget("/en/AAB/matthew/2", "")).toBe("/read/AAB/MAT/2");
    expect(legacyTarget("/en/BSB/john/3", "?verse=16-18")).toBe(
      "/read/BSB/JHN/3?v=16-18"
    );
    expect(legacyTarget("/es/spa_r09/john/3", "")).toBe(
      "/read/spa_r09/JHN/3?lang=es"
    );
  });

  it("the book by its slug, another of its names, or a close misspelling", () => {
    expect(legacyTarget("/en/BSB/1-samuel/17", "")).toBe("/read/BSB/1SA/17");
    expect(legacyTarget("/en/BSB/song-of-songs/2", "")).toBe("/read/BSB/SNG/2");
    expect(legacyTarget("/en/BSB/mathew/5", "")).toBe("/read/BSB/MAT/5");
  });

  it("the three-segment form and the query form", () => {
    expect(legacyTarget("/BSB/romans/8", "")).toBe("/read/BSB/ROM/8");
    expect(
      legacyTarget("/", "?translation=BSB&book=genesis&chapter=12&verse=1")
    ).toBe("/read/BSB/GEN/12?v=1");
  });

  it("this reader's own path keeps its place; only ?verse= becomes ?v=", () => {
    expect(legacyTarget("/read/BSB/JHN/3", "?verse=16")).toBe(
      "/read/BSB/JHN/3?v=16"
    );
    expect(legacyTarget("/read/BSB/JHN/3", "?v=16")).toBeNull();
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
