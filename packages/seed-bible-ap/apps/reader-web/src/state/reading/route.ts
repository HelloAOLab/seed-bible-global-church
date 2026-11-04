// THE URL ↔ READING POSITION, as seedbible.org writes it: `/<lang>/<translation>/<book-slug>/<chapter>`
// (`/en/BSB/genesis/1`). This reader's earlier `/read/<translation>/<BOOK>/<chapter>` is still read, and the edge sends
// it to the address above. Back and forward move the reader; the reader moving pushes history.
import type { Reading } from "./reading";
import { getBookId, getBookSlug, type BookId } from "@seed/scripture/books";

export interface ChapterRoute {
  translationId: string;
  bookId: string;
  chapterNumber: number;
  /** The interface language the address names (`/fr/…`); absent on the old `/read/…` form. */
  lang?: string;
}

const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
/** The language every address is written in, as the reader's interface language (setRouteLanguage). */
let routeLanguage = "en";
export function setRouteLanguage(lang: string) {
  if (LANG.test(lang)) routeLanguage = lang;
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function parseRoute(pathname: string): ChapterRoute | null {
  const old = /^\/read\/([^/]+)\/([^/]+)\/(\d+)\/?$/.exec(pathname);
  if (old)
    return {
      translationId: decode(old[1]!),
      bookId: decode(old[2]!).toUpperCase(),
      chapterNumber: Number(old[3]),
    };
  const m = /^\/([^/]+)\/([^/]+)\/([^/]+)\/([1-9]\d{0,2})\/?$/.exec(pathname);
  if (!m || !LANG.test(m[1]!)) return null;
  // Only the book's own slug ("genesis", "1-samuel") is this address; a name or a misspelling is an old link, turned
  // into this form by legacyRoute.
  const slug = decode(m[3]!);
  const bookId = getBookId(slug);
  if (!bookId || getBookSlug(bookId) !== slug) return null;
  return {
    lang: m[1]!,
    translationId: decode(m[2]!),
    bookId,
    chapterNumber: Number(m[4]),
  };
}

export const routeOf = (
  r: ChapterRoute,
  lang: string = r.lang ?? routeLanguage
) =>
  `/${lang}/${encodeURIComponent(r.translationId)}/${getBookSlug(r.bookId as BookId)}/${r.chapterNumber}`;

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
