// DEFAULT CONTENT — ported from packages/default-content-extension: the videos and articles the old reader offered
// for every chapter (Expedition Bible, The Chosen and the rest of its curated list, and BibleProject's book
// overviews, trimmed to what Discover shows). Static data shipped with the app and loaded only when Discover asks;
// opening one only opens its page in a new tab — nothing is sent anywhere.
import type { DiscoverItem, ExtensionRegistration } from "../host";

export interface ContentReference {
  book: string;
  chapter: number;
  endChapter?: number;
  verse?: number;
  endVerse?: number;
}
export interface CuratedItem {
  id: string;
  title: string;
  author: string;
  description: string;
  url: string;
  imageUrl?: string;
  references: ContentReference[];
}
export interface BibleProjectItem {
  book: string;
  chapterStart: number;
  chapterEnd: number;
  startSeconds: number;
  section: string;
  title: string;
  description: string;
  url: string;
  image: string;
}

const covers = (r: ContentReference, book: string, chapter: number) =>
  r.book === book &&
  chapter >= r.chapter &&
  chapter <= (r.endChapter ?? r.chapter);

/** The curated items and BibleProject sections for a chapter, curated first. */
export function contentForChapter(
  book: string,
  chapter: number,
  curated: CuratedItem[],
  bibleProject: BibleProjectItem[]
): DiscoverItem[] {
  const out: DiscoverItem[] = [];
  for (const item of curated) {
    const ref = item.references.find((r) => covers(r, book, chapter));
    if (!ref) continue;
    out.push({
      id: `curated:${item.id}`,
      title: item.title,
      description: `${item.author}${ref.verse ? ` · ${chapter}:${ref.verse}${ref.endVerse && ref.endVerse !== ref.verse ? `–${ref.endVerse}` : ""}` : ""}`,
      icon: /youtube\.com|youtu\.be|vimeo\.com/.test(item.url)
        ? "play_circle"
        : "article",
    });
  }
  const seen = new Set<string>();
  for (const v of bibleProject) {
    if (v.book !== book || chapter < v.chapterStart || chapter > v.chapterEnd)
      continue;
    if (seen.has(v.url)) continue;
    seen.add(v.url);
    out.push({
      id: `bibleproject:${v.url}`,
      title: `${v.title}${v.section ? ` — ${v.section}` : ""}`,
      description: "BibleProject",
      icon: "play_circle",
    });
  }
  return out;
}

/** Where an item opens: its own page (a BibleProject video at the moment this chapter starts). */
export function urlOf(
  id: string,
  curated: CuratedItem[],
  bibleProject: BibleProjectItem[]
): string | null {
  if (id.startsWith("curated:")) {
    const it = curated.find((c) => `curated:${c.id}` === id);
    return it?.url ?? null;
  }
  const url = id.slice("bibleproject:".length);
  return bibleProject.some((v) => v.url === url) ? url : null;
}

let data: Promise<{
  curated: CuratedItem[];
  bibleProject: BibleProjectItem[];
}> | null = null;
const load = () =>
  (data ??= Promise.all([
    import("./discoveredContent.json"),
    import("./bibleProject.json"),
  ]).then(([a, b]) => ({
    curated: a.default as CuratedItem[],
    bibleProject: b.default as BibleProjectItem[],
  })));

const defaultContent: ExtensionRegistration = {
  id: "default-content",
  label: "Videos and articles",
  description:
    "BibleProject overviews and curated videos for the chapter on screen, in Discover.",
  init: function* (ctx) {
    yield ctx.discover.registerProvider({
      id: "default-content",
      label: "Videos and articles",
      discover: async (d) => {
        const [book, ch] = d.chapterRef.split(".");
        const { curated, bibleProject } = await load();
        return contentForChapter(book!, Number(ch), curated, bibleProject).map(
          (it) => ({
            ...it,
            onOpen: () => {
              const url = urlOf(it.id, curated, bibleProject);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            },
          })
        );
      },
    });
  },
};

export default defaultContent;
