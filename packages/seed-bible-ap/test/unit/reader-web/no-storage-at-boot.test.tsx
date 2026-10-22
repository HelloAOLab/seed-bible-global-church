// NOTHING IS READ FROM THE DEVICE BEFORE THE CHAPTER IS ON SCREEN (test-plan A3.6): importing every module under
// state/ and backend/ and adopting the edge-rendered chapter touches no localStorage, sessionStorage or IndexedDB.
// Only the state's boot does — and then the session is sessionStorage's alone: nothing session-like ever goes to
// localStorage (AGENTS.md), which holds preferences only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordStorage } from "../../helpers/storageRecorder";
import { bibleResponses } from "../../helpers/bibleResponses";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../../../apps/reader-web/src");

function modules(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...modules(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("storage at boot", () => {
  it("importing every state and backend module, then adopting the edge-rendered chapter, touches no storage", async () => {
    const rec = recordStorage();
    const files = [
      ...modules(join(SRC, "state")),
      ...modules(join(SRC, "backend")),
    ];
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) await import(/* @vite-ignore */ f);
    expect(rec.accesses, "a module touched storage when imported").toEqual([]);

    const { renderChapterPage } =
      await import("../../../apps/reader-web/src/entry-server");
    const { hydrateChapter } =
      await import("../../../apps/reader-web/src/hydrate");
    const { BUILD_ID } = await import("../../../apps/reader-web/src/build");
    const bible = bibleResponses();
    vi.stubGlobal("fetch", bible.fetch);
    const rendered = (await renderChapterPage(
      { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
      "https://bible.test/"
    ))!;
    document.body.innerHTML = `<div id="root">${rendered.html}</div>`;
    history.replaceState(null, "", "/read/BSB/JHN/3");
    const outcome = hydrateChapter(document.getElementById("root")!, {
      pathname: location.pathname,
      seed: rendered.seed,
      buildId: BUILD_ID,
    });
    expect(outcome).toBe("hydrated");
    expect(rec.accesses, "hydration touched storage").toEqual([]);
  });

  it("the state's boot reads the session from sessionStorage and preferences from localStorage, never a session from localStorage", async () => {
    const rec = recordStorage();
    const { initI18n } = await import("../../../apps/reader-web/src/i18n");
    const { createReaderState } =
      await import("../../../apps/reader-web/src/state");
    await initI18n(["en"]);
    const state = createReaderState({
      api: bibleResponses().api,
      isOnline: () => false,
    });
    expect(state.session.value).toBeNull();
    expect(rec.keys("sessionStorage")).toEqual(["sbr.session"]);
    expect(rec.keys("indexedDB")).toEqual(["seed-bible-reader"]);
    const local = rec.keys("localStorage");
    expect(local.every((k) => /^sbr\./.test(k))).toBe(true);
    expect(
      local.filter((k) => /session|token|wire|secret|key/i.test(k))
    ).toEqual([]);
    // Writes at boot are preferences only (the settings manager keeps its defaults): never the session.
    const written = rec.accesses
      .filter((a) => a.store === "localStorage" && a.op === "setItem")
      .map((a) => a.key);
    expect(
      written.every((k) => k === "sbr.settings" || k === "sbr.language")
    ).toBe(true);
  });
});
