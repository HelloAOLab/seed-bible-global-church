// THE EXPLORER'S DATA — the ontology drawn whole (the story dataset's atlas files, built by ~/skills
// scripts/build-story-dataset.py from the scripture and household releases): the canon and the cross-references between its
// books, each book's canonical sections with the BSB headings over them, who speaks to whom, the commissions and plantings,
// the churches as one forest, and an index of everyone with a card. Read like the rest of the story dataset (data.ts).
import { readStory, type EntityRef } from "./data";

type Cache = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
};

export interface Located extends EntityRef {
  lat?: number;
  lon?: number;
}
export interface CanonBook {
  usfm: string;
  osis: string;
  name: string;
  testament: string | null;
  divisions: string[];
  genres: string[];
  chapters: number | null;
  sections: number;
}
export interface CanonLink {
  a: string;
  b: string;
  count: number;
  score: number;
}
export interface Canon {
  books: CanonBook[];
  links: CanonLink[];
}
/** A canonical section (scr:CanonicalSection): its verses, its canonical id, the BSB heading over it and the broader one. */
export interface AtlasSection {
  id: string;
  order: number;
  from: string;
  to: string;
  canonicalId: string;
  heading: string | null;
  group: string | null;
}
export interface Voices {
  usfm: string;
  nodes: Array<Located & { spoke: number; heard: number }>;
  edges: Array<{
    from: string;
    to: string;
    count: number;
    kinds: Record<string, number>;
    first: string;
  }>;
}
export interface CommissionStep {
  kind: string;
  message: string | null;
  place: Located | null;
  audience: Located[];
  journeys: Array<{
    traveller: Located[];
    at: string;
    outcome: string | null;
    from: Located | null;
    to: Located | null;
  }>;
}
export interface Commission {
  label: string;
  at: string;
  by: Located[];
  sent: Located[];
  steps: CommissionStep[];
}
export interface Planting {
  church: EntityRef;
  planters: Located[];
  place: Located | null;
  at: string;
}
export interface Sendings {
  commissions: Commission[];
  plantings: Planting[];
}
export interface AtlasChurch extends EntityRef {
  type: string;
  plantedBy: EntityRef[];
  grewOutOf: EntityRef[];
  gaveRiseTo: EntityRef[];
  gatheredFrom: EntityRef[];
  attestedAt: string[];
}
export interface Churches {
  churches: AtlasChurch[];
  households: EntityRef[];
}
export interface Findable {
  label: string;
  kind: string;
  path: string;
  brief: string;
  /** Other names the entry goes by: found by any of them. */
  aka?: string[];
}

const as = <T>(
  v: unknown,
  test: (x: Record<string, unknown>) => boolean
): T | null =>
  v && typeof v === "object" && test(v as Record<string, unknown>)
    ? (v as T)
    : null;

export const readCanon = (cache: Cache, f: typeof fetch = fetch) =>
  readStory("atlas-canon", cache, f).then((v) =>
    as<Canon>(v, (x) => Array.isArray(x["books"]))
  );
export const readSections = (
  usfm: string,
  cache: Cache,
  f: typeof fetch = fetch
) =>
  readStory(`atlas-sections/${usfm}`, cache, f).then((v) =>
    as<{ sections: AtlasSection[] }>(v, (x) => Array.isArray(x["sections"]))
  );
export const readVoices = (
  usfm: string,
  cache: Cache,
  f: typeof fetch = fetch
) =>
  readStory(`atlas-voices/${usfm}`, cache, f).then((v) =>
    as<Voices>(v, (x) => Array.isArray(x["nodes"]))
  );
export const readSendings = (cache: Cache, f: typeof fetch = fetch) =>
  readStory("atlas-sendings", cache, f).then((v) =>
    as<Sendings>(v, (x) => Array.isArray(x["commissions"]))
  );
export const readChurches = (cache: Cache, f: typeof fetch = fetch) =>
  readStory("atlas-churches", cache, f).then((v) =>
    as<Churches>(v, (x) => Array.isArray(x["churches"]))
  );
export const readFindable = (cache: Cache, f: typeof fetch = fetch) =>
  readStory("atlas-people", cache, f).then((v) =>
    Array.isArray(v) ? (v as Findable[]) : []
  );

/** The first Christian-canon division of a book (its Tanakh division is kept too, but the wheel is coloured by this). */
export const DIVISIONS = [
  "law",
  "history",
  "poetry-and-wisdom",
  "major-prophets",
  "minor-prophets",
  "gospels",
  "acts",
  "pauline-letters",
  "general-letters",
  "revelation",
] as const;
export const DIVISION_COLOR: Record<string, string> = {
  law: "#b45309",
  history: "#ca8a04",
  "poetry-and-wisdom": "#16a34a",
  "major-prophets": "#0d9488",
  "minor-prophets": "#0891b2",
  gospels: "#2563eb",
  acts: "#4f46e5",
  "pauline-letters": "#7c3aed",
  "general-letters": "#c026d3",
  revelation: "#db2777",
};
export const divisionOf = (b: CanonBook) =>
  b.divisions.find((d) => (DIVISIONS as readonly string[]).includes(d)) ??
  (b.testament === "NT" ? "general-letters" : "history");

/** The canon's strongest links, each book's arc in canon order sized by chapters: where each arc starts and ends (radians). */
export function wheelArcs(books: CanonBook[], gap = 0.004) {
  const total = books.reduce((n, b) => n + (b.chapters ?? 1), 0);
  const span = 2 * Math.PI - gap * books.length;
  let at = -Math.PI / 2;
  return books.map((b) => {
    const a0 = at;
    const a1 = at + (span * (b.chapters ?? 1)) / total;
    at = a1 + gap;
    return { book: b, a0, a1, mid: (a0 + a1) / 2 };
  });
}

/** A force layout for a speaking network: nodes pushed apart, pulled along their links and toward the middle. Deterministic
 *  (nodes start on a circle in the order given), so the same book draws the same way every time. */
export function layoutNetwork(
  ids: string[],
  links: Array<{ from: string; to: string; count: number }>,
  width: number,
  height: number,
  rounds = 320
): Map<string, { x: number; y: number }> {
  const pos = new Map(
    ids.map((id, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, ids.length);
      const at: { x: number; y: number } = {
        x: width / 2 + (width / 3) * Math.cos(a),
        y: height / 2 + (height / 3) * Math.sin(a),
      };
      return [id, at] as [string, { x: number; y: number }];
    })
  );
  const k = Math.sqrt((width * height) / Math.max(1, ids.length)) * 0.42;
  // Room for a name under every dot: names are centred on their dot, so the dots keep clear of the sides and the bottom.
  const MX = 90;
  const TOP = 24;
  const BOTTOM = 40;
  for (let r = 0; r < rounds; r++) {
    const move = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i]!)!;
        const b = pos.get(ids[j]!)!;
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const d2 = dx * dx + dy * dy;
        const f = (k * k) / d2;
        move.get(ids[i]!)!.x += dx * f;
        move.get(ids[i]!)!.y += dy * f;
        move.get(ids[j]!)!.x -= dx * f;
        move.get(ids[j]!)!.y -= dy * f;
      }
    for (const l of links) {
      const a = pos.get(l.from);
      const b = pos.get(l.to);
      if (!a || !b || a === b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d / k) * Math.min(3, 1 + Math.log(l.count));
      move.get(l.from)!.x -= (dx / d) * f;
      move.get(l.from)!.y -= (dy / d) * f;
      move.get(l.to)!.x += (dx / d) * f;
      move.get(l.to)!.y += (dy / d) * f;
    }
    const temp = 12 * (1 - r / rounds) + 0.5;
    for (const id of ids) {
      const p = pos.get(id)!;
      const m = move.get(id)!;
      m.x += (width / 2 - p.x) * 0.06;
      m.y += (height / 2 - p.y) * 0.06;
      const len = Math.sqrt(m.x * m.x + m.y * m.y) || 1;
      p.x = Math.min(
        width - MX,
        Math.max(MX, p.x + (m.x / len) * Math.min(len, temp))
      );
      p.y = Math.min(
        height - BOTTOM,
        Math.max(TOP, p.y + (m.y / len) * Math.min(len, temp))
      );
    }
  }
  return pos;
}
