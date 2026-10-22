// WHICH OF A BUILD'S FILES THE WORKER PRECACHES — the chunks the app needs to boot (every entry and what it
// statically imports, their stylesheets and assets), plus images and fonts; never a lazily loaded locale or
// extension chunk, and never index.html (the page is rendered on the edge per request and runtime-cached instead).
// Pure functions, so precache-manifest.test.ts pins them: a wrong choice here ships quietly and the app simply
// does not open offline. Ported from the old reader's script/lib/precacheManifest.ts, without the asset-host rewrite.

/** The subset of Vite's client manifest (`.vite/manifest.json`) this reads. */
export interface ViteManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
  assets?: string[];
}

/** One entry of the manifest Workbox builds from the globbed output. */
export interface PrecacheManifestEntry {
  url: string;
  revision?: string | null;
  integrity?: string;
  size?: number;
}

export const IMAGE_OR_FONT_RE =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)$/i;

/** The 77 locale chunks (`assets/<lang>-<hash>.js`), fetched when chosen. */
export const LOCALE_CHUNK_RE = /^assets\/[a-z]{2,3}-[A-Za-z0-9_-]+\.js$/;

const ASSET_DIR_PREFIX = "assets/";

/** Files the worker must never precache: the page (rendered per request) and the worker's own files. */
const NEVER_PRECACHED =
  /^(index\.html|sw\.js|workbox-[A-Za-z0-9]+\.js|registerSW\.js)$/;

/** The files the app needs to BOOT: every entry chunk, its static imports (transitively), their css and assets. */
/**
 * Lazy chunks a reader needs offline before ever opening them online: the note editor (a note written on a device
 * that has only ever read must still open its editor without a connection). Everything else lazy is cached on use.
 */
const OFFLINE_LAZY = [/(^|\/)tiptap\/TipTapEditor\.tsx$/];

export function selectCoreAssetFiles(
  manifest: Record<string, ViteManifestChunk>
): Set<string> {
  const core = new Set<string>();
  const visited = new Set<string>();
  function visit(key: string): void {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    core.add(chunk.file);
    for (const file of chunk.css ?? []) core.add(file);
    for (const file of chunk.assets ?? []) core.add(file);
    for (const imported of chunk.imports ?? []) visit(imported);
  }
  for (const [key, chunk] of Object.entries(manifest))
    if (chunk.isEntry || OFFLINE_LAZY.some((re) => re.test(key))) visit(key);
  return core;
}

/**
 * The globbed output narrowed to this build's core: boot chunks, images and fonts (kept whether or not a chunk
 * names them — the shell's fonts come from CSS `url()`), root-served files other than the page and the worker.
 * A core file the glob never produced is a warning: the app would not boot offline with no other sign.
 */
export function selectCoreAssets(
  entries: PrecacheManifestEntry[],
  coreFiles: Set<string>
): { manifest: PrecacheManifestEntry[]; warnings: string[] } {
  const manifest: PrecacheManifestEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    seen.add(entry.url);
    if (NEVER_PRECACHED.test(entry.url)) continue;
    if (!entry.url.startsWith(ASSET_DIR_PREFIX)) {
      manifest.push(entry);
      continue;
    }
    if (coreFiles.has(entry.url)) {
      manifest.push(entry);
      continue;
    }
    if (LOCALE_CHUNK_RE.test(entry.url)) continue;
    if (IMAGE_OR_FONT_RE.test(entry.url)) manifest.push(entry);
  }
  const warnings = [...coreFiles]
    .filter((f) => f.startsWith(ASSET_DIR_PREFIX) && !seen.has(f))
    .sort()
    .map(
      (f) =>
        `Core asset "${f}" is missing from the precache manifest, so the app will not boot offline. Check injectManifest.globPatterns and maximumFileSizeToCacheInBytes in apps/reader-web/vite.config.ts.`
    );
  return { manifest, warnings };
}
