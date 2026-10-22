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

/** The verses a share link names: `?v=16` or `?v=16-18` → [16, 18]; null for none or nonsense. */
export function versesOf(search: string): [number, number] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(
    new URLSearchParams(search).get("v") ?? ""
  );
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return a >= 1 && b >= a ? [a, b] : null;
}

/** A link to a verse or range of the chapter, on this origin. */
export function shareUrl(
  origin: string,
  r: ChapterRoute,
  start: number,
  end = start
): string {
  return `${origin}${routeOf(r)}?v=${start === end ? start : `${start}-${end}`}`;
}

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
  // A shared page keeps its own address while it is open; closing it moves the URL to the chapter.
  if (location.pathname === path || location.pathname.startsWith("/shared/"))
    return;
  // A share link's verses belong to the chapter it named, not the next one.
  const q = new URLSearchParams(location.search);
  q.delete("v");
  const search = q.toString();
  history.pushState(null, "", path + (search ? `?${search}` : ""));
}
