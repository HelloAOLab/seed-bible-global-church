// SSR — what the Worker renders for a chapter URL before the app takes over: the reader's header and the chapter
// column as the client would draw them (the same `renderChapterContent`, so a crawler and a slow connection see
// the text), the page title and description, and a seed the client's own API instance reuses instead of
// re-fetching the data the page already carries (`FreeUseBibleAPI.seedResponseCache`).
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
import type { ChapterRoute } from "./state/reading/route";

export const SEED_GLOBAL = "__SB_SEED__";

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

/** The chapter's markup for `#root`, without any interactive state. */
export function renderChapterShell(chapter: TranslationBookChapter): string {
  const label = chapter.translation.shortName ?? chapter.translation.id;
  return render(
    <div class="sb-app sb-app-ssr">
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

export async function renderChapterPage(
  route: ChapterRoute,
  endpoint = FREE_USE_BIBLE_API_ENDPOINT
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
    return {
      html: renderChapterShell(chapter),
      title: `${chapter.book.name} ${chapter.chapter.number} · ${label} · Seed Bible`,
      description: chapterDescription(chapter),
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
