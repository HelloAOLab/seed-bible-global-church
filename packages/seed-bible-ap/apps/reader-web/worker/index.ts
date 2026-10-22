// THE WORKER in front of the static assets: a chapter URL is rendered on the edge (the chapter text, title and
// description in the HTML, plus the seed the client reuses), everything else is the asset the build emitted. The
// Bible API answers are cached by the edge per their own headers; a failed render falls back to the plain app
// shell, which loads the chapter itself.
import { injectIntoIndex, renderChapterPage } from "../src/entry-server";
import { parseRoute } from "../src/state/reading/route";

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
    const page = await renderChapterPage(route);
    const body = page ? injectIntoIndex(indexHtml, page) : indexHtml;
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
