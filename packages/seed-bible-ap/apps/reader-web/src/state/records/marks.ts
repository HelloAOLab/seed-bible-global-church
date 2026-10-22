// SHARED SHAPES of a mark: how a verse range is written as an OSIS passage and read back, the ids, the opIds.
import { chapterOf } from "@seed/seed-protocol";

export interface VerseSpan {
  chapter: string;
  start: number;
  end: number;
}

/** `JHN.3.16` for one verse, `JHN.3.16-JHN.3.18` for a range. */
export function passageOf(chapter: string, start: number, end = start): string {
  const c = chapterOf(chapter);
  return start === end ? `${c}.${start}` : `${c}.${start}-${c}.${end}`;
}

/** The chapter and verse span an `aboutPassage` names; a whole-chapter passage spans 1..∞. */
export function spanOf(passage: string): VerseSpan {
  const [from, to] = passage.split("-");
  const chapter = chapterOf(from ?? passage);
  const start = Number((from ?? "").split(".")[2] ?? 1);
  const end = to ? Number(to.split(".")[2] ?? start) : start;
  return { chapter, start: Number.isFinite(start) ? start : 1, end };
}

export const overlaps = (a: VerseSpan, b: VerseSpan) =>
  a.chapter === b.chapter && a.start <= b.end && b.start <= a.end;

export const newOpId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const nowIso = () => new Date().toISOString();
