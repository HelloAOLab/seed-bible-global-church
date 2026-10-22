// WHAT THE WORKER PRECACHES (test-plan A3.7): this build's boot chunks, their css, images and fonts — never a
// lazily loaded locale chunk, never the page (rendered per request), never the worker's own files; and a boot
// chunk the glob never produced is a warning, because the app would not open offline with no other sign.
import { describe, expect, it } from "vitest";
import {
  selectCoreAssetFiles,
  selectCoreAssets,
  type PrecacheManifestEntry,
  type ViteManifestChunk,
} from "../../../apps/reader-web/src/sw/precache";

const manifest: Record<string, ViteManifestChunk> = {
  "index.html": {
    file: "assets/index-AAA.js",
    isEntry: true,
    imports: ["_vendor-BBB.js", "_i18n-CCC.js"],
    css: ["assets/index-DDD.css"],
    assets: ["assets/logo-EEE.svg"],
  },
  "_vendor-BBB.js": {
    file: "assets/vendor-BBB.js",
    imports: ["_runtime-FFF.js"],
  },
  "_runtime-FFF.js": { file: "assets/runtime-FFF.js" },
  "_i18n-CCC.js": { file: "assets/i18n-CCC.js", imports: ["_en-GGG.js"] },
  "_en-GGG.js": { file: "assets/en-GGG.js" },
  "src/i18n/fr.json": { file: "assets/fr-HHH.js" },
  "src/extensions/transcript/index.tsx": {
    file: "assets/transcript-III.js",
    css: ["assets/transcript-JJJ.css"],
  },
};

const entry = (url: string): PrecacheManifestEntry => ({ url, revision: null });

describe("selectCoreAssetFiles()", () => {
  it("follows static imports transitively from every entry", () => {
    expect([...selectCoreAssetFiles(manifest)].sort()).toEqual([
      "assets/en-GGG.js",
      "assets/i18n-CCC.js",
      "assets/index-AAA.js",
      "assets/index-DDD.css",
      "assets/logo-EEE.svg",
      "assets/runtime-FFF.js",
      "assets/vendor-BBB.js",
    ]);
  });

  it("leaves out chunks nothing statically imports", () => {
    const core = selectCoreAssetFiles(manifest);
    expect(core.has("assets/fr-HHH.js")).toBe(false);
    expect(core.has("assets/transcript-III.js")).toBe(false);
  });

  it("survives a manifest whose import points at a missing chunk, and chunks that import each other", () => {
    expect([
      ...selectCoreAssetFiles({
        a: { file: "assets/a.js", isEntry: true, imports: ["gone"] },
      }),
    ]).toEqual(["assets/a.js"]);
    const loop: Record<string, ViteManifestChunk> = {
      a: { file: "assets/a.js", isEntry: true, imports: ["b"] },
      b: { file: "assets/b.js", imports: ["a"] },
    };
    expect([...selectCoreAssetFiles(loop)].sort()).toEqual([
      "assets/a.js",
      "assets/b.js",
    ]);
  });
});

describe("selectCoreAssets()", () => {
  const core = selectCoreAssetFiles(manifest);
  const globbed = [
    "index.html",
    "sw.js",
    "workbox-e5cff4b9.js",
    "registerSW.js",
    "manifest.webmanifest",
    "apple-touch-icon.png",
    "assets/index-AAA.js",
    "assets/vendor-BBB.js",
    "assets/runtime-FFF.js",
    "assets/i18n-CCC.js",
    "assets/en-GGG.js",
    "assets/index-DDD.css",
    "assets/logo-EEE.svg",
    "assets/fr-HHH.js",
    "assets/transcript-III.js",
    "assets/transcript-JJJ.css",
    "assets/Newsreader-KKK.woff2",
  ].map(entry);

  it("keeps this build's hashed boot assets only — plus images, fonts and root files", () => {
    const { manifest: kept, warnings } = selectCoreAssets(globbed, core);
    expect(kept.map((e) => e.url).sort()).toEqual([
      "apple-touch-icon.png",
      "assets/Newsreader-KKK.woff2",
      "assets/en-GGG.js",
      "assets/i18n-CCC.js",
      "assets/index-AAA.js",
      "assets/index-DDD.css",
      "assets/logo-EEE.svg",
      "assets/runtime-FFF.js",
      "assets/vendor-BBB.js",
      "manifest.webmanifest",
    ]);
    expect(warnings).toEqual([]);
  });

  it("drops the page, the worker's own files, the lazy locale chunks and the extension chunks", () => {
    const urls = selectCoreAssets(globbed, core).manifest.map((e) => e.url);
    for (const dropped of [
      "index.html",
      "sw.js",
      "workbox-e5cff4b9.js",
      "registerSW.js",
      "assets/fr-HHH.js",
      "assets/transcript-III.js",
      "assets/transcript-JJJ.css",
    ])
      expect(urls, dropped).not.toContain(dropped);
  });

  it("carries the rest of each entry through unchanged", () => {
    const rich: PrecacheManifestEntry = {
      url: "assets/index-AAA.js",
      revision: "r1",
      integrity: "sha256-x",
      size: 10,
    };
    expect(selectCoreAssets([rich], core).manifest).toEqual([rich]);
  });

  it("warns about a core asset the glob never produced", () => {
    const { manifest: kept, warnings } = selectCoreAssets(
      globbed.filter((e) => e.url !== "assets/vendor-BBB.js"),
      core
    );
    expect(kept.map((e) => e.url)).not.toContain("assets/vendor-BBB.js");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(
      /^Core asset "assets\/vendor-BBB\.js" is missing/
    );
  });
});
