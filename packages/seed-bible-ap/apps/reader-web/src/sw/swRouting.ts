// THE SERVICE WORKER'S ROUTING DECISIONS — which requests it answers from the app shell, and which files it may
// cache. Kept out of sw.ts and free of worker globals so a unit test can pin each rule (sw-routing.test.ts): too
// narrow and the app does not open offline; too wide and the agent's lanes (/a2a, /api) are answered from a cache.
// Ported from the old reader's standalone/swRouting.ts, less the branch-preview rules this deployment has no
// need of: one origin, one build at a time, chapter pages rendered on the edge per request.

/** Extensions that identify a request for a FILE rather than an app route. */
export const STATIC_FILE_RE =
  /\.(js|mjs|cjs|css|wasm|json|webmanifest|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|txt|xml)$/i;

/** Lanes the worker never answers: the reader's agent (ADR-0044) and the Worker's own API routes. */
export const NETWORK_ONLY_PREFIXES = ["/a2a/", "/api/", "/harness/"];

/** Static pages the build ships beside the app (public/architecture): served as themselves, never stored as the shell. */
export const STATIC_PAGE_PREFIXES = ["/architecture"];

export interface AppShellNavigationInput {
  url: URL;
  /** The request's `mode`; only "navigate" is a page load. */
  requestMode: string;
  /** The worker's own origin (`self.location.origin`). */
  origin: string;
}

/** True for a page load on this origin that is not a file and not one of the agent's lanes. */
export function isAppShellNavigation(input: AppShellNavigationInput): boolean {
  const { url, requestMode, origin } = input;
  if (requestMode !== "navigate") return false;
  if (url.origin !== origin) return false;
  if (NETWORK_ONLY_PREFIXES.some((p) => url.pathname.startsWith(p)))
    return false;
  if (STATIC_FILE_RE.test(url.pathname)) return false;
  if (
    STATIC_PAGE_PREFIXES.some(
      (p) => url.pathname === p || url.pathname.startsWith(`${p}/`)
    )
  )
    return false;
  return true;
}

/** The synthetic path every ordinary navigation's HTML is stored and read under, whatever path was asked for. */
export const APP_SHELL_CACHE_PATH = "/__app-shell";

/** The query param a customization link carries; its value partitions the shell cache. */
export const CUSTOMIZATION_QUERY_PARAM = "customization";

/**
 * One shared shell entry for every ordinary navigation (an offline open of any chapter gets the last page cached;
 * hydrate.tsx sees the URL does not match and the App renders the right chapter from its own stores), and one
 * entry per customization link, so a church's branded page never overwrites the plain shell or another church's.
 */
export function getAppShellCacheKey(origin: string, requestUrl: URL): string {
  const locator = requestUrl.searchParams.get(CUSTOMIZATION_QUERY_PARAM);
  const path = locator
    ? `${APP_SHELL_CACHE_PATH}/customization/${encodeURIComponent(locator)}`
    : APP_SHELL_CACHE_PATH;
  return new URL(path, origin).href;
}

export interface CacheableStaticAssetInput {
  url: URL;
  origin: string;
  /** The absolute prefix this build's hashed files are served from, with a trailing slash (`${origin}/` here). */
  assetBaseHref: string;
}

/**
 * True for a file request the worker may cache: this build's own hashed files under its prefix, and the handful of
 * files at the site root (the web manifest, registerSW.js). Never another origin, never an API lane.
 */
export function isCacheableStaticAsset(
  input: CacheableStaticAssetInput
): boolean {
  const { url, origin, assetBaseHref } = input;
  if (!STATIC_FILE_RE.test(url.pathname)) return false;
  if (NETWORK_ONLY_PREFIXES.some((p) => url.pathname.startsWith(p)))
    return false;
  if (url.href.startsWith(assetBaseHref)) return true;
  return url.origin === origin;
}
