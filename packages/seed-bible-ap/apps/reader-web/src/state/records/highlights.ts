// HIGHLIGHTS — ported from packages/seed-bible HighlightsManager (docs/porting/HighlightsManager.md): a chapter's
// highlights are its bucket's live `seed:Highlight` items. Setting or clearing verses changes only those verses: a
// highlight they overlap is cut back to the verses outside them (clearing verse 5 of 1–10 leaves 1–4 and 6–10), and
// a new highlight joins the touching ones of its colour into one. Nothing here touches the network: the bucket
// store does.
import { computed, type ReadonlySignal } from "@preact/signals";
import {
  HIGHLIGHT_COLORS,
  conceptIri,
  type Highlight,
} from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso, passageOf, spanOf, overlaps } from "./marks";

/** The shape the reader renders (the old `ChapterHighlight`): a colour over one verse or an inclusive range. */
export interface ChapterHighlight {
  id: string;
  colorId: string;
  verse: number | [number, number];
}

export type HighlightColorId = (typeof HIGHLIGHT_COLORS)[number];

const COLOR_PREFIX = conceptIri("highlightcolor", "");

export const colorIdOf = (highlightColor: string): string =>
  highlightColor.startsWith(COLOR_PREFIX)
    ? highlightColor.slice(COLOR_PREFIX.length)
    : highlightColor;

export function toChapterHighlights(
  items: readonly unknown[]
): ChapterHighlight[] {
  const out: ChapterHighlight[] = [];
  for (const it of items as Highlight[]) {
    if (it["@type"] !== "seed:Highlight" || it.deleted) continue;
    const { start, end } = spanOf(it.aboutPassage);
    out.push({
      id: it["@id"],
      colorId: colorIdOf(it.highlightColor),
      verse: start === end ? start : [start, end],
    });
  }
  return out;
}

export function createHighlights(
  buckets: BucketStore,
  identity: () => ReaderIdentity | null
) {
  const cache = new Map<string, ReadonlySignal<ChapterHighlight[]>>();

  function forChapter(chapterRef: string): ReadonlySignal<ChapterHighlight[]> {
    const c = chapterOf(chapterRef);
    let s = cache.get(c);
    if (!s) {
      const ob = buckets.get("highlights", c);
      s = computed(() => toChapterHighlights(ob.bucket.value["@graph"]));
      cache.set(c, s);
    }
    return s;
  }

  const live = (chapterRef: string): Highlight[] =>
    (
      buckets.get("highlights", chapterOf(chapterRef)).bucket.value[
        "@graph"
      ] as Highlight[]
    ).filter((it) => it["@type"] === "seed:Highlight" && !it.deleted);

  async function tombstone(chapterRef: string, items: Highlight[]) {
    for (const it of items)
      await buckets.put("highlights", chapterOf(chapterRef), {
        ...it,
        deleted: true,
        // The write this delete replaces: a plain update for the merge, whatever the clocks say.
        supersedes: it.opId,
        opId: newOpId(),
        updatedAt: nowIso(),
      });
  }

  const make = (
    chapter: string,
    start: number,
    end: number,
    highlightColor: string,
    heldBy?: string
  ): Highlight => {
    const passage = passageOf(chapter, start, end);
    return {
      "@id": `urn:seed:highlight:${passage}`,
      "@type": "seed:Highlight",
      heldBy: heldBy ?? identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      highlightColor,
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  };

  /** Take `start..end` out of the chapter's highlights: each one it overlaps goes, and comes back as the verses
   *  outside it, in its own colour. */
  async function carve(chapter: string, start: number, end: number) {
    const hit = live(chapter).filter((it) =>
      overlaps(spanOf(it.aboutPassage), { chapter, start, end })
    );
    // The kept pieces go in before the old highlight goes, so the verses outside never blink off.
    for (const it of hit) {
      const s = spanOf(it.aboutPassage);
      if (s.start < start)
        await buckets.put(
          "highlights",
          chapter,
          make(chapter, s.start, start - 1, it.highlightColor, it.heldBy)
        );
      if (s.end > end)
        await buckets.put(
          "highlights",
          chapter,
          make(chapter, end + 1, s.end, it.highlightColor, it.heldBy)
        );
    }
    await tombstone(chapter, hit);
  }

  /** Colour `start..end` of a chapter; the rest of any highlight it overlaps stays, and touching highlights of the
   *  same colour join it. */
  async function set(
    chapterRef: string,
    start: number,
    end: number,
    colorId: HighlightColorId
  ) {
    const chapter = chapterOf(chapterRef);
    const color = conceptIri("highlightcolor", colorId);
    await carve(chapter, start, end);
    const touching = live(chapter).filter((it) => {
      if (it.highlightColor !== color) return false;
      const s = spanOf(it.aboutPassage);
      return s.end === start - 1 || s.start === end + 1;
    });
    let from = start;
    let to = end;
    for (const it of touching) {
      const s = spanOf(it.aboutPassage);
      from = Math.min(from, s.start);
      to = Math.max(to, s.end);
    }
    await tombstone(chapter, touching);
    await buckets.put("highlights", chapter, make(chapter, from, to, color));
  }

  /** Take the highlight off these verses only; the rest of a longer highlight stays. */
  async function clear(chapterRef: string, start: number, end = start) {
    await carve(chapterOf(chapterRef), start, end);
  }

  return { forChapter, set, clear, colors: HIGHLIGHT_COLORS };
}

export type Highlights = ReturnType<typeof createHighlights>;
