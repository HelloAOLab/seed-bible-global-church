// THE PLACES OF A CHAPTER — the workspace routing one reader intent ("draw this chapter's places") to the publishers that
// can answer it, over the publisher contract's `publisher.at-verse` with a chapter span: the scripture publisher (the
// Bible places: where each place named in the chapter is, and how sure that site is) and the publishing gateway (map
// features people and ministries published, tied to the chapter's verses). Asked at once; a publisher that fails is
// named in `sources` and the others still answer. Each place keeps its publisher, its identification and its licence,
// so the map can say where a site is disputed instead of hiding it.
import { Hono } from "hono";
import { parseLocus } from "../../../../lib/locus";
import { askScripture, type BibleEnv } from "./bible";
import { publishingFetch, type PublishingEnv } from "../clients/publishing";

/** One item of the publisher contract's envelope, as far as a map reads it. */
export interface ContractItem {
  item: { id: string; name: string; site?: string; url?: string };
  references: Array<{
    to: string;
    relation: string;
    confidence: number;
    method: string;
    basis?: string;
  }>;
  location: {
    geometry: { type: string; coordinates: unknown };
    identification?: { confidence: number; method: string; basis?: string };
  } | null;
  publisher: { name?: string; handle?: string; address?: string | null };
  release: { work: string; signatureStatus: string };
  license: string;
  attribution: string;
}

export interface ChapterPlace {
  id: string;
  name: string;
  site?: string;
  geometry: { type: string; coordinates: unknown };
  /** The verses of this chapter that name the place, first first. */
  verses: number[];
  /** How sure the site is (1 when the publisher states no doubt), and why. */
  identification: { confidence: number; method: string; basis?: string };
  source: "scripture" | "publishing";
  publisher: string;
  work: string;
  license: string;
  attribution: string;
}

export interface SourceReport {
  source: "scripture" | "publishing";
  ok: boolean;
  count: number;
  error?: string;
}

/** A contract item as a place on this chapter's map, or null when it has no location or no verse of the chapter. */
export function placeOf(
  it: ContractItem,
  chapter: string,
  source: ChapterPlace["source"]
): ChapterPlace | null {
  if (!it.location?.geometry) return null;
  const verses = [
    ...new Set(
      it.references
        .filter(
          (r) => r.relation === "locates" && r.to.startsWith(`${chapter}.`)
        )
        .map((r) => Number(r.to.slice(chapter.length + 1)))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ].sort((a, b) => a - b);
  if (!verses.length) return null;
  return {
    id: it.item.id,
    name: it.item.name,
    ...(it.item.site && it.item.site !== it.item.name
      ? { site: it.item.site }
      : {}),
    geometry: it.location.geometry,
    verses,
    identification: it.location.identification ?? {
      confidence: 1,
      method: "publisher-label",
    },
    source,
    publisher: it.publisher.name ?? it.publisher.handle ?? "",
    work: it.release.work,
    license: it.license,
    attribution: it.attribution,
  };
}

/** Ask each publisher for the chapter, merge by item id, order by the first verse that names the place. */
export async function chapterPlaces(
  env: BibleEnv & PublishingEnv,
  chapter: string
): Promise<{ places: ChapterPlace[]; sources: SourceReport[] }> {
  const ask = async (
    source: ChapterPlace["source"],
    run: () => Promise<{ items?: ContractItem[] }>
  ): Promise<{ report: SourceReport; places: ChapterPlace[] }> => {
    try {
      const out = await run();
      const places = (out.items ?? [])
        .map((it) => placeOf(it, chapter, source))
        .filter((p): p is ChapterPlace => p !== null);
      return { report: { source, ok: true, count: places.length }, places };
    } catch (e) {
      return {
        report: {
          source,
          ok: false,
          count: 0,
          error: e instanceof Error ? e.message : String(e),
        },
        places: [],
      };
    }
  };
  const answers = await Promise.all([
    ask(
      "scripture",
      async () =>
        // Places only: unnarrowed, a chapter span also carries the chapter's verses in every served edition.
        (await askScripture(env, "publisher.at-verse", {
          span: chapter,
          relation: "locates",
          kind: "feature",
        })) as { items?: ContractItem[] }
    ),
    ask("publishing", async () => {
      const res = await publishingFetch(env, "/publisher/at-verse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          span: chapter,
          relation: "locates",
          kind: "feature",
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        items?: ContractItem[];
        error?: string;
      } | null;
      if (!res.ok || !body?.ok)
        throw new Error(
          body?.error ?? `the publishing gateway answered ${res.status}`
        );
      return body;
    }),
  ]);
  const seen = new Set<string>();
  const places: ChapterPlace[] = [];
  for (const a of answers)
    for (const p of a.places)
      if (!seen.has(p.id)) {
        seen.add(p.id);
        places.push(p);
      }
  // Within a verse the scripture publisher's place comes first: the Bible's own place, then what others published at it.
  const rank = (p: ChapterPlace) => (p.source === "scripture" ? 0 : 1);
  places.sort(
    (a, b) =>
      a.verses[0]! - b.verses[0]! ||
      rank(a) - rank(b) ||
      a.name.localeCompare(b.name)
  );
  return { places, sources: answers.map((a) => a.report) };
}

export const chapterPlacesRoutes = new Hono<{
  Bindings: BibleEnv & PublishingEnv;
}>();

chapterPlacesRoutes.get("/api/places/chapter/:ref", async (c) => {
  const l = parseLocus(c.req.param("ref"));
  if (!l || l.type !== "chapter" || l.chapter === undefined)
    return c.json(
      { ok: false, error: "a chapter, such as JHN.1 or John.1" },
      400
    );
  const chapter = `${l.osis}.${l.chapter}`;
  const { places, sources } = await chapterPlaces(c.env, chapter);
  return c.json({ ok: true, chapter, places, sources }, 200, {
    "cache-control": sources.every((s) => s.ok)
      ? "public, max-age=3600"
      : "no-store",
  });
});
