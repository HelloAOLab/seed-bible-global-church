/// <reference lib="webworker" />
// THE SERVICE WORKER — hand-written (vite-plugin-pwa `injectManifest`; the build replaces `self.__WB_MANIFEST`
// with this build's core files, chosen by precache.ts). What it does, in short:
//
//   | What                                        | Strategy                                                   |
//   | core assets (entry, vendor, css, fonts)     | precache at install                                        |
//   | page HTML (a navigation on this origin)     | StaleWhileRevalidate, ONE shared entry (per customization) |
//   | other files of this build (locale chunks…)  | CacheFirst                                                 |
//   | the Bible API                               | StaleWhileRevalidate                                       |
//   | Google Fonts stylesheets / files            | StaleWhileRevalidate / CacheFirst                          |
//   | /a2a, /api, /harness (the agent's lanes)    | not handled — straight to the network                     |
//
// Chapter pages are rendered on the edge per request, so the HTML is never precached: the last page seen is the
// shell an offline open gets, and hydrate.tsx declines it for a different URL while the App renders the chapter
// from the device's own stores. Ported from the old reader's standalone/sw.ts.
import { clientsClaim } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import {
  getAppShellCacheKey,
  isAppShellNavigation,
  isCacheableStaticAsset,
} from "./swRouting";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

const DAY_SECONDS = 60 * 60 * 24;
const HTML_CACHE = "sb-html";
const MAX_HTML_CACHE_ENTRIES = 25;
const ASSET_CACHE = "sb-assets";
const BIBLE_CACHE = "sb-bible-api";
const FONT_STYLESHEET_CACHE = "sb-font-stylesheets";
const FONT_FILE_CACHE = "sb-font-files";
const ASSET_BASE_HREF = new URL("/", self.location.href).href;
const BIBLE_API_ORIGINS = ["https://bible.helloao.org"];
const FONT_STYLESHEET_ORIGINS = ["https://fonts.googleapis.com"];
const FONT_FILE_ORIGINS = ["https://fonts.gstatic.com"];

const appShellCacheKeyPlugin = {
  cacheKeyWillBeUsed: async ({ request }: { request: Request }) =>
    getAppShellCacheKey(self.location.origin, new URL(request.url)),
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/** The shell once at install, from the page registering this worker, so the app survives being closed offline after ONE visit. */
async function warmAppShellCache(): Promise<boolean> {
  try {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const url =
      clients.find((c) =>
        isAppShellNavigation({
          url: new URL(c.url),
          requestMode: "navigate",
          origin: self.location.origin,
        })
      )?.url ?? "/";
    const response = await fetch(url, { cache: "no-cache" });
    if (response.status !== 200) return false;
    const cache = await caches.open(HTML_CACHE);
    const key = getAppShellCacheKey(
      self.location.origin,
      new URL(url, self.location.origin)
    );
    // Copied so the `redirected` flag is dropped: a redirected response served to a navigation is a browser error.
    await cache.put(key, new Response(response.body, response));
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    warmAppShellCache().then((warmed) => {
      // Take over only once this build's own shell is cached; else the previous worker, whose shell and precache
      // agree, stays in control until a later install succeeds.
      if (warmed) void self.skipWaiting();
    })
  );
});

registerRoute(
  ({ url, request }) =>
    isAppShellNavigation({
      url,
      requestMode: request.mode,
      origin: self.location.origin,
    }),
  new StaleWhileRevalidate({
    cacheName: HTML_CACHE,
    plugins: [
      appShellCacheKeyPlugin,
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: MAX_HTML_CACHE_ENTRIES,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

registerRoute(
  ({ url }) =>
    isCacheableStaticAsset({
      url,
      origin: self.location.origin,
      assetBaseHref: ASSET_BASE_HREF,
    }),
  new CacheFirst({
    cacheName: ASSET_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

registerRoute(
  ({ url }) =>
    BIBLE_API_ORIGINS.includes(url.origin) && url.pathname.startsWith("/api/"),
  new StaleWhileRevalidate({
    cacheName: BIBLE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 400,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => FONT_STYLESHEET_ORIGINS.includes(url.origin),
  new StaleWhileRevalidate({
    cacheName: FONT_STYLESHEET_CACHE,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

registerRoute(
  ({ url }) => FONT_FILE_ORIGINS.includes(url.origin),
  new CacheFirst({
    cacheName: FONT_FILE_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 365 * DAY_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

clientsClaim();
