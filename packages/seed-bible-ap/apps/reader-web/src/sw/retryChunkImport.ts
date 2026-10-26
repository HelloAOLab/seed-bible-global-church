// Copied from the old reader (components/CreateAnnotationForm/retryChunkImport.ts): a lazily loaded chunk that
// failed once is tried again under a cache-busting URL, and a stylesheet whose load failed is asked for again.
// Added here: a tab left open across a deploy. Its lazy chunks are gone from the host, which answers the app shell
// (HTML, 200) for any path it has no file for, so the import fails as a syntax error with no URL to retry. When the
// host's entry script is no longer this page's, the page reloads itself once onto the new build.

/**
 * The chunk URL named in a failed dynamic import's error. Chrome ("Failed to
 * fetch dynamically imported module: <url>") and Firefox ("error loading
 * dynamically imported module: <url>") include it; Safari doesn't.
 */
export function failedChunkUrl(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/https?:\/\/[^\s'"]+/)?.[0] ?? null;
}

// Load errors are recorded as they happen: afterwards a failed `<link>` can't
// be told apart from a loaded one (Chromium gives it an empty `sheet`). The
// listener captures because resource error events don't bubble.
const failedStylesheets = new Set<HTMLLinkElement>();
if (typeof document !== "undefined") {
  document.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLLinkElement && target.rel === "stylesheet") {
        failedStylesheets.add(target);
      }
    },
    true
  );
}

/**
 * Re-requests stylesheets whose load failed. Vite's preload helper adds a
 * chunk's CSS `<link>` once and remembers it, so after an offline failure it
 * never asks for that CSS again; a fresh element with the same href does.
 */
export function reloadFailedStylesheets(): void {
  for (const link of failedStylesheets) {
    failedStylesheets.delete(link);
    if (link.isConnected) {
      link.replaceWith(link.cloneNode());
    }
  }
}

/** The build's entry script, `/assets/index-<hash>.js`: its hash changes with every build. */
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** The entry script a page names (its HTML, or the live document). */
export function entryScriptOf(html: string): string | null {
  return html.match(ENTRY_RE)?.[0] ?? null;
}

function pageEntryScript(): string | null {
  if (typeof document === "undefined") return null;
  for (const s of document.querySelectorAll<HTMLScriptElement>(
    "script[type=module][src]"
  )) {
    const entry = entryScriptOf(s.getAttribute("src") ?? "");
    if (entry) return entry;
  }
  return null;
}

/** Remembers the build this tab already reloaded for, so a build that still fails never reloads the page twice. */
const RELOADED_FOR_KEY = "sb-reloaded-for-build";

export interface NewBuildCheck {
  /** The host's current shell, fetched past every cache. */
  fetchShell: () => Promise<string>;
  /** The entry script this page loaded. */
  pageEntry: () => string | null;
  reload: () => void;
  store: Pick<Storage, "getItem" | "setItem">;
}

const defaultCheck = (): NewBuildCheck => ({
  fetchShell: () =>
    fetch("/", { cache: "no-store", headers: { accept: "text/html" } }).then(
      (r) => (r.ok ? r.text() : "")
    ),
  pageEntry: pageEntryScript,
  reload: () => location.reload(),
  store: sessionStorage,
});

/**
 * Reloads the page onto the host's build when this page's is no longer it — once per new build, so a page that
 * still fails on the new build is left alone. Answers whether a reload was started; any failure to tell answers false.
 */
export async function reloadIfNewBuild(
  check: Partial<NewBuildCheck> = {}
): Promise<boolean> {
  try {
    const c = { ...defaultCheck(), ...check };
    const mine = c.pageEntry();
    if (!mine) return false;
    const live = entryScriptOf(await c.fetchShell());
    if (!live || live === mine) return false;
    if (c.store.getItem(RELOADED_FOR_KEY) === live) return false;
    c.store.setItem(RELOADED_FOR_KEY, live);
    c.reload();
    return true;
  } catch {
    return false;
  }
}

/**
 * Retries a lazily-loaded chunk after an earlier failure. Browsers remember a
 * failed module fetch for the life of the page, so importing the same URL
 * again fails instantly without touching the network (seen in Chromium 141).
 * When `load()` fails like that, import the chunk again under a cache-busting
 * query, which is a new module URL as far as the browser is concerned.
 * When that fails too, or the failure names no URL, the page may be from an
 * earlier build than the host's: then it reloads once and the promise never
 * settles (the page is going away); otherwise the failure is rethrown.
 */
export async function retryChunkImport<T>(
  load: () => Promise<T>,
  importUrl: (url: string) => Promise<T> = (url) =>
    import(/* @vite-ignore */ url) as Promise<T>,
  newBuild: () => Promise<boolean> = () => reloadIfNewBuild()
): Promise<T> {
  reloadFailedStylesheets();
  try {
    return await load();
  } catch (err) {
    const url = failedChunkUrl(err);
    if (!url) {
      if (await newBuild()) return new Promise<T>(() => undefined);
      throw err;
    }
    const busted = new URL(url);
    busted.searchParams.set("retry", String(Date.now()));
    try {
      return await importUrl(busted.href);
    } catch (again) {
      if (await newBuild()) return new Promise<T>(() => undefined);
      throw again;
    }
  }
}
