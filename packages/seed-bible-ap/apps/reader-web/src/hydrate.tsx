// TAKING OVER THE EDGE-RENDERED CHAPTER — before the reader state boots, the client adopts the markup the Worker
// rendered (entry-server.tsx `ChapterShell`) as a live Preact tree, without touching the DOM, when three things
// hold: the markup is for THIS URL, the seed carries this chapter, and the page came from this build. Otherwise
// it declines — one plain client render of the chapter when the seed has it, else the root is cleared — and never
// throws: a broken seed or stale page costs a repaint, never the app. The full App replaces the shell once the
// state is ready (main.tsx).
import { hydrate, render } from "preact";
import { ChapterShell, SSR_BUILD_ATTR, SSR_ROUTE_ATTR } from "./entry-server";
import type { TranslationBookChapter } from "./backend/bible";
import { parseRoute, routeOf, type ChapterRoute } from "./state/reading/route";

export type HydrateOutcome = "hydrated" | "rendered" | "cleared" | "no-markup";

export interface HydrateInput {
  /** The page's path (`location.pathname`). */
  pathname: string;
  /** `window.__SB_SEED__`, when the page carried one. */
  seed: unknown;
  /** This bundle's build id. */
  buildId: string;
}

/** The chapter the seed holds for a route, or null (the seed is keyed by the API URL the page fetched). */
export function seededChapter(
  seed: unknown,
  route: ChapterRoute
): TranslationBookChapter | null {
  if (!seed || typeof seed !== "object") return null;
  const suffix = `/api/${route.translationId}/${route.bookId}/${route.chapterNumber}.json`;
  for (const [url, value] of Object.entries(seed as Record<string, unknown>)) {
    if (!url.endsWith(suffix) || !value || typeof value !== "object") continue;
    const doc = value as TranslationBookChapter;
    if (doc.chapter && doc.book && doc.translation) return doc;
  }
  return null;
}

/** Why the markup in `root` cannot be adopted for this page, or null when it can. */
export function hydrationProblem(
  root: Element,
  input: HydrateInput
): string | null {
  const route = parseRoute(input.pathname);
  if (!route) return "not a chapter URL";
  const shell = root.firstElementChild;
  if (!shell) return "no markup";
  const forRoute = shell.getAttribute(SSR_ROUTE_ATTR);
  if (forRoute !== routeOf(route))
    return `markup is for ${forRoute ?? "no route"}`;
  const build = shell.getAttribute(SSR_BUILD_ATTR);
  if (build !== input.buildId)
    return `markup is from build ${build ?? "unknown"}`;
  if (!seededChapter(input.seed, route)) return "no seed for this chapter";
  return null;
}

export function hydrateChapter(
  root: Element,
  input: HydrateInput
): HydrateOutcome {
  try {
    const route = parseRoute(input.pathname);
    const chapter = route ? seededChapter(input.seed, route) : null;
    if (route && chapter && hydrationProblem(root, input) === null) {
      hydrate(<ChapterShell chapter={chapter} buildId={input.buildId} />, root);
      return "hydrated";
    }
    if (!root.firstElementChild && !chapter) return "no-markup";
    if (chapter) {
      render(<ChapterShell chapter={chapter} buildId={input.buildId} />, root);
      return "rendered";
    }
    // Markup Preact never rendered is not its to remove: clear the root itself so the App starts clean.
    root.replaceChildren();
    return "cleared";
  } catch {
    try {
      root.replaceChildren();
    } catch {
      /* the App renders over whatever is there */
    }
    return "cleared";
  }
}
