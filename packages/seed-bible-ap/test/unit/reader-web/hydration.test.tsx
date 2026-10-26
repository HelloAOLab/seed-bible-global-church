// THE CLIENT ADOPTS THE EDGE-RENDERED CHAPTER (test-plan A3.5): what the Worker rendered becomes a live tree with
// no change to the DOM when the markup is for this URL, the seed holds the chapter and the page is this build;
// a mismatch on any of the three declines into one plain client render (or a cleared root), never a throw.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderChapterPage,
  SSR_BUILD_ATTR,
  SSR_ROUTE_ATTR,
} from "../../../apps/reader-web/src/entry-server";
import {
  hydrateChapter,
  hydrationProblem,
} from "../../../apps/reader-web/src/hydrate";
import { BUILD_ID } from "../../../apps/reader-web/src/build";
import { bibleResponses } from "../../helpers/bibleResponses";

const ROUTE = { translationId: "BSB", bookId: "JHN", chapterNumber: 3 };

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** The page as the Worker serves it: the shell's markup in #root and the seed on the window. */
async function edgeRendered(buildId = BUILD_ID) {
  const bible = bibleResponses();
  vi.stubGlobal("fetch", bible.fetch);
  const page = (await renderChapterPage(ROUTE, "https://bible.test/"))!;
  expect(page).not.toBeNull();
  const html =
    buildId === BUILD_ID
      ? page.html
      : page.html.replace(
          `${SSR_BUILD_ATTR}="${BUILD_ID}"`,
          `${SSR_BUILD_ATTR}="${buildId}"`
        );
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const root = document.getElementById("root")!;
  return { page, root, html };
}

function watch(root: Element) {
  const records: MutationRecord[] = [];
  const mo = new MutationObserver((r) => records.push(...r));
  mo.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  return { records, stop: () => records.push(...mo.takeRecords()) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("hydration", () => {
  it("adopts the edge-rendered chapter without changing the DOM", async () => {
    const { page, root, html } = await edgeRendered();
    history.replaceState(null, "", "/read/BSB/JHN/3");
    expect(
      hydrationProblem(root, {
        pathname: location.pathname,
        seed: page.seed,
        buildId: BUILD_ID,
      })
    ).toBeNull();
    const w = watch(root);
    const outcome = hydrateChapter(root, {
      pathname: location.pathname,
      seed: page.seed,
      buildId: BUILD_ID,
    });
    await settle();
    w.stop();
    expect(outcome).toBe("hydrated");
    expect(w.records).toEqual([]);
    expect(root.innerHTML).toBe(html);
    expect(root.firstElementChild!.getAttribute(SSR_ROUTE_ATTR)).toBe(
      "/read/BSB/JHN/3"
    );
    expect(root.querySelector('[data-verse-number="16"]')).not.toBeNull();
  });

  it("declines a URL the markup is not for: the stale chapter is cleared, nothing thrown", async () => {
    const { page, root } = await edgeRendered();
    history.replaceState(null, "", "/read/BSB/JHN/4");
    expect(
      hydrationProblem(root, {
        pathname: location.pathname,
        seed: page.seed,
        buildId: BUILD_ID,
      })
    ).toBe("markup is for /read/BSB/JHN/3");
    const outcome = hydrateChapter(root, {
      pathname: location.pathname,
      seed: page.seed,
      buildId: BUILD_ID,
    });
    expect(outcome).toBe("cleared");
    expect(root.innerHTML).toBe("");
  });

  it("declines a missing or broken seed: cleared, nothing thrown", async () => {
    const { root } = await edgeRendered();
    history.replaceState(null, "", "/read/BSB/JHN/3");
    expect(
      hydrationProblem(root, {
        pathname: location.pathname,
        seed: undefined,
        buildId: BUILD_ID,
      })
    ).toBe("no seed for this chapter");
    expect(
      hydrateChapter(root, {
        pathname: location.pathname,
        seed: undefined,
        buildId: BUILD_ID,
      })
    ).toBe("cleared");
    expect(root.innerHTML).toBe("");
    const junk = await edgeRendered();
    expect(
      hydrateChapter(junk.root, {
        pathname: location.pathname,
        seed: "junk",
        buildId: BUILD_ID,
      })
    ).toBe("cleared");
    const wrongShape = await edgeRendered();
    expect(
      hydrateChapter(wrongShape.root, {
        pathname: location.pathname,
        seed: { "https://bible.test/api/BSB/JHN/3.json": { nope: true } },
        buildId: BUILD_ID,
      })
    ).toBe("cleared");
    expect(wrongShape.root.innerHTML).toBe("");
  });

  it("declines a page from another build: one client render of the chapter from the seed", async () => {
    const { page, root } = await edgeRendered("older");
    history.replaceState(null, "", "/read/BSB/JHN/3");
    expect(
      hydrationProblem(root, {
        pathname: location.pathname,
        seed: page.seed,
        buildId: BUILD_ID,
      })
    ).toBe("markup is from build older");
    const w = watch(root);
    const outcome = hydrateChapter(root, {
      pathname: location.pathname,
      seed: page.seed,
      buildId: BUILD_ID,
    });
    await settle();
    w.stop();
    expect(outcome).toBe("rendered");
    expect(w.records.length).toBeGreaterThan(0);
    expect(root.firstElementChild!.getAttribute(SSR_BUILD_ATTR)).toBe(BUILD_ID);
    expect(root.querySelector('[data-verse-number="16"]')).not.toBeNull();
    // A second pass over its own render is a clean adoption.
    expect(
      hydrateChapter(root, {
        pathname: location.pathname,
        seed: page.seed,
        buildId: BUILD_ID,
      })
    ).toBe("hydrated");
  });

  it("is a no-op on an empty root at a non-chapter URL, and clears stale markup there", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    history.replaceState(null, "", "/");
    expect(
      hydrateChapter(document.getElementById("root")!, {
        pathname: "/",
        seed: undefined,
        buildId: BUILD_ID,
      })
    ).toBe("no-markup");
    const { root } = await edgeRendered();
    expect(
      hydrateChapter(root, {
        pathname: "/",
        seed: undefined,
        buildId: BUILD_ID,
      })
    ).toBe("cleared");
    expect(root.innerHTML).toBe("");
  });
});
