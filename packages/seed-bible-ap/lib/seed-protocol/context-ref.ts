// The one context reference every Seed Bible envelope carries: which scripture place a message, op, or
// offering is about. Chat on the estate's discussion board, session ops, and Discover queries all point at a
// passage this way (realtime-collaboration.md "Chat"; ontology.md `seed:aboutPassage` → `scr:Passage`).
// Pure: no DOM, no Workers globals.

/** An OSIS reference the scripture context understands: `JHN.3`, `JHN.3.16`, or a range `JHN.3.16-JHN.3.18`. */
export type OsisRef = string;

export interface PassageContextRef {
  readonly kind: "scr:Passage";
  readonly id: OsisRef;
}

const OSIS_PLACE = /^[1-4]?[A-Z]{2,3}(\.\d+){0,2}$/;

/** Is this one OSIS place (book, chapter, or verse) with no range? */
export function isOsisPlace(s: string): boolean {
  return OSIS_PLACE.test(s);
}

/** Is this an OSIS reference: one place or a `start-end` range of two places. */
export function isOsisRef(s: string): s is OsisRef {
  const parts = s.split("-");
  if (parts.length === 1) return isOsisPlace(s);
  if (parts.length !== 2) return false;
  return isOsisPlace(parts[0]!) && isOsisPlace(parts[1]!);
}

/** The context ref for a passage, or a thrown Error when the reference is not OSIS-shaped. */
export function passageContextRef(ref: string): PassageContextRef {
  const id = ref.trim();
  if (!isOsisRef(id)) throw new Error(`not an OSIS reference: ${ref}`);
  return { kind: "scr:Passage", id };
}

/** The chapter a reference belongs to (`JHN.3.16` → `JHN.3`; a range answers its start). */
export function chapterOf(ref: OsisRef): OsisRef {
  const start = ref.split("-")[0]!;
  return start.split(".").slice(0, 2).join(".");
}
