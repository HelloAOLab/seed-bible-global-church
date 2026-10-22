// HIGHLIGHTS — ported from packages/seed-bible HighlightsManager (docs/porting/HighlightsManager.md): a chapter's
// highlights are its bucket's live `seed:Highlight` items; setting one tombstones whatever it overlaps; clearing
// tombstones what covers the verse. Nothing here touches the network: the bucket store does.
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
        opId: newOpId(),
        updatedAt: nowIso(),
      });
  }

  /** Colour `start..end` of a chapter; older highlights touching those verses go. */
  async function set(
    chapterRef: string,
    start: number,
    end: number,
    colorId: HighlightColorId
  ) {
    const chapter = chapterOf(chapterRef);
    const span = { chapter, start, end };
    await tombstone(
      chapter,
      live(chapter).filter((it) => overlaps(spanOf(it.aboutPassage), span))
    );
    const passage = passageOf(chapter, start, end);
    const item: Highlight = {
      "@id": `urn:seed:highlight:${passage}`,
      "@type": "seed:Highlight",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      highlightColor: conceptIri("highlightcolor", colorId),
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("highlights", chapter, item);
  }

  /** Remove every highlight covering any of these verses. */
  async function clear(chapterRef: string, start: number, end = start) {
    const chapter = chapterOf(chapterRef);
    await tombstone(
      chapter,
      live(chapter).filter((it) =>
        overlaps(spanOf(it.aboutPassage), { chapter, start, end })
      )
    );
  }

  return { forChapter, set, clear, colors: HIGHLIGHT_COLORS };
}

export type Highlights = ReturnType<typeof createHighlights>;
