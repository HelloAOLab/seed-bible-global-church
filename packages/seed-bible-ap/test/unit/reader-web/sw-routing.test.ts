// WHICH REQUESTS THE WORKER ANSWERS (test-plan A3.7, the old swRouting.test.ts case names): page loads on this
// origin get the app shell and nothing else does; only this build's own files are cached; the agent's lanes are
// never touched; the shell cache is one shared entry, partitioned by customization link.
import { describe, expect, it } from "vitest";
import {
  getAppShellCacheKey,
  isAppShellNavigation,
  isCacheableStaticAsset,
} from "../../../apps/reader-web/src/sw/swRouting";

const ORIGIN = "https://seed-reader.faithnet.io";
const ASSET_BASE_HREF = `${ORIGIN}/`;

const navigation = (href: string, requestMode = "navigate") =>
  isAppShellNavigation({ url: new URL(href), requestMode, origin: ORIGIN });
const cacheable = (href: string) =>
  isCacheableStaticAsset({
    url: new URL(href),
    origin: ORIGIN,
    assetBaseHref: ASSET_BASE_HREF,
  });

describe("isAppShellNavigation()", () => {
  it("answers page loads on this origin", () => {
    expect(navigation(`${ORIGIN}/`)).toBe(true);
    expect(navigation(`${ORIGIN}/read/BSB/JHN/3`)).toBe(true);
    expect(navigation(`${ORIGIN}/read/BSB/JHN/3?v=16-18`)).toBe(true);
    expect(navigation(`${ORIGIN}/?embed=minimal&theme=dark`)).toBe(true);
  });

  it("leaves the architecture pages to the network", () => {
    expect(navigation(`${ORIGIN}/architecture`)).toBe(false);
    expect(navigation(`${ORIGIN}/architecture/`)).toBe(false);
    expect(navigation(`${ORIGIN}/architecture/ontology/`)).toBe(false);
    expect(navigation(`${ORIGIN}/architectures`)).toBe(true);
  });

  it("ignores anything that isn't a navigation", () => {
    expect(navigation(`${ORIGIN}/read/BSB/JHN/3`, "cors")).toBe(false);
    expect(navigation(`${ORIGIN}/read/BSB/JHN/3`, "no-cors")).toBe(false);
    expect(navigation(`${ORIGIN}/read/BSB/JHN/3`, "same-origin")).toBe(false);
  });

  it("ignores other origins", () => {
    expect(navigation("https://www.faithnet.me/")).toBe(false);
    expect(navigation("https://seed-bible-a2a.faithnet.io/")).toBe(false);
    expect(navigation("https://bible.helloao.org/")).toBe(false);
  });

  it("stays out of the agent's lanes", () => {
    expect(navigation(`${ORIGIN}/a2a/hello`)).toBe(false);
    expect(navigation(`${ORIGIN}/api/tiles-info`)).toBe(false);
    expect(navigation(`${ORIGIN}/harness/ask`)).toBe(false);
  });

  it("does not claim navigations that point at a file", () => {
    expect(navigation(`${ORIGIN}/manifest.webmanifest`)).toBe(false);
    expect(navigation(`${ORIGIN}/robots.txt`)).toBe(false);
    expect(navigation(`${ORIGIN}/sitemap.xml`)).toBe(false);
    expect(navigation(`${ORIGIN}/assets/index-AAA.js`)).toBe(false);
  });

  it("is not fooled by an extension appearing in the query string", () => {
    expect(navigation(`${ORIGIN}/?q=data.json`)).toBe(true);
  });
});

describe("isCacheableStaticAsset()", () => {
  it("caches this build's own hashed assets", () => {
    expect(cacheable(`${ASSET_BASE_HREF}assets/index-AAA.js`)).toBe(true);
    expect(cacheable(`${ASSET_BASE_HREF}assets/index-DDD.css`)).toBe(true);
    expect(cacheable(`${ASSET_BASE_HREF}assets/fr-JJJ.js`)).toBe(true);
    expect(cacheable(`${ASSET_BASE_HREF}assets/Newsreader-JJJ.woff2`)).toBe(
      true
    );
  });

  it("caches the files served from the site root", () => {
    expect(cacheable(`${ORIGIN}/manifest.webmanifest`)).toBe(true);
    expect(cacheable(`${ORIGIN}/registerSW.js`)).toBe(true);
    expect(cacheable(`${ORIGIN}/apple-touch-icon.png`)).toBe(true);
  });

  it("refuses requests that aren't for a file", () => {
    expect(cacheable(`${ORIGIN}/`)).toBe(false);
    expect(cacheable(`${ORIGIN}/read/BSB/JHN/3`)).toBe(false);
  });

  it("refuses the agent's lanes even when they look like files", () => {
    expect(cacheable(`${ORIGIN}/a2a/dev/readers.json`)).toBe(false);
    expect(cacheable(`${ORIGIN}/api/places/jerusalem.json`)).toBe(false);
    expect(cacheable(`${ORIGIN}/api/tiles/3/4/5.mvt`)).toBe(false);
  });

  it("refuses a third-party origin", () => {
    expect(cacheable("https://bible.helloao.org/api/BSB/books.json")).toBe(
      false
    );
    expect(cacheable("https://fonts.gstatic.com/s/newsreader/font.woff2")).toBe(
      false
    );
    expect(cacheable("https://seed-bible-a2a.faithnet.io/files/x/y.png")).toBe(
      false
    );
  });

  it("refuses another build's assets when the asset prefix names one", () => {
    const prefixed = (href: string) =>
      isCacheableStaticAsset({
        url: new URL(href),
        origin: ORIGIN,
        assetBaseHref: "https://assets.example/builds/abc123/",
      });
    expect(
      prefixed("https://assets.example/builds/abc123/assets/index-AAA.js")
    ).toBe(true);
    expect(
      prefixed("https://assets.example/builds/old999/assets/index-YYY.js")
    ).toBe(false);
  });
});

describe("getAppShellCacheKey()", () => {
  const keyFor = (href: string) => getAppShellCacheKey(ORIGIN, new URL(href));

  it("keys an ordinary navigation under a fixed synthetic path, scoped to the origin", () => {
    expect(keyFor(`${ORIGIN}/`)).toBe(`${ORIGIN}/__app-shell`);
    expect(keyFor(`${ORIGIN}/read/BSB/JHN/3`)).toBe(`${ORIGIN}/__app-shell`);
    expect(keyFor(`${ORIGIN}/read/BSB/JHN/3?v=16`)).toBe(
      `${ORIGIN}/__app-shell`
    );
  });

  it("scopes the key to the given origin", () => {
    expect(keyFor(`${ORIGIN}/`)).not.toBe(
      getAppShellCacheKey("https://alpha.faithnet.io", new URL(`${ORIGIN}/`))
    );
  });

  it("keys a customization link separately from the plain shell, one key per locator", () => {
    const a = keyFor(`${ORIGIN}/read/BSB/JHN/3?customization=grace-church`);
    expect(a).not.toBe(`${ORIGIN}/__app-shell`);
    expect(a).toBe(
      keyFor(`${ORIGIN}/read/BSB/MAT/5?customization=grace-church`)
    );
    expect(a).not.toBe(keyFor(`${ORIGIN}/?customization=other-church`));
  });
});
