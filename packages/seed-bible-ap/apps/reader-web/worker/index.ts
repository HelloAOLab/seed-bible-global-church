// THE WORKER in front of the static assets: a chapter URL is rendered on the edge (the chapter text, title and
// description in the HTML, plus the seed the client reuses), everything else is the asset the build emitted. The
// Bible API answers are cached by the edge per their own headers; a failed render falls back to the plain app
// shell, which loads the chapter itself.
import { injectIntoIndex, renderChapterPage } from "../src/entry-server";
import { parseRoute, routeOf, versesOf } from "../src/state/reading/route";
import {
  FREE_USE_BIBLE_API_ENDPOINT,
  FreeUseBibleAPI,
} from "../src/backend/bible";

const SITEMAP_TRANSLATIONS = ["BSB"];

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/robots.txt")
      return new Response(
        `User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`,
        { headers: { "content-type": "text/plain" } }
      );
    if (url.pathname === "/sitemap.xml") {
      const cache = (globalThis as unknown as { caches?: { default: Cache } })
        .caches?.default;
      const hit = await cache?.match(request);
      if (hit) return hit;
      const api = new FreeUseBibleAPI(FREE_USE_BIBLE_API_ENDPOINT);
      const urls: string[] = [`${url.origin}/`];
      for (const t of SITEMAP_TRANSLATIONS) {
        const books = await api.getTranslationBooks(t).catch(() => null);
        for (const b of books?.books ?? [])
          for (let c = 1; c <= b.numberOfChapters; c++)
            urls.push(
              `${url.origin}${routeOf({ translationId: t, bookId: b.id, chapterNumber: c })}`
            );
      }
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`;
      const res = new Response(xml, {
        headers: {
          "content-type": "application/xml",
          "cache-control": "public, max-age=86400",
        },
      });
      void cache?.put(request, res.clone());
      return res;
    }
    const route = parseRoute(url.pathname);
    const isNavigation =
      request.method === "GET" &&
      (request.headers.get("accept") ?? "").includes("text/html");
    if (!route || !isNavigation) return env.ASSETS.fetch(request);

    const shell = await env.ASSETS.fetch(
      new Request(new URL("/", url).toString(), request)
    );
    if (!shell.ok) return shell;
    const indexHtml = await shell.text();
    const page = await renderChapterPage(
      route,
      undefined,
      versesOf(url.search)
    );
    const body = page
      ? injectIntoIndex(
          indexHtml,
          page,
          `${url.origin}${url.pathname}${versesOf(url.search) ? url.search : ""}`
        )
      : indexHtml;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": page
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "no-cache",
        "x-sb-ssr": page ? "chapter" : "shell",
      },
    });
  },
};
