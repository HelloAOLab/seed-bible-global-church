// EVERYTHING ANCHORED AT A PASSAGE, IN ONE ANSWER — `GET /api/passage/<locus>` (the architecture spec's composition
// call). The reader names a place in the Bible in any form (`John.3.16`, `JHN.3`, `John 3:16-18`, a canonical id is not
// accepted: it cannot be read back); this gathers what each source holds there and hands back one list, every item
// anchored by canonical locus id and ordinal span, so the reader never joins sources itself:
//   scripture — the scripture agent's datasets: cross-references and the people, places and events of the chapter;
//   content   — the writings around the passage (served by the scripture agent's passage-writings until the content
//               agent stands on its own; `from` says which agent answered);
//   person    — the signed-in reader's own highlights and notes, read from their own agent's Library (never the registry);
//   registry  — what Seed Bible agents published for the chapter (public content only).
// A source that fails is reported in `sources` and left out; the others still answer.
import { Hono } from "hono";
import {
  locus as locusOf,
  overlaps,
  parseLocus,
  seedRef,
  type Locus,
} from "../../../../lib/locus";
import { askScripture, type BibleEnv } from "./bible";
import { platformGet, type PlatformEnv } from "../clients/platform";

export type PassageSource =
  | "scripture"
  | "content"
  | "publishing"
  | "person"
  | "registry";

export interface PassageItem {
  source: PassageSource;
  /** cross-reference · person · place · event · writing · witness · highlight · note · offering */
  kind: string;
  /** Where it is anchored. */
  locus: Pick<Locus, "id" | "alias" | "type" | "span"> & { ref: string };
  title: string;
  detail?: string;
  link?: string;
  /** Which agent answered (the content agent's skills are still served by the scripture agent). */
  from?: string;
  data?: Record<string, unknown>;
}

export interface SourceReport {
  ok: boolean;
  count: number;
  error?: string;
}

/** The signed-in reader's own marks for a chapter (`JHN.3`); injected so the route stays free of the run machinery. */
export type PersonMarks = (
  chapterRef: string
) => Promise<Array<Record<string, unknown>>>;

/** At most this many chapters are gathered for one range (a whole book is asked chapter by chapter). */
export const MAX_CHAPTERS = 3;

const anchor = (l: Locus): PassageItem["locus"] => ({
  id: l.id,
  alias: l.alias,
  type: l.type,
  span: l.span,
  ref: seedRef(l),
});

/** The locus a set of verses in one chapter covers: one verse, or first to last. */
function versesLocus(
  book: string,
  chapter: number,
  verses: number[]
): Locus | null {
  const vs = verses
    .filter((v) => Number.isInteger(v) && v > 0)
    .sort((a, b) => a - b);
  if (!vs.length) return locusOf(book, chapter);
  const last = vs[vs.length - 1]!;
  return locusOf(
    book,
    chapter,
    vs[0],
    last === vs[0] ? undefined : { chapter, verse: last }
  );
}

/** Whether any of the verses lies inside the asked span (an event across verses 1–21 is not "at" 16 unless 16 is one). */
const touches = (
  book: string,
  chapter: number,
  verses: number[],
  asked: Locus
) =>
  verses.some((v) => {
    const at = locusOf(book, chapter, v);
    return !!at && overlaps(at.span, asked.span);
  });

/** The chapters a locus covers, in order, capped. */
export function chaptersOf(l: Locus): number[] {
  if (l.type === "book") return [];
  const first = l.chapter!;
  const last = l.type === "range" ? l.end!.chapter : first;
  const out: number[] = [];
  for (let c = first; c <= last && out.length < MAX_CHAPTERS; c++) out.push(c);
  return out;
}

interface CrossRefChapter {
  chapter?: {
    content?: Array<{
      verse: number;
      references?: Array<{
        book: string;
        chapter: number;
        verse: number;
        endVerse?: number;
        score?: number;
      }>;
    }>;
  };
}
interface TheographicChapter {
  chapter?: Record<
    "people" | "places" | "events",
    | Array<{
        id: string;
        name: string;
        verses?: number[];
        apiLink?: string;
        [k: string]: unknown;
      }>
    | undefined
  >;
}
interface WritingEntry {
  id: string;
  title: string;
  author?: string;
  kind?: string;
  date?: string;
  scope?: string;
  verses?: number[] | null;
  why?: string;
  links?: Array<{ url: string; title?: string }>;
}
interface WritingsAnswer {
  writings?: {
    witnesses?: { ofBook?: WritingEntry[] };
    period?: WritingEntry[];
    later?: WritingEntry[];
    commentary?: WritingEntry[];
  } | null;
}

export function crossReferenceItems(
  asked: Locus,
  chapter: number,
  body: CrossRefChapter
): PassageItem[] {
  const out: PassageItem[] = [];
  for (const row of body.chapter?.content ?? []) {
    const at = locusOf(asked.book, chapter, row.verse);
    if (!at || !overlaps(at.span, asked.span)) continue;
    for (const r of row.references ?? []) {
      const to = locusOf(
        r.book,
        r.chapter,
        r.verse,
        r.endVerse ? { chapter: r.chapter, verse: r.endVerse } : undefined
      );
      if (!to) continue;
      out.push({
        source: "scripture",
        kind: "cross-reference",
        locus: anchor(at),
        title: to.alias,
        from: "scripture-agent",
        data: { to: anchor(to), score: r.score ?? null },
      });
    }
  }
  return out;
}

export function theographicItems(
  asked: Locus,
  chapter: number,
  body: TheographicChapter
): PassageItem[] {
  const out: PassageItem[] = [];
  const kinds = { people: "person", places: "place", events: "event" } as const;
  for (const [group, kind] of Object.entries(kinds) as Array<
    [keyof typeof kinds, string]
  >) {
    for (const row of body.chapter?.[group] ?? []) {
      const verses = row.verses ?? [];
      if (
        asked.type !== "chapter" &&
        asked.type !== "book" &&
        !touches(asked.book, chapter, verses, asked)
      )
        continue;
      const at = versesLocus(asked.book, chapter, verses);
      if (!at) continue;
      const { id, name, apiLink, verses: _v, ...rest } = row;
      out.push({
        source: "scripture",
        kind,
        locus: anchor(at),
        title: name,
        ...(apiLink ? { link: apiLink } : {}),
        from: "scripture-agent",
        data: { id, verses, ...rest },
      });
    }
  }
  return out;
}

export function writingItems(
  asked: Locus,
  chapter: number,
  body: WritingsAnswer
): PassageItem[] {
  const w = body.writings;
  if (!w) return [];
  const chapterLocus = locusOf(asked.book, chapter)!;
  const bookLocus = locusOf(asked.book)!;
  const groups: Array<[string, WritingEntry[] | undefined]> = [
    ["witness", w.witnesses?.ofBook],
    ["writing", w.period],
    ["writing", w.later],
    ["commentary", w.commentary],
  ];
  const out: PassageItem[] = [];
  const seen = new Set<string>();
  for (const [kind, rows] of groups)
    for (const row of rows ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const at = row.verses?.length
        ? versesLocus(asked.book, chapter, row.verses)
        : row.scope === "book" || kind === "witness"
          ? bookLocus
          : chapterLocus;
      if (!at || !overlaps(at.span, asked.span)) continue;
      out.push({
        source: "content",
        kind,
        locus: anchor(at),
        title: row.title,
        ...(row.why ? { detail: row.why } : {}),
        ...(row.links?.[0]?.url ? { link: row.links[0].url } : {}),
        from: "scripture-agent",
        data: {
          id: row.id,
          ...(row.author ? { author: row.author } : {}),
          ...(row.kind ? { form: row.kind } : {}),
          ...(row.date ? { date: row.date } : {}),
          ...(row.links ? { links: row.links } : {}),
        },
      });
    }
  return out;
}

interface Offering {
  owner: string;
  shelf: string;
  entryId: string;
  passage: string;
  kind: string;
  title: string;
  markdownPath?: string | null;
}

export function offeringItems(
  asked: Locus,
  offerings: Offering[]
): PassageItem[] {
  const out: PassageItem[] = [];
  for (const o of offerings) {
    const at = parseLocus(o.passage);
    if (!at || !overlaps(at.span, asked.span)) continue;
    out.push({
      source: "registry",
      kind: "offering",
      locus: anchor(at),
      title: o.title,
      data: {
        owner: o.owner,
        shelf: o.shelf,
        entryId: o.entryId,
        form: o.kind,
        markdownPath: o.markdownPath ?? null,
      },
    });
  }
  return out;
}

export function personItems(
  asked: Locus,
  marks: Array<Record<string, unknown>>
): PassageItem[] {
  const out: PassageItem[] = [];
  for (const m of marks) {
    if (m.deleted) continue;
    const at = parseLocus(String(m.aboutPassage ?? ""));
    if (!at || !overlaps(at.span, asked.span)) continue;
    const type = m["@type"];
    if (type === "seed:Highlight")
      out.push({
        source: "person",
        kind: "highlight",
        locus: anchor(at),
        title: at.alias,
        data: {
          id: m["@id"],
          color:
            m.customColor ??
            String(m.highlightColor ?? "").replace(/^seed:highlightcolor-/, ""),
        },
      });
    else if (type === "seed:Annotation")
      out.push({
        source: "person",
        kind: "note",
        locus: anchor(at),
        title: String(m.note ?? ""),
        data: { id: m["@id"], ...(m.tag ? { tags: m.tag } : {}) },
      });
  }
  return out;
}

const failed = (e: unknown): SourceReport => ({
  ok: false,
  count: 0,
  error: e instanceof Error ? e.message : String(e),
});

/** Ask every source for the locus at once; one that fails is reported, not fatal. */
export async function composePassage(
  env: BibleEnv & PlatformEnv,
  asked: Locus,
  person?: PersonMarks
): Promise<{
  items: PassageItem[];
  sources: Partial<Record<PassageSource, SourceReport>>;
}> {
  const chapters = chaptersOf(asked);
  const verse = asked.type === "verse" ? { verse: asked.verse } : {};
  const gather = async (
    fn: () => Promise<PassageItem[]>
  ): Promise<{ items: PassageItem[]; report: SourceReport }> => {
    try {
      const items = await fn();
      return { items, report: { ok: true, count: items.length } };
    } catch (e) {
      return { items: [], report: failed(e) };
    }
  };
  const perChapter = (fn: (c: number) => Promise<PassageItem[]>) => async () =>
    (await Promise.all(chapters.map(fn))).flat();
  const [scripture, content, registry, mine] = await Promise.all([
    gather(
      perChapter(async (c) => {
        const ask = (dataset: string) =>
          askScripture(env, "read-dataset", {
            dataset,
            path: `${asked.book}/${c}`,
          });
        const [x, t] = await Promise.all([
          ask("open-cross-ref"),
          ask("theographic"),
        ]);
        return [
          ...crossReferenceItems(asked, c, x as CrossRefChapter),
          ...theographicItems(asked, c, t as TheographicChapter),
        ];
      })
    ),
    gather(
      perChapter(async (c) =>
        writingItems(
          asked,
          c,
          (await askScripture(env, "passage-writings", {
            book: asked.book,
            chapter: c,
            ...verse,
          })) as WritingsAnswer
        )
      )
    ),
    // The registry matches by verse span itself: one ask for the whole locus, a range across chapters included.
    gather(async () => {
      const out = await platformGet<{ offerings?: Offering[] }>(
        env,
        `/registry/offerings?passage=${encodeURIComponent(seedRef(asked))}`
      );
      return offeringItems(asked, out.offerings ?? []);
    }),
    person
      ? gather(
          perChapter(async (c) =>
            personItems(asked, await person(`${asked.book}.${c}`))
          )
        )
      : null,
  ]);
  return {
    items: [
      ...(mine?.items ?? []),
      ...scripture.items,
      ...content.items,
      ...registry.items,
    ],
    sources: {
      scripture: scripture.report,
      content: content.report,
      registry: registry.report,
      ...(mine ? { person: mine.report } : {}),
    },
  };
}

/** The route; `personFor` turns the request's bearer into the reader's own marks, or null when signed out. */
export function passageRoutes<E extends BibleEnv & PlatformEnv>(
  personFor: (c: {
    req: { raw: Request };
    env: E;
  }) => Promise<PersonMarks | null>
) {
  const app = new Hono<{ Bindings: E }>();
  app.get("/api/passage/:ref", async (c) => {
    const asked = parseLocus(decodeURIComponent(c.req.param("ref")));
    if (!asked)
      return c.json(
        {
          ok: false,
          error: "not a place in the Bible (try John.3.16 or JHN.3)",
        },
        400
      );
    if (asked.type === "book")
      return c.json(
        {
          ok: false,
          error:
            "ask for a chapter, a verse or a range — a whole book is too much at once",
        },
        400
      );
    const person = await personFor(c).catch(() => null);
    const { items, sources } = await composePassage(
      c.env,
      asked,
      person ?? undefined
    );
    return c.json(
      {
        ok: true,
        locus: anchor(asked),
        count: items.length,
        items,
        sources,
      },
      200,
      { "cache-control": person ? "private, no-store" : "public, max-age=300" }
    );
  });
  return app;
}
