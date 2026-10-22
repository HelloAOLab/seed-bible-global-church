// SHARED PAGES: a /shared/ link names one released slice; it is read from the owner's public shelf (null once
// withdrawn), drawn as plain text blocks, and what someone else wrote can never become markup in the edge HTML.
import { describe, expect, it } from "vitest";
import {
  loadSharedPage,
  markdownBlocks,
  parseSharedPath,
  sharedPathOf,
  sharedRefOf,
  sharedSummary,
} from "../../../apps/reader-web/src/state/social/sharedPage";
import { injectSharedIntoIndex } from "../../../apps/reader-web/src/entry-server";
import type { Offering } from "../../../apps/reader-web/src/state/social/discover";

const INDEX = `<!doctype html><html lang="en"><head><title>Seed Bible</title></head><body><div id="root"></div></body></html>`;

function shelf(files: Record<string, string>) {
  return async (s: string, path: string) => {
    const text = files[`${s}:${path}`];
    if (text === undefined) throw new Error("not public");
    return text;
  };
}

describe("shared page links", () => {
  it("parses a shared page path and builds it back", () => {
    const ref = parseSharedPath("/shared/seedreader/playlist/playlist-abc123");
    expect(ref).toEqual({
      shelf: "seedreader",
      kind: "playlist",
      slug: "playlist-abc123",
    });
    expect(sharedPathOf(ref!)).toBe(
      "/shared/seedreader/playlist/playlist-abc123"
    );
  });

  it("refuses an unknown kind, a path escape and a chapter URL", () => {
    expect(parseSharedPath("/shared/seedreader/profile/profile")).toBeNull();
    expect(
      parseSharedPath("/shared/seedreader/note/..%2F..%2Fsecret")
    ).toBeNull();
    expect(parseSharedPath("/read/BSB/JHN/3")).toBeNull();
  });

  it("gives a Discover offering its page link from where its text lives", () => {
    const o = {
      shelf: "seedreader",
      kind: "note",
      markdownPath: "seed-bible/public/note/note-1a2b3c.md",
    } as Offering;
    expect(sharedRefOf(o)).toEqual({
      shelf: "seedreader",
      kind: "note",
      slug: "note-1a2b3c",
    });
    expect(sharedRefOf({ ...o, kind: "profile" })).toBeNull();
    expect(sharedRefOf({ ...o, markdownPath: null })).toBeNull();
  });
});

describe("loading a shared page", () => {
  const ref = {
    shelf: "seedreader",
    kind: "playlist" as const,
    slug: "playlist-x",
  };
  const work = { "@type": "seed:Playlist", label: "Lent", hasItem: [] };

  it("reads the descriptor and the text from the owner's public shelf", async () => {
    const page = await loadSharedPage(
      shelf({
        "seedreader:seed-bible/public/playlist/playlist-x.jsonld":
          JSON.stringify({
            "@id": "urn:seed:offering:0xabc:playlist:playlist-x",
            label: "Lent readings",
            offeredForPassage: "MAT.4",
            work,
          }),
        "seedreader:seed-bible/public/playlist/playlist-x.md":
          "# Lent readings\n\n- MAT.4.1-11\n- LUK.4.1-13",
      }),
      ref
    );
    expect(page).toMatchObject({
      title: "Lent readings",
      passage: "MAT.4",
      work,
      descriptorId: "urn:seed:offering:0xabc:playlist:playlist-x",
    });
    expect(sharedSummary(page!)).toBe("MAT.4.1-11 · LUK.4.1-13");
  });

  it("is null when the slice was withdrawn (neither file is public)", async () => {
    expect(await loadSharedPage(shelf({}), ref)).toBeNull();
  });

  it("falls back to the markdown's heading when the descriptor is unreadable", async () => {
    const page = await loadSharedPage(
      shelf({
        "seedreader:seed-bible/public/playlist/playlist-x.jsonld": "{not json",
        "seedreader:seed-bible/public/playlist/playlist-x.md":
          "# From the text\n\nBody",
      }),
      ref
    );
    expect(page).toMatchObject({
      title: "From the text",
      work: null,
      passage: null,
    });
  });
});

describe("drawing a shared page", () => {
  it("turns markdown into headings, lists and paragraphs, keeping link labels only", () => {
    expect(
      markdownBlocks(
        "# T\n\nOne **bold**\nline.\n\n## Day 1\n\n- [Talk](https://x.test/v)\n- JHN.3"
      )
    ).toEqual([
      { type: "heading", level: 1, text: "T" },
      { type: "paragraph", text: "One bold line." },
      { type: "heading", level: 2, text: "Day 1" },
      { type: "list", items: ["Talk", "JHN.3"] },
    ]);
  });

  it("escapes what someone else wrote in the title, preview and body", () => {
    const html = injectSharedIntoIndex(
      INDEX,
      {
        shelf: "seedreader",
        kind: "note",
        slug: "note-x",
        title: `<img src=x onerror=alert(1)>`,
        passage: "JHN.3.16",
        markdown: "# t\n\n</script><script>alert(2)</script>",
        work: null,
        descriptorId: null,
      },
      "https://seed-reader.faithnet.io/shared/seedreader/note/note-x"
    );
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain(
      '<meta property="og:url" content="https://seed-reader.faithnet.io/shared/seedreader/note/note-x"'
    );
  });
});
