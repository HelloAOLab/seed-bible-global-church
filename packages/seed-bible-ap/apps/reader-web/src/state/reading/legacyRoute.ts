// LINKS THAT ARE NOT YET THE ADDRESS (route.ts writes seedbible.org's `/{lang}/{translation}/{book-slug}/{chapter}`):
// the old reader's `/{lang}/{translation}/{any book name}/{chapter}`, the same without the language,
// `?translation=&book=&chapter=`, `?verse=16-18`, and this reader's earlier `/read/{translation}/{BOOK}/{chapter}` —
// each turned into the address, `?v=16-18` for its verses — the book named by its slug ("1-samuel"), any of its names,
// or a close misspelling, as the old reader allowed. The edge redirects them; the page turns any that reach it.
import { findClosestBookId, getBookId } from "@seed/scripture/books";
import { parseRoute, routeOf } from "./route";

/** First segments that are this reader's own pages, never an old reading link. */
const OWN = new Set(["read", "shared", "friend", "api", "assets", "bible"]);
/** The old reader's shared pages (`/{lang}/playlist/…`, `/{lang}/reading-plan/…`), not reading links. */
const SHARED = new Set(["playlist", "reading-plan"]);
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const CHAPTER = /^[1-9]\d{0,2}$/;
const TRANSLATION = /^[A-Za-z0-9_-]{1,64}$/;
const VERSES = /^(\d+)(?:-(\d+))?$/;

const bookOf = (segment: string) =>
  getBookId(segment) ?? findClosestBookId(segment);

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** This reader's address for an old reader's link, or null when it is not one (or already this reader's own). */
export function legacyTarget(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  const verse = q.get("verse");
  const v = verse && VERSES.test(verse) ? verse : null;
  const segs = pathname.split("/").filter(Boolean).map(decode);

  let lang: string | null = null;
  let translationId: string | null = null;
  let book: string | null = null;
  let chapter: string | null = null;

  const canonical = parseRoute(pathname);
  if (canonical && segs[0] !== "read") {
    // Already the address: only an old `?verse=` needs turning into `?v=`.
    if (!v) return null;
  } else if (canonical) {
    // This reader's earlier `/read/…`: the same chapter at the address.
  } else if (
    (segs.length === 4 || segs.length === 3) &&
    !OWN.has(segs[0]!.toLowerCase()) &&
    CHAPTER.test(segs[segs.length - 1]!)
  ) {
    const four = segs.length === 4;
    if (four && (!LANG.test(segs[0]!) || SHARED.has(segs[1]!.toLowerCase())))
      return null;
    lang = four ? segs[0]! : null;
    translationId = segs[four ? 1 : 0]!;
    book = segs[four ? 2 : 1]!;
    chapter = segs[segs.length - 1]!;
  } else if (segs.length <= 1 && (q.get("book") || q.get("chapter"))) {
    if (segs.length === 1 && !LANG.test(segs[0]!)) return null;
    lang = segs[0] ?? null;
    translationId = q.get("translation") ?? q.get("translationId");
    book = q.get("book");
    chapter = q.get("chapter") ?? "1";
  } else return null;

  const keep = new URLSearchParams(q);
  for (const k of ["verse", "translation", "translationId", "book", "chapter"])
    keep.delete(k);
  if (v) keep.set("v", v);

  let path = pathname;
  if (canonical) path = routeOf(canonical);
  else {
    const bookId = book ? bookOf(book) : null;
    if (!bookId || !chapter || !CHAPTER.test(chapter)) return null;
    if (translationId && !TRANSLATION.test(translationId)) return null;
    path = routeOf(
      {
        translationId: translationId || "BSB",
        bookId,
        chapterNumber: Number(chapter),
      },
      ...(lang ? [lang] : [])
    );
  }
  const rest = keep.toString();
  return `${path}${rest ? `?${rest}` : ""}`;
}
