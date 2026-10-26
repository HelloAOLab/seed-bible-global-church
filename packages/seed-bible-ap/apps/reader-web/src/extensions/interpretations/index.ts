// INTERPRETATIONS AND THE WRITINGS AROUND A CHAPTER (2026-10-25) — what the Scripture Agent now says about a verse beyond its
// text: the questions a translation had to decide there, the reading it chose (or kept open), the alternatives, the writings
// behind each, the story paths over the verse (`chapter-interpretations`); and, for any chapter of any translation, the writings
// of the book's own period and the later reception that name it, the copies of the book, the commentary on its verses
// (`passage-writings`). Both are asked through this reader's agent (/bible/api/…), read per chapter and kept on the device, and
// offered in Discover for the verses on screen; each has a pane with the full record. Nothing here is a judgement: the records
// list documented interpretations and writings within a declared corpus, never all that exist, and say so.
import { h } from "preact";
import { signal } from "@preact/signals";
import type { DiscoverItem, ExtensionRegistration } from "../host";
import { BIBLE_API_ENDPOINT } from "../../backend/bible";
import type { ReaderState } from "../../state";
import { InterpretationsPane, interpVerse } from "./InterpretationsPane";
import { WritingsPane } from "./WritingsPane";
import { verseSummary } from "./plain";
import "./interpretations.css";

export const INTERPRETATIONS_BASE_URL = `${BIBLE_API_ENDPOINT}api`;
/** The translation workbench, where a reviewer reads the evidence and proposes; a verse opens at /review/<OSIS book>/<ch>/<v>. */
export const WORKBENCH_URL = "https://workbench.faithnet.io";

export interface InterpretationQuestion {
  id: string;
  kind: string;
  text: string;
  status: string;
  atVerse: string;
  decided: {
    candidate: string;
    reading: string | null;
    origin: string | null;
    path: string | null;
    status: string;
    rationale: string | null;
    footnote: string | null;
    policyUse: string | null;
    circularityFlag: boolean;
  } | null;
  candidates: Array<{
    id: string;
    reading: string;
    origin: string;
    role: string;
    registerEntry?: string;
    /** A textual reading: the printed editions it is found in. */
    editions?: string[] | null;
  }>;
  /** What the published English expresses — an observation of the text, not the edition's decision. */
  observed?: {
    candidate: string;
    reading: string | null;
    method: string;
    how: string | null;
    reason?: string | null;
    model?: string;
    note?: string;
  } | null;
  writings: {
    consulted: Array<{
      work: string;
      authorDate: string | null;
      claims: number;
      sections: number;
      stances: Record<string, number>;
    }>;
    cited: Array<{
      id: string;
      source: string;
      authorDate: string | null;
      kind: string | null;
      stance: string | null;
      says: string | null;
      quote: string | null;
      informedDecision: boolean;
    }>;
    total: number;
    note?: string;
  };
  registerEntries: string[];
  compatibility: Array<{
    id: string;
    between: string[];
    state: string;
    rationale?: string;
  }>;
}
export interface InterpretationPath {
  id: string;
  origin: string;
  attributedTo: string | null;
  reviewStatus: string;
  verses: string[];
  choices: Array<{ question: string; chooses: string; supportedBy: string[] }>;
  leavesOpen: string[];
  assumptions: string[];
  consequences: Array<{ choice: string; kind: string; scope: string }>;
  materialEffect: string;
}
export interface InterpretedVerse {
  osis: string;
  usfm: string;
  chapter: number;
  verse: number;
  text: string;
  status: { stage: string; note: string } | null;
  interpretation: {
    questions: InterpretationQuestion[];
    paths: InterpretationPath[];
    note?: string;
  };
}
export interface ChapterInterpretations {
  edition: string;
  book: string;
  chapter: number;
  count: number;
  verses: InterpretedVerse[];
  note?: string;
}

export interface WritingItem {
  id: string;
  title: string;
  author: string | null;
  group: string;
  class: string;
  kind: string | null;
  date: string;
  range: { start: number; end: number; circa: boolean } | null;
  relation: string[];
  scope: "chapter" | "book";
  verses: number[] | null;
  links: Array<{ url: string; title: string }>;
  inWindow: boolean | null;
  why: string | null;
}
export interface CommentaryWork {
  work: string;
  label: string;
  date: string | null;
  group: string | null;
  language: string | null;
  family: string | null;
  edition: {
    id: string;
    versionTitle: string | null;
    licence: string | null;
    attributionRequired: boolean;
    source: string | null;
    partition: string;
  } | null;
  claims: number;
  verses: string[];
  cited: Array<{
    id: string;
    verse: string;
    locator: string;
    kind: string;
    stance: string | null;
    says: string;
    quote: string | null;
  }>;
  note?: string;
}
export interface PassageWritings {
  book: string;
  chapter: number;
  bookName: string;
  window: { ceiling: number | null; ceilingText: string | null; basis: string };
  witnesses: {
    ofBook: Array<{
      id: string;
      title: string;
      group: string;
      kind: string | null;
      date: string;
      range: { start: number; end: number } | null;
      links: Array<{ url: string; title: string }>;
      inWindow: boolean | null;
    }>;
    researched: {
      object: string;
      atlasDate: string;
      dating: string | null;
      range: string | null;
      discovered: string | null;
      image: {
        page: string;
        thumb: string;
        licence: string;
        credit: string | null;
      } | null;
      status: string;
    } | null;
  };
  period: WritingItem[];
  later: WritingItem[];
  commentary: CommentaryWork[];
  register: Array<{
    id: string;
    position: string;
    when: string | null;
    dateText: string | null;
    refs: string[];
  }>;
  counts: Record<string, number>;
  note: string;
  narrowedTo?: string;
}
export interface PassageWritingsAnswer {
  book: string;
  osisBook: string;
  chapter: number;
  verse: number | null;
  generated: string | null;
  writings: PassageWritings | null;
  note?: string;
}

type Cache = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
};

/** A record as every part of the reader can read it: the lists a record may leave out (the New Testament records have
 *  no story paths, register entries, compatibility or cited writings) are empty rather than missing. */
export function normalizeChapter(
  data: ChapterInterpretations
): ChapterInterpretations {
  return {
    ...data,
    verses: (data.verses ?? []).map((v) => ({
      ...v,
      interpretation: {
        ...v.interpretation,
        paths: v.interpretation?.paths ?? [],
        questions: (v.interpretation?.questions ?? []).map((q) => ({
          ...q,
          candidates: (q.candidates ?? []).map((c) => ({
            ...c,
            origin: c.origin ?? "",
            role: c.role ?? "",
          })),
          registerEntries: q.registerEntries ?? [],
          compatibility: q.compatibility ?? [],
          writings: {
            ...q.writings,
            consulted: q.writings?.consulted ?? [],
            cited: q.writings?.cited ?? [],
            total: q.writings?.total ?? q.writings?.consulted?.length ?? 0,
          },
        })),
      },
    })),
  };
}

/** The chapter's interpretation records, from the device when it has them (a chapter with none is kept as an empty answer). */
export async function loadChapterInterpretations(
  translationId: string,
  bookId: string,
  chapter: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<ChapterInterpretations | null> {
  const key = `interp1:${translationId}/${bookId}/${chapter}`;
  const hit = (await cache.get(key)) as ChapterInterpretations | undefined;
  if (hit) return normalizeChapter(hit);
  const res = await fetchImpl(
    `${INTERPRETATIONS_BASE_URL}/${translationId}/${bookId}/${chapter}/interpretations.json`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ChapterInterpretations;
  if (!Array.isArray(data.verses)) return null;
  await cache.set(key, data);
  return normalizeChapter(data);
}

/** The edition that carries interpretation records today (the Scripture Agent's RBS pilot). */
export const RECORDS_EDITION = "rbs";

/** The chapter's interpretation records in the translation being read — or, when it carries none, the RBS edition's,
 *  so a reader on BSB still finds them (said as RBS's, never as their translation's). `edition` is whose they are. */
export async function interpretationsFor(
  translationId: string,
  bookId: string,
  chapter: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<{ data: ChapterInterpretations; edition: string } | null> {
  const own = await loadChapterInterpretations(
    translationId,
    bookId,
    chapter,
    cache,
    fetchImpl
  ).catch(() => null);
  if (own?.verses.length || translationId.toLowerCase() === RECORDS_EDITION)
    return own ? { data: own, edition: translationId } : null;
  const rbs = await loadChapterInterpretations(
    RECORDS_EDITION,
    bookId,
    chapter,
    cache,
    fetchImpl
  ).catch(() => null);
  if (rbs?.verses.length) return { data: rbs, edition: RECORDS_EDITION };
  return own ? { data: own, edition: translationId } : null;
}

/** The writings around the chapter (edition-independent). */
export async function loadPassageWritings(
  bookId: string,
  chapter: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch
): Promise<PassageWritingsAnswer | null> {
  const key = `writings1:${bookId}/${chapter}`;
  const hit = (await cache.get(key)) as PassageWritingsAnswer | undefined;
  if (hit) return hit;
  const res = await fetchImpl(
    `${INTERPRETATIONS_BASE_URL}/writings/${bookId}/${chapter}.json`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as PassageWritingsAnswer;
  if (!("writings" in data)) return null;
  await cache.set(key, data);
  return data;
}

export const STATUS_WORDS: Record<string, string> = {
  "decided-for-edition": "decided for this edition",
  open: "open — nobody has decided it",
  "unresolved-by-policy":
    "left open on purpose — a later formulation does not settle the text",
};
export const statusWords = (s: string) =>
  STATUS_WORDS[s] ?? s.replace(/-/g, " ");

/** The verse a question sits at, as a number, so the selection can pick it out. */
const verseOf = (osis: string) => Number(osis.split(".")[2]);

/** Discover items for the interpretation records: one card per verse — never questions of several verses mixed — with
 *  the verse's words and what became of its questions; the selected verses' only, when they carry a record. */
export function interpretationItems(
  data: ChapterInterpretations,
  selectedVerses: number[],
  bookName: string = data.book
): Array<DiscoverItem & { verse: number }> {
  const wanted = selectedVerses.length
    ? data.verses.filter((v) => selectedVerses.includes(v.verse))
    : data.verses;
  return wanted.map((v) => ({
    id: v.osis,
    title: `${bookName} ${v.chapter}:${v.verse}`,
    description: `“${v.text}” · ${verseSummary(v)}`,
    icon: "forum",
    verse: v.verse,
  }));
}

/** Discover items for the writings: the book's period first, its copies, the commentary and the reception — the selected verses narrow. */
export function writingsItems(
  w: PassageWritings,
  selectedVerses: number[],
  max = 40
): Array<
  DiscoverItem & {
    kind: "period" | "later" | "witness" | "commentary" | "register";
    itemId: string;
  }
> {
  const keep = (it: WritingItem) =>
    !selectedVerses.length ||
    it.scope === "book" ||
    !it.verses?.length ||
    it.verses.some((v) => selectedVerses.includes(v));
  const out: Array<
    DiscoverItem & {
      kind: "period" | "later" | "witness" | "commentary" | "register";
      itemId: string;
    }
  > = [];
  const windowText = w.window.ceilingText
    ? `the book's time, by ${w.window.ceilingText}`
    : "the book's time";
  for (const it of w.period.filter(keep)) {
    out.push({
      id: `period:${it.id}`,
      title: it.title,
      description: `${it.date}${it.inWindow === true ? ` · in ${windowText}` : it.inWindow === false ? " · after the book's window" : ""}${it.verses?.length ? ` · names v. ${it.verses.join(", ")}` : it.scope === "book" ? " · names the book" : ""}`,
      icon: it.class === "realia" ? "history_edu" : "menu_book",
      section:
        it.class === "realia"
          ? "Inscriptions, records and the world of the book"
          : "Writings of the period",
      kind: "period",
      itemId: it.id,
    });
    if (out.length >= max) return out;
  }
  for (const c of w.commentary.filter(
    (c) =>
      !selectedVerses.length ||
      c.verses.some((v) => selectedVerses.includes(verseOf(v)))
  )) {
    out.push({
      id: `commentary:${c.work}`,
      title: c.label,
      description: `${c.date ?? ""}${c.date ? " · " : ""}${c.claims} claim${c.claims === 1 ? "" : "s"} on this chapter`,
      icon: "format_quote",
      section: "Commentary on the chapter (later readers)",
      kind: "commentary",
      itemId: c.work,
    });
    if (out.length >= max) return out;
  }
  for (const it of w.later.filter(keep)) {
    out.push({
      id: `later:${it.id}`,
      title: it.title,
      description: `${it.date} · reception${it.verses?.length ? ` · names v. ${it.verses.join(", ")}` : ""}`,
      icon: "account_balance",
      section: "Later reception",
      kind: "later",
      itemId: it.id,
    });
    if (out.length >= max) return out;
  }
  if (!selectedVerses.length) {
    for (const wit of w.witnesses.ofBook.slice(0, 6)) {
      out.push({
        id: `witness:${wit.id}`,
        title: wit.title,
        description: `${wit.date} · a copy of ${w.bookName}`,
        icon: "description",
        section: `Copies of ${w.bookName}`,
        kind: "witness",
        itemId: wit.id,
      });
      if (out.length >= max) return out;
    }
  }
  for (const e of w.register.filter(
    (e) =>
      !selectedVerses.length ||
      e.refs.some((r) =>
        selectedVerses.some((v) => new RegExp(`:${v}(?![0-9])`).test(r))
      )
  )) {
    out.push({
      id: `register:${e.id}`,
      title: `${e.id} · ${e.position}`,
      description: `reference chronology${e.when ? ` · ${e.when}` : ""} · ${e.refs.join(", ")}`,
      icon: "timeline",
      section: "Reference chronology",
      kind: "register",
      itemId: e.id,
    });
    if (out.length >= max) return out;
  }
  return out;
}

const interpretations: ExtensionRegistration = {
  id: "interpretations",
  label: "Interpretations & writings",
  description:
    "What a translation decided at a verse and why, the alternatives it kept, and the writings of the book's period and its later reception — in Discover, with a pane for the full record.",
  init: function* (ctx) {
    const state: ReaderState = ctx.state;
    yield ctx.panes.register({
      id: "interpretations",
      title: "Interpretations",
      render: () => h(InterpretationsPane, { state }),
    });
    yield ctx.panes.register({
      id: "writings",
      title: "Writings around this chapter",
      render: () => h(WritingsPane, { state }),
    });
    // Which verses of a chapter carry a record, read the first time the verse bar is drawn there (not on every page
    // turn: most readers never ask) — the bar then offers Interpretations exactly where there is something to show.
    const withRecords = signal<{ key: string; verses: ReadonlySet<number> }>({
      key: "",
      verses: new Set(),
    });
    let asked = "";
    const recordsAt = (chapterRef: string): ReadonlySet<number> => {
      const translationId = state.reading.translationId.value;
      const key = `${translationId}/${chapterRef}`;
      if (withRecords.value.key === key) return withRecords.value.verses;
      if (asked !== key) {
        asked = key;
        const [bookId, ch] = chapterRef.split(".");
        void interpretationsFor(
          translationId,
          bookId!,
          Number(ch),
          state.stores.chapters
        )
          .then((f) => {
            withRecords.value = {
              key,
              verses: new Set(f?.data.verses.map((v) => v.verse) ?? []),
            };
          })
          .catch(() => undefined);
      }
      return new Set();
    };
    yield ctx.tools.registerVerseTool({
      id: "interpretations",
      label: "Interpretations",
      icon: "forum",
      priority: 45,
      isVisible: (v) => {
        const at = recordsAt(v.chapterRef);
        return v.verses.some((n) => at.has(n));
      },
      onSelect: (v) => {
        // Just this verse: the one tapped (the first of a selection that carries a record).
        const n = v.verses.find((x) => withRecords.value.verses.has(x))!;
        interpVerse.value = { chapterRef: v.chapterRef, verse: n };
        ctx.panes.open("interpretations");
      },
    });
    yield ctx.toolbar.add({
      id: "writings",
      label: "Writings",
      icon: "history_edu",
      onSelect: () => ctx.panes.open("writings"),
    });
    yield ctx.discover.registerProvider({
      id: "interpretations",
      label: "Interpretations",
      discover: async (d) => {
        const [bookId, ch] = d.chapterRef.split(".");
        const found = await interpretationsFor(
          state.reading.translationId.value,
          bookId!,
          Number(ch),
          state.stores.chapters
        ).catch(() => null);
        if (!found) return [];
        const other =
          found.edition.toLowerCase() !==
          state.reading.translationId.value.toLowerCase();
        const bookName =
          d.books.find((b) => b.id === bookId)?.name ?? found.data.book;
        return interpretationItems(found.data, d.selectedVerses, bookName).map(
          (it) => ({
            ...it,
            ...(other
              ? {
                  description: `${found.edition.toUpperCase()} · ${it.description ?? ""}`,
                }
              : {}),
            onOpen: () => {
              interpVerse.value = { chapterRef: d.chapterRef, verse: it.verse };
              ctx.panes.open("interpretations");
            },
          })
        );
      },
    });
    yield ctx.discover.registerProvider({
      id: "writings",
      label: "Writings",
      discover: async (d) => {
        const [bookId, ch] = d.chapterRef.split(".");
        const data = await loadPassageWritings(
          bookId!,
          Number(ch),
          state.stores.chapters
        ).catch(() => null);
        if (!data?.writings) return [];
        return writingsItems(data.writings, d.selectedVerses).map((it) => ({
          ...it,
          onOpen: () => ctx.panes.open("writings"),
        }));
      },
    });
  },
};
export default interpretations;
