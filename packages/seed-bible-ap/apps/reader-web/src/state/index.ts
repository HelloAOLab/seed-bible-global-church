// THE WIRING — what SeedBibleStateManager + init.tsx did: one place that builds the backend, the device stores,
// the outbox and every manager, and hands the tree to the components. `createReaderState` takes a backend so
// tests and local pages run on the in-memory one.
import { signal } from "@preact/signals";
import { FREE_USE_BIBLE_API_ENDPOINT, FreeUseBibleAPI } from "../backend/bible";
import type { ReaderBackend } from "../backend/ReaderBackend";
import { createA2aBackend } from "../backend/a2a";
import { indexedDbStores, type ReaderStores } from "../backend/offline/db";
import { createOutbox } from "../backend/offline/outbox";
import { createBucketStore } from "./records/buckets";
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
  const search = createVerseSearch();
  const position = createPosition(stores);
  const settings = createSettings();
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

  const verses = signal<number[]>([]);
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
    pane: signal<"none" | "notes" | "account" | "content">("none"),
    selector: signal<"books" | "translations" | null>(null),
    noteDraft: signal<{ start: number; end: number } | null>(null),
    focusNoteVerse: signal<number | null>(null),
    sidebarCollapsed: signal(false),
  };

  async function signIn(s: ReaderSession) {
    session.value = s;
    await buckets.resync();
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
    search,
    position,
    settings,
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
