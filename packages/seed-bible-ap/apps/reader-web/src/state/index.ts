// THE WIRING — what SeedBibleStateManager + init.tsx did: one place that builds the backend, the device stores,
// the outbox and every manager, and hands the tree to the components. `createReaderState` takes a backend so
// tests and local pages run on the in-memory one.
import { signal } from "@preact/signals";
import { FREE_USE_BIBLE_API_ENDPOINT, FreeUseBibleAPI } from "../backend/bible";
import type { ReaderBackend } from "../backend/ReaderBackend";
import { createA2aBackend } from "../backend/a2a";
import { indexedDbStores, type ReaderStores } from "../backend/offline/db";
import { createOutbox } from "../backend/offline/outbox";
import { createBucketStore, separateForeign } from "./records/buckets";
import { createDiscover } from "./social/discover";
import { createPublishing } from "./social/publishing";
import { createToday } from "./social/today";
import { createLiveSession } from "./sessions/live";
import { createPlaylists } from "./library/playlists";
import { createPlans } from "./library/plans";
import { createHighlights } from "./records/highlights";
import { createAnnotations } from "./records/annotations";
import { createBookmarks } from "./records/bookmarks";
import { createSaves } from "./records/saves";
import { createVerseSearch } from "../backend/search";
import { setVerseLinkTranslation } from "../components/records/tiptap/VerseReferenceMark";
import { createPosition } from "./records/position";
import { createReading, type ReadingApi } from "./reading/reading";
import { bindRoute, parseRoute, pushRoute } from "./reading/route";
import { createTabs } from "./reading/tabs";
import { createSettings } from "./chrome/settings";
import { createChapterAudio } from "./media/audio";
import { createTextToSpeechManager } from "./media/textToSpeech";
import { bibleLanguageToBcp47 } from "./media/languages";
import { getVersePlainText } from "../components/reader/chapterContent";
import { effect } from "@preact/signals";
import {
  loadSession,
  signOut as forgetSession,
  type ReaderSession,
} from "../session";

export interface ReaderStateOptions {
  backend?: ReaderBackend;
  stores?: ReaderStores;
  api?: ReadingApi;
  session?: ReaderSession | null;
  isOnline?: () => boolean;
}

export function createReaderState(opts: ReaderStateOptions = {}) {
  const session = signal<ReaderSession | null>(
    opts.session === undefined ? loadSession() : opts.session
  );
  const backend = opts.backend ?? createA2aBackend(() => session.value);
  const stores = opts.stores ?? indexedDbStores();
  const api = opts.api ?? new FreeUseBibleAPI(FREE_USE_BIBLE_API_ENDPOINT);

  const outbox = createOutbox({
    backend,
    stores,
    ...(opts.isOnline ? { isOnline: opts.isOnline } : {}),
    onMerged: (c, ch, b) => buckets.accept(c, ch, b),
    repair: (c, ch, b) => {
      const who = backend.identity();
      if (!who) return null;
      const { mine, foreign } = separateForeign(b, who.agent, () =>
        crypto.randomUUID()
      );
      for (const [holder, doc] of foreign)
        void stores.buckets.set(`parked:${holder}:${c}:${ch ?? c}`, doc);
      return mine;
    },
  });
  const buckets = createBucketStore({
    backend,
    stores,
    outbox,
    ...(opts.isOnline ? { isOnline: opts.isOnline } : {}),
  });
  const identity = () => backend.identity();
  const highlights = createHighlights(buckets, identity);
  const annotations = createAnnotations(buckets, identity);
  const bookmarks = createBookmarks(buckets, identity);
  const saves = createSaves(buckets, identity);
  const playlists = createPlaylists(backend, stores, identity);
  const plans = createPlans(backend, stores, buckets, identity);
  const search = createVerseSearch();
  const position = createPosition(stores);
  const settings = createSettings();
  const discover = createDiscover(backend);
  const publishing = createPublishing(backend, stores);
  const today = createToday(backend, stores);
  const audio = createChapterAudio({ api });
  const tts = createTextToSpeechManager();

  // Every tab has its own reading state; the device position and the URL follow the selected tab only.
  const tabs = createTabs({
    makeReading: (tabId) =>
      createReading({
        api,
        chapters: stores.chapters,
        onChange: (p) => {
          if (tabs.selectedId.value !== tabId) return;
          void position.save(p);
          pushRoute(p);
          setVerseLinkTranslation(p.translationId);
        },
      }),
  });
  /** The selected tab's reading state — what the toolbars, panes and the URL act on. */
  const readingOf = () => tabs.selected.value?.reading ?? fallbackReading;
  const fallbackReading = createReading({ api, chapters: stores.chapters });
  // Selecting another tab moves the URL and the device position to it.
  effect(() => {
    const r = tabs.selected.value?.reading;
    if (!r) return;
    const p = {
      translationId: r.translationId.value,
      bookId: r.bookId.value,
      chapterNumber: r.chapterNumber.value,
    };
    pushRoute(p);
    void position.save(p);
    setVerseLinkTranslation(p.translationId);
  });

  // The recording follows the open chapter; reading aloud stops when the chapter changes.
  effect(() => {
    const chapter = readingOf().chapterData.value;
    void audio.load(chapter);
    tts.stop();
  });
  const speechLang = () =>
    bibleLanguageToBcp47(readingOf().translation.value?.language);
  /** Read the open chapter aloud with the browser's own voice (when the API has no recording). */
  function listen() {
    const chapter = readingOf().chapterData.value;
    if (!chapter) return;
    const verses = chapter.chapter.content
      .filter(
        (e): e is Extract<typeof e, { type: "verse" }> =>
          !!e && typeof e === "object" && e.type === "verse"
      )
      .map((e) => ({ number: e.number, text: getVersePlainText(e.content) }));
    tts.speak(verses, { lang: speechLang() });
  }

  const live = createLiveSession({
    backend,
    reading: () => readingOf(),
    identity: () => backend.identity(),
  });
  // The leader's navigation moves the room.
  effect(() => {
    readingOf().chapterRef.value;
    live.leaderMoved();
  });
  const verses = signal<number[]>([]);
  // Playing a playlist: a Scripture item opens its passage in the selected tab.
  effect(() => {
    const c = playlists.current.value;
    const it = c?.item;
    if (!it || it["@type"] !== "seed:ScriptureItem") return;
    const [book, ch, v] = it.aboutPassage.split("-")[0]!.split(".");
    const r = readingOf();
    void r
      .goTo(it.ofEdition ?? r.translationId.value, book!, Number(ch))
      .then(() => {
        if (v) {
          const end = it.aboutPassage.split("-")[1]?.split(".")[2];
          verses.value = Array.from(
            { length: Number(end ?? v) - Number(v) + 1 },
            (_, i) => Number(v) + i
          );
        }
      });
  });
  effect(() => {
    readingOf().chapterRef.value;
    verses.value = [];
  });
  const selection = {
    verses,
    toggle(verse: number, extend = false) {
      const cur = verses.value;
      if (extend && cur.length) {
        const lo = Math.min(...cur, verse);
        const hi = Math.max(...cur, verse);
        verses.value = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      } else if (cur.length === 1 && cur[0] === verse) verses.value = [];
      else if (
        cur.length &&
        (verse === Math.max(...cur) + 1 || verse === Math.min(...cur) - 1)
      )
        verses.value = [...cur, verse].sort((a, b) => a - b);
      else verses.value = [verse];
    },
    select(start: number, end: number) {
      verses.value = Array.from(
        { length: end - start + 1 },
        (_, i) => start + i
      );
    },
    clear() {
      if (verses.value.length) verses.value = [];
    },
  };

  const ui = {
    pane: signal<
      | "none"
      | "notes"
      | "account"
      | "content"
      | "today"
      | "discover"
      | "session"
      | "library"
    >("none"),
    selector: signal<"books" | "translations" | null>(null),
    noteDraft: signal<{ start: number; end: number } | null>(null),
    focusNoteVerse: signal<number | null>(null),
    sidebarCollapsed: signal(false),
    /** A share link's session, joined once signed in. */
    pendingJoin: signal<{ sessionId: string; code?: string } | null>(null),
  };
  // A device's selected verse is its presence in the room.
  effect(() => {
    const first = verses.value[0] ?? null;
    if (live.active.value) void live.presenceAt(first);
  });

  async function signIn(s: ReaderSession) {
    session.value = s;
    await buckets.resync();
    void today.refresh();
    void playlists.refresh();
    void plans.refresh();
    const pj = ui.pendingJoin.value;
    if (pj) {
      ui.pendingJoin.value = null;
      ui.pane.value = "session";
      void live.join(pj.sessionId, pj.code).catch(() => {});
    }
  }
  async function signOut() {
    forgetSession();
    session.value = null;
    buckets.reset();
  }

  /** Open the chapter the URL names, else where the reader left off, else John 1; wire history and the outbox. */
  async function start(): Promise<() => void> {
    const fromUrl =
      typeof location !== "undefined" ? parseRoute(location.pathname) : null;
    const target = fromUrl ?? (await position.load());
    tabs.addTab(target ?? {});
    const stops = [bindRoute(readingOf), outbox.start()];
    // A share link: join the session (after sign-in when needed), and drop the query from the URL.
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search);
      const sid = q.get("session");
      if (sid) {
        const code = q.get("code") ?? undefined;
        history.replaceState(null, "", location.pathname);
        ui.pane.value = "session";
        if (session.value) void live.join(sid, code).catch(() => {});
        else
          ui.pendingJoin.value = { sessionId: sid, ...(code ? { code } : {}) };
      }
    }
    return () => stops.forEach((s) => s());
  }

  return {
    session,
    backend,
    stores,
    outbox,
    buckets,
    highlights,
    annotations,
    bookmarks,
    saves,
    playlists,
    plans,
    search,
    position,
    settings,
    discover,
    publishing,
    today,
    live,
    audio,
    tts,
    speechLang,
    listen,
    tabs,
    get reading() {
      return readingOf();
    },
    selection,
    ui,
    signIn,
    signOut,
    start,
  };
}

export type ReaderState = ReturnType<typeof createReaderState>;
