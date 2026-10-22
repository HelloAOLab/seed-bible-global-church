// THE URL ↔ READING POSITION: `/read/<translation>/<book>/<chapter>` (the old reader's path, minus its base
// path). Back and forward move the reader; the reader moving pushes history.
import type { Reading } from "./reading";

export interface ChapterRoute {
  translationId: string;
  bookId: string;
  chapterNumber: number;
}

export function parseRoute(pathname: string): ChapterRoute | null {
  const m = /^\/read\/([^/]+)\/([^/]+)\/(\d+)\/?$/.exec(pathname);
  return m
    ? {
        translationId: decodeURIComponent(m[1]!),
        bookId: decodeURIComponent(m[2]!).toUpperCase(),
        chapterNumber: Number(m[3]),
      }
    : null;
}

export const routeOf = (r: ChapterRoute) =>
  `/read/${encodeURIComponent(r.translationId)}/${encodeURIComponent(r.bookId)}/${r.chapterNumber}`;

/** Wire the browser history to the reading state; returns the cleanup. */
export function bindRoute(reading: () => Reading): () => void {
  if (typeof window === "undefined") return () => {};
  const onPop = () => {
    const r = parseRoute(location.pathname);
    if (r) void reading().goTo(r.translationId, r.bookId, r.chapterNumber);
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}

export function pushRoute(r: ChapterRoute) {
  if (typeof window === "undefined") return;
  const path = routeOf(r);
  if (location.pathname !== path)
    history.pushState(null, "", path + location.search);
}
