// THE CANONICAL LOCUS — one id for a place in the Bible that every source can meet on: the scripture agent's text, the
// content agent's writings and places, a person's notes, the registry's publications and the publishing gateway's
// blocks. It names the place, never a translation's words (spec 266: the id moves only on a deliberate change of
// profile, versification, canon or locus type).
//
// A verse's id is exactly agenticprimitives' `ap-locus-id-v1` (scripture-content-extension): keccak256 over the JCS of
// `{ idScheme, contentDomain: 'scripture', locusProfile: 'ap.scripture.locus.v1', canonicalLocus }` with the locus
// `{ kind, work: 'bible.book.<osis>', canon, versification, locusType: 'verse', chapter, verse }`. This module adds the
// other locus types the same way — 'book', 'chapter', 'range' — so a chapter, a book and a range have ids too.
//
// Beside the id each locus carries an ORDINAL SPAN (book·chapter·verse as one integer, bbcccvvv): the hash is the
// identity, the span is what an index searches, because "everything about John 3:16" is everything whose span holds it.
import {
  computeCanonicalId,
  LOCUS_ID_SCHEME,
} from "@agenticprimitives/content-primitives";
import { getBookId } from "../scripture/books";
import { getChapterVerseCount } from "../scripture/bookChapterVerseCounts";
import { CANON_66, type CanonBook } from "./canon";

export { CANON_66 } from "./canon";

export const LOCUS_PROFILE = "ap.scripture.locus.v1";
export const VERSIFICATION = "kjv-v1";
export const CANON = "bible.protestant-66";

export type LocusType = "book" | "chapter" | "verse" | "range";

export interface Locus {
  type: LocusType;
  /** USFM book code, e.g. `JHN` (the reader's records, the scripture agent's paths). */
  book: string;
  /** OSIS book code, e.g. `John`. */
  osis: string;
  chapter?: number;
  verse?: number;
  /** A range's last verse. */
  end?: { chapter: number; verse: number };
  /** The readable alias in real OSIS: `John`, `John.3`, `John.3.16`, `John.3.16-John.3.18`. */
  alias: string;
  /** The canonical id (`ap-locus-id-v1`). */
  id: `0x${string}`;
  /** The verses it covers, as ordinals (`bbcccvvv`), first and last. */
  span: readonly [number, number];
}

const byUsfm = new Map(CANON_66.map((b, i) => [b[0], [b, i + 1] as const]));
const byOsis = new Map(
  CANON_66.map((b, i) => [b[1].toLowerCase(), [b, i + 1] as const])
);

function bookOf(token: string): readonly [CanonBook, number] | null {
  const t = token.replace(/\s+/g, "");
  const hit = byUsfm.get(t.toUpperCase()) ?? byOsis.get(t.toLowerCase());
  if (hit) return hit;
  const id = getBookId(token);
  return id ? (byUsfm.get(id) ?? null) : null;
}

/** One verse as one integer: book (1–66) · chapter · verse. */
export const ordinal = (bookIndex: number, chapter: number, verse: number) =>
  bookIndex * 1_000_000 + chapter * 1_000 + verse;

const lastVerse = (usfm: string, chapter: number) =>
  getChapterVerseCount(usfm, chapter) ?? 200;

function idOf(locus: Record<string, unknown>): `0x${string}` {
  return computeCanonicalId({
    idScheme: LOCUS_ID_SCHEME,
    contentDomain: "scripture",
    locusProfile: LOCUS_PROFILE,
    canonicalLocus: locus as never,
  }) as `0x${string}`;
}

/** Build a locus from its parts; null when it is not a place in the canon. */
export function locus(
  bookToken: string,
  chapter?: number,
  verse?: number,
  end?: { chapter: number; verse: number }
): Locus | null {
  const hit = bookOf(bookToken);
  if (!hit) return null;
  const [[usfm, osis, , chapters], bi] = hit;
  const base = {
    kind: "scripture.locus",
    work: `bible.book.${osis.toLowerCase()}`,
    canon: CANON,
    versification: VERSIFICATION,
  };
  const okChapter = (c: number) =>
    Number.isInteger(c) && c >= 1 && c <= chapters;
  const okVerse = (c: number, v: number) =>
    Number.isInteger(v) && v >= 1 && v <= lastVerse(usfm, c);
  if (chapter === undefined) {
    const last = lastVerse(usfm, chapters);
    return {
      type: "book",
      book: usfm,
      osis,
      alias: osis,
      id: idOf({ ...base, locusType: "book" }),
      span: [ordinal(bi, 1, 1), ordinal(bi, chapters, last)],
    };
  }
  if (!okChapter(chapter)) return null;
  if (verse === undefined)
    return {
      type: "chapter",
      book: usfm,
      osis,
      chapter,
      alias: `${osis}.${chapter}`,
      id: idOf({ ...base, locusType: "chapter", chapter }),
      span: [
        ordinal(bi, chapter, 1),
        ordinal(bi, chapter, lastVerse(usfm, chapter)),
      ],
    };
  if (!okVerse(chapter, verse)) return null;
  const start = ordinal(bi, chapter, verse);
  if (end && (end.chapter !== chapter || end.verse !== verse)) {
    if (!okChapter(end.chapter) || !okVerse(end.chapter, end.verse))
      return null;
    const stop = ordinal(bi, end.chapter, end.verse);
    if (stop < start) return null;
    return {
      type: "range",
      book: usfm,
      osis,
      chapter,
      verse,
      end,
      alias: `${osis}.${chapter}.${verse}-${osis}.${end.chapter}.${end.verse}`,
      id: idOf({
        ...base,
        locusType: "range",
        chapter,
        verse,
        endChapter: end.chapter,
        endVerse: end.verse,
      }),
      span: [start, stop],
    };
  }
  return {
    type: "verse",
    book: usfm,
    osis,
    chapter,
    verse,
    alias: `${osis}.${chapter}.${verse}`,
    id: idOf({ ...base, locusType: "verse", chapter, verse }),
    span: [start, start],
  };
}

const PART = /^([1-3]?\s?[A-Za-z]+)(?:[\s.]+(\d+)(?:[.:](\d+))?)?$/;

/**
 * Parse any reference the sources use: the reader's records (`JHN.3`, `JHN.3.16`, `JHN.3.16-JHN.3.18`), real OSIS
 * (`John.3.16`, `1John.1.1-1John.1.4`), the alias form (`scripture:John.3.16`) and plain words (`John 3:16-18`,
 * `Jn 3`, `Gen 1:1-2:3`). Null for anything that is not one place in the canon.
 */
export function parseLocus(input: string): Locus | null {
  const raw = input
    .normalize("NFC")
    .trim()
    .replace(/^(scripture|osis|usfm):/i, "");
  if (!raw || !/^[\x20-\x7E]+$/.test(raw)) return null;
  const [left, right] = raw.split(/\s*[-–]\s*/, 2) as [
    string,
    string | undefined,
  ];
  const m = PART.exec(left!);
  if (!m) return null;
  const chapter = m[2] ? Number(m[2]) : undefined;
  const verse = m[3] ? Number(m[3]) : undefined;
  if (right === undefined) return locus(m[1]!, chapter, verse);
  if (chapter === undefined || verse === undefined) return null;
  // The end: a whole reference, `chapter:verse`, or a verse in the same chapter.
  const full = PART.exec(right);
  if (full && /[A-Za-z]/.test(right)) {
    if (bookOf(full[1]!)?.[0][0] !== bookOf(m[1]!)?.[0][0]) return null; // a range stays in one book
    if (!full[2] || !full[3]) return null;
    return locus(m[1]!, chapter, verse, {
      chapter: Number(full[2]),
      verse: Number(full[3]),
    });
  }
  const cv = /^(\d+)[.:](\d+)$/.exec(right);
  if (cv)
    return locus(m[1]!, chapter, verse, {
      chapter: Number(cv[1]),
      verse: Number(cv[2]),
    });
  if (/^\d+$/.test(right))
    return locus(m[1]!, chapter, verse, { chapter, verse: Number(right) });
  return null;
}

/** Whether one span lies wholly inside another (the verse inside its chapter, the range inside its book). */
export const within = (inner: Locus["span"], outer: Locus["span"]) =>
  inner[0] >= outer[0] && inner[1] <= outer[1];

/** Whether two spans share a verse. */
export const overlaps = (a: Locus["span"], b: Locus["span"]) =>
  a[0] <= b[1] && b[0] <= a[1];

/** The reader's own record form (`JHN.3.16`, `JHN.3`, `JHN.3.16-JHN.3.18`) for a locus. */
export function seedRef(l: Locus): string {
  if (l.type === "book") return l.book;
  if (l.type === "chapter") return `${l.book}.${l.chapter}`;
  if (l.type === "verse") return `${l.book}.${l.chapter}.${l.verse}`;
  return `${l.book}.${l.chapter}.${l.verse}-${l.book}.${l.end!.chapter}.${l.end!.verse}`;
}
