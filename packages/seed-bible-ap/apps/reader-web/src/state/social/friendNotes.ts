// FRIENDS' NOTES IN THE PASSAGE — the old reader showed a friend's notes in the chapter beside the reader's own. Here
// a friend's note is one they published (a released slice, listed by the registry for the chapter); the chapter on
// screen asks for its published notes once (discover.forChapter loads on first ask) when the reader has friends, and
// each friend's note is marked at the verse it starts at.
import type { Offering } from "./discover";

const VERSE = /^([1-4]?[A-Z]{2,3})\.(\d+)\.(\d+)/;

/** The verse a published note starts at, in the chapter given — null for a whole-chapter note or another chapter. */
export function startVerseIn(
  chapterRef: string,
  passage: string
): number | null {
  const m = VERSE.exec(passage);
  if (!m || `${m[1]}.${m[2]}` !== chapterRef) return null;
  return Number(m[3]);
}

/** Friends' published notes in a chapter's offerings, by the verse each starts at. */
export function friendNotesByVerse(
  chapterRef: string,
  offerings: readonly Offering[],
  friends: ReadonlySet<string>
): Map<number, Offering[]> {
  const out = new Map<number, Offering[]>();
  for (const o of offerings) {
    if (o.kind !== "note" || !friends.has((o.owner || o.shelf).toLowerCase()))
      continue;
    const v = startVerseIn(chapterRef, o.passage);
    if (v === null) continue;
    out.set(v, [...(out.get(v) ?? []), o]);
  }
  return out;
}
