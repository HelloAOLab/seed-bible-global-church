// THE STORY DATASET — the story layer by chapter, as the scripture agent serves it (`read-dataset` story, built by
// ~/skills scripts/build-story-dataset.py, CC BY-SA 4.0): each chapter's scenes (scr:Scene) with their cast
// (scr:CastEntry), setting, events, communication acts and the communities attested there; and a card per person, place
// or community — its oikos (household, companions, disciples) and its generations (scr:plantedBody → scr:gaveRiseTo …).
// Read under the reader's `/bible/` route like every dataset; records are kept on the device once read.
import { CANON_66 } from "@seed/locus";
import { BIBLE_API_ENDPOINT } from "../../backend/bible";

const ORIGIN = BIBLE_API_ENDPOINT.replace(/\/$/, "");

export interface EntityRef {
  id: string;
  label: string;
  /** person · place · group · community · divine · other · discourse-entity (one the book introduces, with no card). */
  kind: string;
  /** The card's path in the dataset, absent when there is none. */
  path: string | null;
}
export interface CastMember extends EntityRef {
  storyRole?: string;
  naturalGender?: string;
  naturalNumber?: string;
  introducedAt?: string;
  brief?: string | null;
}
export interface Located extends EntityRef {
  lat?: number | null;
  lon?: number | null;
  brief?: string | null;
  modernName?: string | null;
}
export interface CommunicationAct {
  communicator: string[];
  audience: string[];
  mode: string[];
  /** The first and last verse (OSIS). */
  verses: [string, string];
}
export interface StoryEvent {
  label: string;
  kind: string;
  year: number | null;
}
export interface Scene {
  id: string;
  order: number;
  label: string;
  from: string;
  to: string;
  sceneBoundary?: string;
  narrativeTime?: string | null;
  temporalRelation?: string;
  setting: Located | null;
  places: Located[];
  cast: CastMember[];
  events: StoryEvent[];
  narrativeModes: Record<string, number>;
  communication: CommunicationAct[];
  communities: EntityRef[];
  previous: { label: string; from: string } | null;
  next: { label: string; from: string } | null;
}
export interface GenerationNode extends EntityRef {
  /** How it came from its parent: planted (scr:plantedBody), discipled (scr:discipled), gave rise to (scr:gaveRiseTo). */
  via?: "plantedBody" | "discipled" | "gaveRiseTo";
  children: GenerationNode[];
}
export interface Oikos {
  parents: EntityRef[];
  partners: EntityRef[];
  children: EntityRef[];
  siblings: EntityRef[];
  companions: EntityRef[];
  discipled: EntityRef[];
  discipledBy: EntityRef[];
  tribe: EntityRef[];
  planted: EntityRef[];
}
export interface EntityCard {
  id: string;
  kind: string;
  label: string;
  brief?: string | null;
  firstAt?: string | null;
  occurrences?: number | null;
  gender?: string | null;
  period?: string | null;
  modernName?: string | null;
  lat?: number | null;
  lon?: number | null;
  type?: string;
  attestedAt?: string[];
  oikos: Oikos | null;
  generations?: GenerationNode;
  plantedBy?: EntityRef[];
  grewOutOf?: EntityRef[];
  gaveRiseTo?: EntityRef[];
  scenes: Array<{
    from: string;
    to: string;
    label: string;
    storyRole?: string;
  }>;
  sceneCount: number;
}

type Cache = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
};
const PATH = /^[A-Za-z0-9_./-]+$/;

async function read(
  path: string,
  cache: Cache,
  fetchImpl: typeof fetch
): Promise<unknown> {
  if (!PATH.test(path) || path.includes("..")) return null;
  const key = `story:${path}`;
  const hit = await cache.get(key);
  if (hit !== undefined && hit !== null) return hit;
  const res = await fetchImpl(`${ORIGIN}/api/d/story/${path}.json`);
  if (!res.ok) return null;
  const value: unknown = await res.json();
  await cache.set(key, value);
  return value;
}

/** A chapter's scenes (`GEN`, 1); empty when the story layer has none for it. */
export async function readChapterScenes(
  book: string,
  chapter: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<Scene[]> {
  const raw = (await read(`${book}/${chapter}`, cache, fetchImpl)) as {
    scenes?: Scene[];
  } | null;
  return Array.isArray(raw?.scenes) ? raw.scenes : [];
}

/** A person's, place's or community's card by its path (`person-p/person-Paul_Act.7.58-2Pe`); null when not held. */
export async function readEntity(
  path: string,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<EntityCard | null> {
  const raw = (await read(path, cache, fetchImpl)) as EntityCard | null;
  return raw && typeof raw === "object" && "label" in raw ? raw : null;
}

const usfmOf = new Map(CANON_66.map((b) => [b[1], b[0]]));

/** An OSIS verse (`Acts.16.13`) as the reader's place: USFM book, chapter, verse. */
export function placeOf(
  osis: string
): { book: string; chapter: number; verse: number } | null {
  const [b, c, v] = osis.split(".");
  const book = b ? usfmOf.get(b) : undefined;
  const chapter = Number(c);
  const verse = Number(v);
  return book && chapter > 0 && verse > 0 ? { book, chapter, verse } : null;
}

/** The scenes a section of a chapter (its first and last verse) overlaps, in order. */
export function scenesOfSection(
  scenes: Scene[],
  chapter: number,
  start: number,
  end: number
): Scene[] {
  const at = (osis: string) => {
    const p = placeOf(osis);
    return p ? p.chapter * 1000 + p.verse : 0;
  };
  const lo = chapter * 1000 + start;
  const hi = chapter * 1000 + end;
  return scenes
    .filter((s) => at(s.from) <= hi && at(s.to) >= lo)
    .sort((a, b) => a.order - b.order);
}

/** A verse span in short form for the chapter on screen: `1:3–5`, or `16:40–17:1` across chapters. */
export function spanLabel(from: string, to: string): string {
  const a = placeOf(from);
  const b = placeOf(to);
  if (!a || !b) return from;
  if (a.chapter !== b.chapter)
    return `${a.chapter}:${a.verse}–${b.chapter}:${b.verse}`;
  return a.verse === b.verse
    ? `${a.chapter}:${a.verse}`
    : `${a.chapter}:${a.verse}–${b.verse}`;
}

/** The cast, the places, the events and the communities of several scenes, each once. */
export function gatherSection(scenes: Scene[]) {
  const once = <T extends { id?: string; label: string }>(xs: T[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => {
      const k = x.id ?? x.label;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    cast: once(scenes.flatMap((s) => s.cast)),
    places: once(
      scenes.flatMap((s) => [...(s.setting ? [s.setting] : []), ...s.places])
    ),
    events: once(scenes.flatMap((s) => s.events)),
    communities: once(scenes.flatMap((s) => s.communities)),
    communication: scenes.flatMap((s) => s.communication),
  };
}
