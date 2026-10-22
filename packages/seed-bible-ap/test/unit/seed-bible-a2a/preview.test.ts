// The serving plane's link preview: Open Graph first, Twitter card and <title> as fallbacks, images made absolute,
// a cap on the bytes read, and a bare preview for anything that is not an http(s) page.
import { describe, expect, it } from "vitest";
import {
  fetchPreview,
  parsePreview,
} from "../../../apps/seed-bible-a2a/src/preview";

describe("link previews", () => {
  it("reads Open Graph, falling back to the title and description tags", () => {
    const html = `<html><head><title>Fallback &amp; title</title>
      <meta property="og:title" content="The Gospel of John — a study">
      <meta name="description" content="plain description">
      <meta property="og:image" content="/img/cover.jpg">
      <meta property="og:site_name" content="Example Studies"></head><body>…</body></html>`;
    expect(parsePreview(html, "https://example.org/study/john")).toEqual({
      url: "https://example.org/study/john",
      title: "The Gospel of John — a study",
      description: "plain description",
      image: "https://example.org/img/cover.jpg",
      siteName: "Example Studies",
    });
    expect(
      parsePreview("<title>Just a title</title>", "https://x.test/")
    ).toEqual({ url: "https://x.test/", title: "Just a title" });
  });

  it("fetches only html, within the cap, and gives a bare preview otherwise", async () => {
    const big = "<title>Big</title>" + "x".repeat(2_000_000);
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes("big"))
        return new Response(big, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      if (u.includes("json"))
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      return new Response("nope", { status: 404 });
    }) as typeof fetch;
    const p = await fetchPreview("https://site.test/big", fetchImpl);
    expect(p.title).toBe("Big");
    expect(await fetchPreview("https://site.test/json", fetchImpl)).toEqual({
      url: "https://site.test/json",
    });
    expect(await fetchPreview("ftp://site.test/x", fetchImpl)).toEqual({
      url: "ftp://site.test/x",
    });
    expect(await fetchPreview("https://site.test/missing", fetchImpl)).toEqual({
      url: "https://site.test/missing",
    });
  });
});
