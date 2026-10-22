// SSR — what the Worker renders for a chapter URL before the app takes over: the reader's header and the chapter
// column as the client would draw them (the same `renderChapterContent`, so a crawler and a slow connection see
// the text), the page title and description, and a seed the client's own API instance reuses instead of
// re-fetching the data the page already carries (`FreeUseBibleAPI.seedResponseCache`).
import {
  markdownBlocks,
  sharedSummary,
  type SharedPage,
} from "./state/social/sharedPage";
import { render } from "preact-render-to-string";
import {
  FreeUseBibleAPI,
  FREE_USE_BIBLE_API_ENDPOINT,
  type TranslationBookChapter,
} from "./backend/bible";
import {
  renderChapterContent,
  getVersePlainText,
} from "./components/reader/chapterContent";
import { routeOf, type ChapterRoute } from "./state/reading/route";
import { BUILD_ID } from "./build";

export const SEED_GLOBAL = "__SB_SEED__";
/** On the shell's root element: which chapter URL the markup is for, and which build rendered it (hydrate.tsx). */
export const SSR_ROUTE_ATTR = "data-sb-route";
export const SSR_BUILD_ATTR = "data-sb-build";

export interface RenderedChapter {
  html: string;
  title: string;
  description: string;
  lang: string;
  seed: Record<string, unknown>;
}

const SCRIPTURE_DEFAULTS = {
  showVerseNumbers: true,
  showHeadings: true,
  showFootnotes: true,
  showRedLettering: true,
  showHighlights: false,
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function chapterDescription(
  chapter: TranslationBookChapter,
  max = 160
): string {
  let out = "";
  for (const e of chapter.chapter.content) {
    if (!e || typeof e !== "object" || e.type !== "verse") continue;
    out += (out ? " " : "") + getVersePlainText(e.content);
    if (out.length >= max) break;
  }
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

/**
 * The chapter as the Worker renders it and as the client first adopts it (hydrate.tsx): the reader's header and the
 * chapter column, no interactive state. The root carries the route and the build so the client can tell whether
 * the markup is its own to adopt.
 */
export function ChapterShell({
  chapter,
  buildId = BUILD_ID,
}: {
  chapter: TranslationBookChapter;
  buildId?: string;
}) {
  const label = chapter.translation.shortName ?? chapter.translation.id;
  const attrs = {
    [SSR_ROUTE_ATTR]: routeOf({
      translationId: chapter.translation.id,
      bookId: chapter.book.id,
      chapterNumber: chapter.chapter.number,
    }),
    [SSR_BUILD_ATTR]: buildId,
  };
  return (
    <div class="sb-app sb-app-ssr" {...attrs}>
      <main class="sb-app-main">
        <div class="sb-panes-layout" data-layout="single">
          <div class="sb-pane-shell sb-pane-slot-1">
            <div class="sb-pane-reader-outer">
              <div class="sb-pane-reader">
                <div class="sb-bible-reader sb-font-size-m">
                  <div class="sb-bible-reader-header">
                    <div class="sb-bible-reader-heading">
                      <h2 class="sb-bible-reader-title">
                        <span class="sb-bible-reader-book">
                          {chapter.book.name}
                        </span>
                        <span
                          class="sb-bible-reader-title-sep"
                          aria-hidden="true"
                        >
                          {" "}
                        </span>
                        <span class="sb-bible-reader-chapter">
                          {chapter.chapter.number}
                        </span>
                      </h2>
                      <span class="sb-bible-reader-translation">{label}</span>
                    </div>
                  </div>
                  <div class="sb-bible-reader-content">
                    <div class="sb-bible-reader-main-content">
                      <div class="sb-chapter-content">
                        {renderChapterContent(chapter, {
                          selectedVerses: [],
                          highlights: [],
                          notes: [],
                          scriptureElements: SCRIPTURE_DEFAULTS,
                          onVerseClick: () => {},
                          onOpenFootnote: () => {},
                          onAnnotationVerseClick: () => {},
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The chapter's markup for `#root`, without any interactive state. */
export function renderChapterShell(
  chapter: TranslationBookChapter,
  buildId = BUILD_ID
): string {
  return render(<ChapterShell chapter={chapter} buildId={buildId} />);
}

/** The text of a verse range, for a shared link's title and description. */
export function versesDescription(
  chapter: TranslationBookChapter,
  [start, end]: [number, number],
  max = 300
): string {
  let out = "";
  for (const e of chapter.chapter.content) {
    if (!e || typeof e !== "object" || e.type !== "verse") continue;
    if (e.number < start || e.number > end) continue;
    out += (out ? " " : "") + getVersePlainText(e.content);
  }
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}

export async function renderChapterPage(
  route: ChapterRoute,
  endpoint = FREE_USE_BIBLE_API_ENDPOINT,
  verses: [number, number] | null = null
): Promise<RenderedChapter | null> {
  const api = new FreeUseBibleAPI(endpoint);
  try {
    const [chapter] = await Promise.all([
      api.getTranslationBookChapter(
        route.translationId,
        route.bookId,
        route.chapterNumber
      ),
      api.getTranslationBooks(route.translationId).catch(() => null),
    ]);
    const label = chapter.translation.shortName ?? chapter.translation.id;
    const ref = verses
      ? `${chapter.book.name} ${chapter.chapter.number}:${verses[0] === verses[1] ? verses[0] : `${verses[0]}–${verses[1]}`}`
      : `${chapter.book.name} ${chapter.chapter.number}`;
    const shared = verses ? versesDescription(chapter, verses) : "";
    return {
      html: renderChapterShell(chapter),
      title: `${ref} · ${label} · Seed Bible`,
      description: shared || chapterDescription(chapter),
      lang: chapter.translation.language?.slice(0, 2) ?? "en",
      seed: api.snapshotResponseCache(),
    };
  } catch {
    return null;
  }
}

/** The index.html with the rendered chapter, title, description and seed in place. */
/** Open Graph for a chapter page: what a shared link shows. */
export function ogTags(
  page: RenderedChapter,
  url: string,
  origin: string
): string {
  const e = escapeHtml;
  return [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${e(page.title)}" />`,
    `<meta property="og:description" content="${e(page.description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:site_name" content="Seed Bible" />`,
    `<meta property="og:image" content="${e(origin)}/og.jpg" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<link rel="canonical" href="${e(url)}" />`,
  ].join("");
}

export function injectIntoIndex(
  indexHtml: string,
  page: RenderedChapter,
  url?: string
): string {
  const seedScript = `<script>window.${SEED_GLOBAL}=${JSON.stringify(page.seed).replace(/</g, "\\u003c")}</script>`;
  return indexHtml
    .replace(/<html lang="[^"]*"/, `<html lang="${escapeHtml(page.lang)}"`)
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}" />${url ? ogTags(page, url, new URL(url).origin) : ""}`
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${page.html}</div>${seedScript}`
    );
}

export const SHARED_GLOBAL = "__SB_SHARED__";

const SHARED_KIND_LABEL: Record<SharedPage["kind"], string> = {
  note: "Note",
  playlist: "Playlist",
  plan: "Reading plan",
  customization: "Church theme",
};

/** A shared page's static markup: what a crawler or a link preview reads before the app takes over. */
export function renderSharedHtml(page: SharedPage): string {
  const e = escapeHtml;
  const blocks = markdownBlocks(page.markdown)
    .map((b) =>
      b.type === "heading"
        ? b.level === 1
          ? ""
          : `<h${b.level + 1}>${e(b.text)}</h${b.level + 1}>`
        : b.type === "list"
          ? `<ul>${b.items.map((i) => `<li>${e(i)}</li>`).join("")}</ul>`
          : `<p>${e(b.text)}</p>`
    )
    .join("");
  return `<main class="sb-shared-page sb-shared-page-ssr"><p class="sb-shared-kind">${e(SHARED_KIND_LABEL[page.kind])} · ${e(page.shelf)}</p><h1>${e(page.title)}</h1>${blocks}</main>`;
}

/** The index.html with a shared page's title, preview tags, markup and the loaded page for the app to reuse. */
export function injectSharedIntoIndex(
  indexHtml: string,
  page: SharedPage,
  url: string
): string {
  const title = `${page.title} · ${SHARED_KIND_LABEL[page.kind]} · Seed Bible`;
  const description =
    sharedSummary(page) || `${SHARED_KIND_LABEL[page.kind]} by ${page.shelf}`;
  const e = escapeHtml;
  const og = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${e(page.title)}" />`,
    `<meta property="og:description" content="${e(description)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    `<meta property="og:site_name" content="Seed Bible" />`,
    `<meta property="og:image" content="${e(new URL(url).origin)}/og.jpg" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<link rel="canonical" href="${e(url)}" />`,
  ].join("");
  const seed = `<script>window.${SHARED_GLOBAL}=${JSON.stringify(page).replace(/</g, "\\u003c")}</script>`;
  return indexHtml
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${e(title)}</title><meta name="description" content="${e(description)}" />${og}`
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderSharedHtml(page)}</div>${seed}`
    );
}
