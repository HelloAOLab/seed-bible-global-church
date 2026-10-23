// THE WORKER in front of the static assets: a chapter URL is rendered on the edge (the chapter text, title and
// description in the HTML, plus the seed the client reuses), everything else is the asset the build emitted. The
// Bible API answers are cached by the edge per their own headers; a failed render falls back to the plain app
// shell, which loads the chapter itself.
import {
  injectIntoIndex,
  injectSharedIntoIndex,
  renderChapterPage,
} from "../src/entry-server";
import {
  loadSharedPage,
  parseSharedPath,
} from "../src/state/social/sharedPage";
import { parseRoute, routeOf, versesOf } from "../src/state/reading/route";
import {
  BIBLE_API_ENDPOINT,
  FreeUseBibleAPI,
} from "../src/backend/bible";

const SITEMAP_TRANSLATIONS = ["BSB"];

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** The reader agent's origin: shared pages are read through its public lane. */
  A2A_BASE?: string;
}

/** A public shelf document's text, through the reader agent's public lane (what the browser uses too). */
async function readPublic(
  a2a: string,
  shelf: string,
  path: string
): Promise<string> {
  const res = await fetch(
    `${a2a}/api/public/read?shelf=${encodeURIComponent(shelf)}&path=${encodeURIComponent(path)}`
  );
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    text?: string;
    error?: string;
  };
  if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.text ?? "";
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
      const api = new FreeUseBibleAPI(BIBLE_API_ENDPOINT);
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
    const isNavigation =
      request.method === "GET" &&
      (request.headers.get("accept") ?? "").includes("text/html");
    const shared = parseSharedPath(url.pathname);
    if (shared && isNavigation) {
      const shell = await env.ASSETS.fetch(
        new Request(new URL("/", url).toString(), request)
      );
      if (!shell.ok) return shell;
      const indexHtml = await shell.text();
      const a2a = (env.A2A_BASE ?? "").replace(/\/$/, "");
      const page = a2a
        ? await loadSharedPage(
            (shelf, path) => readPublic(a2a, shelf, path),
            shared
          ).catch(() => null)
        : null;
      return new Response(
        page
          ? injectSharedIntoIndex(
              indexHtml,
              page,
              `${url.origin}${url.pathname}`
            )
          : indexHtml,
        {
          status: page ? 200 : 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": page ? "public, max-age=60" : "no-cache",
            "x-sb-ssr": page ? "shared" : "shell",
          },
        }
      );
    }
    const route = parseRoute(url.pathname);
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
