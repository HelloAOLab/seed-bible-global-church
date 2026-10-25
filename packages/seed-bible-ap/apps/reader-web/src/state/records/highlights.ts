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
  /** A colour of the reader's own (#rrggbb), drawn in place of colorId. */
  customColor?: string;
  verse: number | [number, number];
}

/** The twelve as the default theme draws them (base.css), to name the listed colour nearest a reader's own. */
const DEFAULT_HEX: Record<string, string> = {
  yellow: "#fff59d",
  green: "#a5d6a7",
  cyan: "#80deea",
  blue: "#90caf9",
  red: "#ef9a9a",
  magenta: "#ea80fc",
  pink: "#f48fb1",
  purple: "#ce93d8",
  orange: "#ffcc80",
  cream: "#fff8e1",
  gray: "#cfd8dc",
  tan: "#e0c9a6",
};

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The listed colour closest to a reader's own: what a reader that cannot draw custom colours shows instead. */
export function nearestColorId(hex: string): HighlightColorId {
  const [r, g, b] = rgb(hex);
  let best: HighlightColorId = "yellow";
  let bestD = Infinity;
  for (const id of HIGHLIGHT_COLORS) {
    const [r2, g2, b2] = rgb(DEFAULT_HEX[id]!);
    const d = (r! - r2!) ** 2 + (g! - g2!) ** 2 + (b! - b2!) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
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
      ...(it.customColor ? { customColor: it.customColor } : {}),
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
    heldBy?: string,
    customColor?: string
  ): Highlight => {
    const passage = passageOf(chapter, start, end);
    return {
      "@id": `urn:seed:highlight:${passage}`,
      "@type": "seed:Highlight",
      heldBy: heldBy ?? identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      highlightColor,
      ...(customColor ? { customColor } : {}),
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
          make(
            chapter,
            s.start,
            start - 1,
            it.highlightColor,
            it.heldBy,
            it.customColor
          )
        );
      if (s.end > end)
        await buckets.put(
          "highlights",
          chapter,
          make(
            chapter,
            end + 1,
            s.end,
            it.highlightColor,
            it.heldBy,
            it.customColor
          )
        );
    }
    await tombstone(chapter, hit);
  }

  /** Colour `start..end` of a chapter — a listed colour, or a reader's own (#rrggbb); the rest of any highlight it
   *  overlaps stays, and touching highlights of exactly the same colour join it. */
  async function set(
    chapterRef: string,
    start: number,
    end: number,
    colorId: HighlightColorId | `#${string}`
  ) {
    const chapter = chapterOf(chapterRef);
    const custom = colorId.startsWith("#") ? colorId.toLowerCase() : undefined;
    const color = conceptIri(
      "highlightcolor",
      custom ? nearestColorId(custom) : colorId
    );
    await carve(chapter, start, end);
    const touching = live(chapter).filter((it) => {
      if (it.highlightColor !== color || it.customColor !== custom)
        return false;
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
    await buckets.put(
      "highlights",
      chapter,
      make(chapter, from, to, color, undefined, custom)
    );
  }

  /** Take the highlight off these verses only; the rest of a longer highlight stays. */
  async function clear(chapterRef: string, start: number, end = start) {
    await carve(chapterOf(chapterRef), start, end);
  }

  return { forChapter, set, clear, colors: HIGHLIGHT_COLORS };
}

export type Highlights = ReturnType<typeof createHighlights>;
