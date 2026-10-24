// THEOGRAPHIC DATA — the Theographic Bible Metadata (CC BY-SA 4.0) as the Free Use Bible API hosts it: per chapter,
// the people, places and events in it and the verses they appear in; per entity, its description, relations and
// references. Public and keyless (the Bible API exception); records are kept on the device once read.
import type { DiscoverItem } from "../host";
import { BIBLE_API_ENDPOINT } from "../../backend/bible";

export const THEOGRAPHIC_ORIGIN = BIBLE_API_ENDPOINT.replace(/\/$/, "");
const PATH = /^\/api\/d\/theographic\/[A-Za-z0-9_./-]+\.json$/;

export interface Related {
  id: string;
  type: "people" | "places" | "events" | "groups";
  name: string;
  apiLink: string;
}
interface Entry {
  id: string;
  name: string;
  apiLink: string;
  verses: number[];
}
export interface ChapterEntities {
  people: Array<
    Entry & { gender?: string; birthYear?: number; deathYear?: number }
  >;
  places: Array<Entry & { featureType?: string }>;
  events: Array<Entry & { startDate?: string }>;
}
export interface Reference {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
}
/** One person, place or event as its own record carries it (the fields the card shows). */
export interface Entity {
  kind: "person" | "place" | "event";
  id: string;
  name: string;
  alsoCalled?: string[];
  description?: string[];
  birthYear?: number;
  deathYear?: number;
  featureType?: string;
  latitude?: number;
  longitude?: number;
  startDate?: string;
  relations: Array<{ label: string; items: Related[] }>;
  references: Reference[];
}

type Cache = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
};

/** A dataset record, from the device if read before; null for a path outside the dataset or one it lacks. The
 *  agent's records link each other under its `/bible/` route; the path here is the one below it. */
export async function readTheographic(
  link: string,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const path = link.startsWith("/bible/") ? link.slice("/bible".length) : link;
  if (!PATH.test(path) || path.includes("..")) return null;
  const key = `theo:${path}`;
  const hit = await cache.get(key);
  if (hit !== undefined && hit !== null) return hit;
  const res = await fetchImpl(`${THEOGRAPHIC_ORIGIN}${path}`);
  if (!res.ok) return null;
  const value: unknown = await res.json();
  await cache.set(key, value);
  return value;
}

export const chapterPath = (book: string, chapter: number) =>
  `/api/d/theographic/${encodeURIComponent(book)}/${chapter}.json`;

export function chapterEntities(raw: unknown): ChapterEntities {
  const c =
    ((raw ?? {}) as { chapter?: Partial<ChapterEntities> }).chapter ?? {};
  const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return {
    people: list(c.people),
    places: list(c.places),
    events: list(c.events),
  };
}

/** A year of the dataset (negative before Christ) as readers write it: 1997 BC, AD 30. */
export const yearText = (y: number | string | undefined) => {
  const n = typeof y === "string" ? Number(y) : y;
  if (n === undefined || !Number.isFinite(n)) return "";
  return n < 0 ? `${-n} BC` : `AD ${n}`;
};

/** The chapter's entities as Discover items — only those in the selected verses when some are selected. */
export function itemsForChapter(
  e: ChapterEntities,
  selected: number[]
): Array<DiscoverItem & { apiLink: string }> {
  const keep = (x: Entry) =>
    !selected.length || x.verses.some((v) => selected.includes(v));
  const verses = (x: Entry) =>
    x.verses.length > 3
      ? `vv. ${x.verses.slice(0, 3).join(", ")}…`
      : `v. ${x.verses.join(", ")}`;
  return [
    ...e.people.filter(keep).map((p) => ({
      id: `person:${p.id}`,
      title: p.name,
      description: [
        p.birthYear !== undefined && p.deathYear !== undefined
          ? `${yearText(p.birthYear)} – ${yearText(p.deathYear)}`
          : "",
        verses(p),
      ]
        .filter(Boolean)
        .join(" · "),
      icon: "person",
      apiLink: p.apiLink,
    })),
    ...e.places.filter(keep).map((p) => ({
      id: `place:${p.id}`,
      title: p.name,
      description: [p.featureType ?? "", verses(p)].filter(Boolean).join(" · "),
      icon: "location_on",
      apiLink: p.apiLink,
    })),
    ...e.events.filter(keep).map((v) => ({
      id: `event:${v.id}`,
      title: v.name,
      description: [yearText(v.startDate), verses(v)]
        .filter(Boolean)
        .join(" · "),
      icon: "event",
      apiLink: v.apiLink,
    })),
  ];
}

const RELATIONS: Array<[string, string]> = [
  ["father", "Father"],
  ["mother", "Mother"],
  ["partners", "Married to"],
  ["children", "Children"],
  ["siblings", "Siblings"],
  ["memberOf", "Member of"],
  ["birthPlace", "Born in"],
  ["deathPlace", "Died in"],
  ["participants", "Who"],
  ["locations", "Where"],
  ["partOf", "Part of"],
  ["events", "Events"],
];

/** A person, place or event record as the card shows it; null when it is none of them. */
export function entityOf(raw: unknown): Entity | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const [kind, body] = r["person"]
    ? (["person", r["person"]] as const)
    : r["place"]
      ? (["place", r["place"]] as const)
      : r["event"]
        ? (["event", r["event"]] as const)
        : [null, null];
  if (!kind || !body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const rel = (v: unknown): Related[] =>
    (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter(
      (x): x is Related =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Related).apiLink === "string"
    );
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const strs = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : undefined;
  return {
    kind,
    id: str(b["id"]) ?? "",
    name: str(b["name"]) ?? "",
    ...(strs(b["alsoCalled"])?.length
      ? { alsoCalled: strs(b["alsoCalled"]) }
      : {}),
    ...(strs(b["description"])?.length
      ? { description: strs(b["description"]) }
      : {}),
    ...(num(b["birthYear"]) !== undefined
      ? { birthYear: num(b["birthYear"]) }
      : {}),
    ...(num(b["deathYear"]) !== undefined
      ? { deathYear: num(b["deathYear"]) }
      : {}),
    ...(str(b["featureType"]) ? { featureType: str(b["featureType"]) } : {}),
    ...(num(b["latitude"]) !== undefined
      ? { latitude: num(b["latitude"]) }
      : {}),
    ...(num(b["longitude"]) !== undefined
      ? { longitude: num(b["longitude"]) }
      : {}),
    ...(str(b["startDate"]) ? { startDate: str(b["startDate"]) } : {}),
    relations: RELATIONS.map(([k, label]) => ({
      label,
      items: rel(b[k]),
    })).filter((x) => x.items.length),
    references: (Array.isArray(b["references"]) ? b["references"] : []).filter(
      (x): x is Reference =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Reference).book === "string" &&
        typeof (x as Reference).chapter === "number"
    ),
  };
}
