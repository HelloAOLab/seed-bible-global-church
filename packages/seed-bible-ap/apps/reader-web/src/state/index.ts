// THE WIRING — what SeedBibleStateManager + init.tsx did: one place that builds the backend, the device stores,
// the outbox and every manager, and hands the tree to the components. `createReaderState` takes a backend so
// tests and local pages run on the in-memory one.
import { parseSharedPath, type SharedRef } from "./social/sharedPage";
import { createTours, parseTutorialLink } from "./chrome/tours";
import { createToolbarLayout } from "./chrome/toolbarLayout";
import { createOfflineTranslations } from "./reading/offlineTranslations";
import { isTypingTarget, readerKeyAction } from "./chrome/keys";
import { defaultTranslationFor } from "./reading/defaultTranslation";
import { bindWakeLock } from "./chrome/wakeLock";
import { AVAILABLE_LANGUAGES, language, setLanguage } from "../i18n";
import { signal } from "@preact/signals";
import { BIBLE_API_ENDPOINT, FreeUseBibleAPI } from "../backend/bible";
import type { ReaderBackend } from "../backend/ReaderBackend";
import { createA2aBackend } from "../backend/a2a";
import { indexedDbStores, type ReaderStores } from "../backend/offline/db";
import { createOutbox } from "../backend/offline/outbox";
import { createBucketStore, separateForeign } from "./records/buckets";
import { createDiscover } from "./social/discover";
import { createPublishing } from "./social/publishing";
import { createToday } from "./social/today";
import { createPresence } from "./social/presence";
import { createProfile } from "./social/profile";
import { claimDevice, forgetPerson } from "./records/deviceOwner";
import { createFriendship, parseFriendLink } from "./social/friendship";
import { estateById } from "../../../../estate/faithnet";
import { createLiveSession } from "./sessions/live";
import { browserPeerFactory, createVoice } from "./sessions/voice";
import { createHuddle, openRealtimeKit } from "./sessions/huddle";
import { createPlaylists } from "./library/playlists";
import { createPlans } from "./library/plans";
import { createFiles } from "./library/files";
import { createCustomizations } from "./chrome/customizations";
import { createExtensionHost } from "../extensions/host";
import { registerBuiltInExtensions } from "../extensions";
import { createHighlights } from "./records/highlights";
import { createAnnotations } from "./records/annotations";
import { createBookmarks } from "./records/bookmarks";
import { createSaves } from "./records/saves";
import { createHistory } from "./records/history";
import { createVerseSearch } from "../backend/search";
import { createScriptureCheck } from "./reading/scriptureCheck";
import { setVerseLinkTranslation } from "../components/records/tiptap/VerseReferenceMark";
import { createPosition } from "./records/position";
import { createReading, type ReadingApi } from "./reading/reading";
import { bindRoute, parseRoute, pushRoute, versesOf } from "./reading/route";
import { legacyTarget } from "./reading/legacyRoute";
import { createTabs, slotCountOf, type LayoutId } from "./reading/tabs";
import { createSettings } from "./chrome/settings";
import { createChapterAudio } from "./media/audio";
import { createTextToSpeechManager } from "./media/textToSpeech";
import { bibleLanguageToBcp47 } from "./media/languages";
import { getVersePlainText } from "../components/reader/chapterContent";
import { computed, effect } from "@preact/signals";
import {
  DEFAULT_ESTATE,
  loadSession,
  signOut as forgetSession,
  type ReaderSession,
} from "../session";

/** The old reader's Settings pages, opened from the sidebar's ⚙. */
export type SettingsPage =
  | "main"
  | "account"
  | "display"
  | "toolbar"
  | "extensions"
  | "install"
  | "tutorial"
  | "customize";

export interface ReaderStateOptions {
  backend?: ReaderBackend;
  stores?: ReaderStores;
  api?: ReadingApi;
  session?: ReaderSession | null;
  isOnline?: () => boolean;
  /** How long a chapter stays open before it counts as read (tests shorten it). */
  readDwellMs?: number;
  /** How often the device tells friends where it is reading (tests shorten it). */
  presenceBeatMs?: number;
}

/** How long a chapter stays open before it counts as read. */
export const READ_DWELL_MS = 8_000;

/** A refusal the person's Home fixes on its next open (the agent runs bare, without the reader's contracts). */
export const NEEDS_HOME =
  /does not offer|unknown_tool|playbook|assign|archetype/i;
const TABS_KEY = "tabs:open";
const TABS_SAVE_MS = 300;
interface SavedTabs {
  tabs: { translationId: string; bookId: string; chapterNumber: number }[];
  layout: LayoutId;
  /** Each slot's tab as an index into `tabs`. */
  slots: (number | null)[];
  selectedSlot: number;
}

export function createReaderState(opts: ReaderStateOptions = {}) {
  const session = signal<ReaderSession | null>(
    opts.session === undefined ? loadSession() : opts.session
  );
  const backend = opts.backend ?? createA2aBackend(() => session.value);
  const stores = opts.stores ?? indexedDbStores();
  const api = opts.api ?? new FreeUseBibleAPI(BIBLE_API_ENDPOINT);

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
  const saves = createSaves(buckets, identity, stores.prefs);
  const playlists = createPlaylists(backend, stores, identity);
  const plans = createPlans(backend, stores, buckets, identity);
  const files = createFiles(backend, stores, identity);
  const extensions = createExtensionHost(stores);
  registerBuiltInExtensions(extensions);
  const readingHistory = createHistory(buckets, stores, identity);
  const search = createVerseSearch();
  const scriptureCheck = createScriptureCheck();
  const position = createPosition(stores);
  const customizations = createCustomizations(backend, stores, identity);
  const settings = createSettings({
    brand: (dark) => customizations.theme(dark),
  });
  const discover = createDiscover(backend);
  const publishing = createPublishing(backend, stores);
  const today = createToday(backend, stores);
  const friendship = createFriendship({
    prefs: stores.prefs,
    friendsView: () => today.friendsView.value,
    refresh: () => today.refreshContacts(),
    homeOrigin: estateById(DEFAULT_ESTATE)?.home ?? "",
  });
  const profile = createProfile(backend, stores, identity);
  const audio = createChapterAudio({ api });
  /** Guided tours (the old TutorialManager): the introduction, contextual tours, `?tutorial=` links. */
  const tours = createTours({
    prefs: stores.prefs,
    isPhone: () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(max-width: 720px)").matches,
    prepare: (id) => {
      // The search tour points at the floating search box: open it first.
      if (id === "search") ui.searchOpen.value = true;
    },
  });
  /** The bottom toolbar's order and hidden buttons (the old toolbar customizer). */
  const toolbar = createToolbarLayout(stores.prefs);
  /** Whole translations kept on the device (the old OfflineTranslationsManager). */
  const offline = createOfflineTranslations({
    api:
      "getCompleteTranslation" in api
        ? (api as Pick<FreeUseBibleAPI, "getCompleteTranslation">)
        : {
            getCompleteTranslation: () =>
              Promise.reject(new Error("this Bible source has no downloads")),
          },
    chapters: stores.chapters,
    prefs: stores.prefs,
  });
  /** Listening: the reader's chosen voice and whether the next chapter plays on its own (device preferences). */
  const listening = {
    autoContinue: signal(false),
    preferredReader: signal<string | null>(null),
    async chooseReader(name: string) {
      listening.preferredReader.value = name;
      await stores.prefs.set("audio:reader", name);
      await audio.setReader(name);
    },
    async setAutoContinue(on: boolean) {
      listening.autoContinue.value = on;
      await stores.prefs.set("audio:autoContinue", on);
    },
  };
  void stores.prefs.get("audio:reader").then((v) => {
    if (typeof v === "string") {
      listening.preferredReader.value = v;
      audio.setPreferredReader(v);
    }
  });
  void stores.prefs.get("audio:autoContinue").then((v) => {
    if (typeof v === "boolean") listening.autoContinue.value = v;
  });
  // The recording ends: the next chapter opens and plays when the person asked for that.
  audio.setOnEnded(() => {
    if (!listening.autoContinue.value) return;
    const r = readingOf();
    if (!r.hasNext.value) return;
    void r.next().then(async () => {
      await audio.load(r.chapterData.value);
      audio.play();
    });
  });
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

  const presence = createPresence({
    backend,
    stores,
    here: () => {
      const r = readingOf();
      if (!r.chapterData.value) return null;
      const edition = r.translation.value?.shortName ?? r.translationId.value;
      return {
        scope: r.chapterRef.value,
        label: `reading ${r.bookName.value} ${r.chapterNumber.value} · ${edition}`,
      };
    },
    ...(opts.presenceBeatMs ? { beatMs: opts.presenceBeatMs } : {}),
  });
  // A church theme's recommended extensions are turned on when the theme is picked (a reader can turn them off).
  customizations.setOnRecommend(async (ids) => {
    for (const id of ids)
      if (
        extensions.registered.value.some((r) => r.id === id) &&
        !extensions.enabled.value.has(id)
      )
        await extensions.setEnabled(id, true);
  });
  // Moving to another chapter tells friends at once rather than at the next beat.
  effect(() => {
    readingOf().chapterRef.value;
    readingOf().chapterData.value;
    if (session.value) void presence.beat();
  });
  const live = createLiveSession({
    backend,
    reading: () => readingOf(),
    identity: () => backend.identity(),
  });
  // Voice in the session: the microphone once, one peer connection per other device on voice, the room relaying.
  let mic: MediaStream | null = null;
  const voiceMuted = signal(false);
  const voice = createVoice({
    me: () => live.me.value,
    onVoice: () =>
      (live.state.value?.participants ?? [])
        .filter((p) => p.voice)
        .map((p) => p.agent),
    signal: (to, payload) => live.signal(to, payload),
    onSignal: (f) => live.onSignal(f),
    setVoice: (on) => live.setVoice(on),
    openPeer: browserPeerFactory(
      (to, payload) => live.signal(to, payload),
      async () => {
        if (!mic)
          mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        return mic;
      },
      () => voiceMuted.value
    ),
    closeMic: () => {
      mic?.getTracks().forEach((t) => t.stop());
      mic = null;
    },
  });
  const setVoiceMuted = (m: boolean) => {
    voiceMuted.value = m;
    voice.muted.value = m;
    mic?.getAudioTracks().forEach((t) => (t.enabled = !m));
  };
  // Who is on voice changes with the room's state; the mesh follows.
  effect(() => {
    live.state.value?.participants;
    void voice.reconcile();
  });
  // Leaving the session leaves voice.
  effect(() => {
    if (!live.active.value && voice.on.value) void voice.leave();
  });
  // The session's call (the estate's huddle) for the signed-in; a guest has the voice above.
  const huddle = createHuddle({
    ask: (op) => {
      const id = live.sessionId.value;
      if (!id) return Promise.reject(new Error("no live session"));
      return backend.sessionHuddle(id, op);
    },
    openMeeting: openRealtimeKit,
  });
  // While in a session and not in its call, look every so often whether one is running (and how many are in it).
  effect(() => {
    if (!live.active.value || !session.value || live.guest.value) {
      if (huddle.status.peek() !== "idle") void huddle.leave();
      return;
    }
    if (huddle.status.value !== "idle") return;
    void huddle.look();
    const timer = setInterval(() => void huddle.look(), 10_000);
    return () => clearInterval(timer);
  });
  // The leader's navigation moves the room.
  effect(() => {
    readingOf().chapterRef.value;
    live.leaderMoved();
  });
  // A chapter that stays open counts as read: today's reading event for it, on the device and then in the Library.
  effect(() => {
    const r = readingOf();
    const ref = r.chapterRef.value;
    const edition = r.translationId.value;
    if (!r.chapterData.value || typeof setTimeout === "undefined") return;
    const t = setTimeout(
      () => void readingHistory.record(ref, edition).catch(() => {}),
      opts.readDwellMs ?? READ_DWELL_MS
    );
    return () => clearTimeout(t);
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
      | "about"
      | "map"
      | "friends"
      | "profile"
      | "edit-profile"
      | `ext:${string}`
    >("none"),
    selector: signal<"books" | "translations" | null>(null),
    noteDraft: signal<{ start: number; end: number } | null>(null),
    focusNoteVerse: signal<number | null>(null),
    sidebarCollapsed: signal(false),
    /** On a phone the sidebar is a drawer over the reader, opened from the toolbar. */
    sidebarDrawer: signal(false),
    /** The bookmarks and saves panels above the sidebar's tab list (opened from its header, or the phone's More). */
    bookmarksPanel: signal(false),
    savesPanel: signal(false),
    /** The old reader's floating search above the toolbar. */
    searchOpen: signal(false),
    /** The bookmark window for a chapter (move one of your bookmarks here, or make one); null when closed. */
    bookmarkPicker: signal<{ chapterRef: string; edition?: string } | null>(
      null
    ),
    /** The live session's settings window, and the host's "end it or hand it over" question. */
    sessionSettings: signal(false),
    sessionClose: signal(false),
    /** The save window (the old SaveCategoryPicker): the passage to file, and the save when it is already saved. */
    savePicker: signal<{
      chapterRef: string;
      verses: { start: number; end: number } | null;
      edition?: string;
      saveId?: string;
    } | null>(null),
    /** The phone's Theme & text sheet (the old MobileSettingsSheet), from the sliders in the chapter's top bar. */
    textSheet: signal(false),
    /** A playlist or plan to open in the Library pane (Your content's Edit and Open hand it over). */
    libraryOpen: signal<{
      tab: "playlists" | "plans";
      id: string;
      edit?: boolean;
    } | null>(null),
    /** The Settings list (or one of its pages) shown in the sidebar in place of the tabs; null when closed. */
    settingsView: signal<SettingsPage | null>(null),
    /** The reading area's width in px (App.tsx measures it); the toolbar folds into More when it's wider than this. */
    mainWidth: signal(0),
    /** Compact embed chrome (`?embed=minimal`): the reader alone, no sidebar or toolbars. */
    embed: signal(false),
    /** What the Share dialog is sharing (components/chrome/ShareDialog.tsx); null when closed. */
    share: signal<{ title: string; url: string } | null>(null),
    /** The verse toolbar opened as a menu at the pointer (a right-click on a verse); null when docked. */
    verseMenuAt: signal<{ x: number; y: number } | null>(null),
    /** The shared page open over the reader (`/shared/<shelf>/<kind>/<slug>`); null when none. */
    shared: signal<SharedRef | null>(
      typeof location !== "undefined"
        ? parseSharedPath(location.pathname)
        : null
    ),
    /** How to use the whole screen (Safari on an iPhone: add to the home screen); see FullScreenHelp. */
    fullScreenHelp: signal(false),
    /** A short line at the foot of the screen that goes by itself ("Signed in as Ruth"); see Toast. */
    toast: signal<{ key: string; values?: Record<string, string> } | null>(
      null
    ),
    /** A share link's session, joined once signed in. */
    pendingJoin: signal<{ sessionId: string; code?: string } | null>(null),
  };
  /**
   * Why the Library is out of reach while the reader is signed in, and so what the account pane asks of them:
   * "expired" — their Home session lapsed, sign in again; "wire" — their agent no longer admits the reader's
   * permission (the ask-as-me wire), sign in again to grant it. Null while the last flush went through. The marks
   * stay on the device and in the outbox either way; nothing is dropped on the device's say-so.
   */
  const sessionTrouble = computed<"expired" | "wire" | null>(() => {
    if (!session.value) return null;
    if (outbox.lastErrorCode.value === "signed-out") return "expired";
    if (
      outbox.lastErrorCode.value &&
      /ask-as-me wire|session wire|permission to ask your agent/i.test(
        outbox.lastError.value ?? ""
      )
    )
      return "wire";
    return null;
  });
  // The right-click menu closes with the selection.
  effect(() => {
    if (!verses.value.length) ui.verseMenuAt.value = null;
  });
  // The session's connection, said as it changes (the old reader's notices): this device's own, and the host's.
  let lostRoom = false;
  let hostWasHere = true;
  effect(() => {
    const on = live.connected.value;
    if (!live.active.value) {
      lostRoom = false;
      hostWasHere = true;
      return;
    }
    if (!on && !lostRoom && live.state.peek()) {
      lostRoom = true;
      ui.toast.value = { key: "session-connection-lost" };
    } else if (on && lostRoom) {
      lostRoom = false;
      ui.toast.value = { key: "session-rejoined" };
    }
  });
  effect(() => {
    const st = live.state.value;
    if (!st?.host || !live.connected.value || live.isHost.value) return;
    const host = st.participants.find((p) => p.agent === st.host!.agent);
    const here = (host?.connections ?? 0) > 0;
    if (here !== hostWasHere)
      ui.toast.value = {
        key: here ? "session-host-reconnected" : "session-host-disconnected",
      };
    hostWasHere = here;
  });
  // A device's presence in the room: its selected verse, and the chapter and verses on its screen.
  effect(() => {
    const first = verses.value[0] ?? null;
    const view = live.view.value;
    if (live.active.value) void live.presenceAt(first, view);
  });

  async function signIn(s: ReaderSession, opts: { announce?: boolean } = {}) {
    // Someone else's copy on this device (their profile, playlists, friends…) is forgotten, and the page starts
    // again so nothing of theirs stays in memory; the session is saved, so it comes back signed in as this person.
    const person = s.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0] ?? s.sub;
    if (await claimDevice(stores.prefs, person)) {
      if (typeof location !== "undefined") location.reload();
      return;
    }
    session.value = s;
    // Signing in from the Account pane lands in the reader, not on the account settings that replace the sign-in.
    if (opts.announce) {
      if (ui.pane.value === "account") ui.pane.value = "none";
      ui.toast.value = {
        key: "signed-in-as",
        values: { name: s.name || s.sub },
      };
    }
    await buckets.resync();
    void today.refresh();
    void playlists.refresh();
    void plans.refresh();
    void customizations.mine.refresh();
    void profile.refresh();
    const pj = ui.pendingJoin.value;
    if (pj) {
      ui.pendingJoin.value = null;
      ui.pane.value = "session";
      void live.join(pj.sessionId, pj.code).catch(() => {});
    }
  }
  async function signOut() {
    await presence.gone();
    await forgetPerson(stores.prefs);
    forgetSession();
    session.value = null;
    buckets.reset();
    // Out of the Home too (its single sign-on), so the next sign-in asks who you are rather than reusing the last
    // person; the Home's /logout ends its session and returns here to a fresh start page.
    if (typeof location !== "undefined") {
      const home = estateById(DEFAULT_ESTATE)?.home;
      location.assign(
        home
          ? `${home}/logout?return=${encodeURIComponent(`${location.origin}/`)}`
          : "/"
      );
    }
  }

  // The open tabs and the layout are remembered on the device (prefs) and restored on the next visit.
  let tabsRestored = false;
  let tabsSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let tabsPending: SavedTabs | null = null;
  const saveTabsNow = () => {
    clearTimeout(tabsSaveTimer);
    if (!tabsPending) return;
    const snap = tabsPending;
    tabsPending = null;
    void stores.prefs.set(TABS_KEY, snap);
  };
  effect(() => {
    const snapshot: SavedTabs = {
      tabs: tabs.tabs.value.map((t) => ({
        translationId: t.reading.translationId.value,
        bookId: t.reading.bookId.value,
        chapterNumber: t.reading.chapterNumber.value,
      })),
      layout: tabs.layout.value,
      slots: tabs.slotTabIds.value.map((id) =>
        id === null ? null : tabs.tabs.value.findIndex((t) => t.id === id)
      ),
      selectedSlot: tabs.selectedSlot.value,
    };
    if (!tabsRestored) return;
    tabsPending = snapshot;
    clearTimeout(tabsSaveTimer);
    tabsSaveTimer = setTimeout(saveTabsNow, TABS_SAVE_MS);
  });
  /** The remembered tabs opened again, slots and selection included; null when there were none. */
  function restoreTabs(saved: SavedTabs | undefined) {
    if (!saved?.tabs.length) return null;
    const made = saved.tabs.map((t) => tabs.addTab(t));
    tabs.setLayout(saved.layout);
    const count = slotCountOf(saved.layout);
    const ids = tabs.slotTabIds.value.map(
      (fallback, i) => made[saved.slots[i] ?? -1]?.id ?? fallback
    );
    if (ids.length === count && new Set(ids).size === ids.length)
      tabs.slotTabIds.value = ids;
    tabs.selectedSlot.value = Math.min(
      Math.max(0, saved.selectedSlot),
      count - 1
    );
    return tabs.selected.value ?? made[0]!;
  }

  /** Open the chapter the URL names, else where the reader left off, else John 1; wire history and the outbox. */
  async function start(): Promise<() => void> {
    // A seedbible.org link (`/en/BSB/john/3?verse=16`) becomes this reader's own address before anything reads it.
    if (typeof location !== "undefined") {
      const legacy = legacyTarget(location.pathname, location.search);
      if (legacy) history.replaceState(null, "", legacy);
    }
    const fromUrl =
      typeof location !== "undefined" ? parseRoute(location.pathname) : null;
    // Read everything the link carries BEFORE the first navigation: opening the tab rewrites the URL (pushRoute),
    // and a `?v=` or `?offering=` read after that is gone.
    const shared =
      fromUrl && typeof location !== "undefined"
        ? versesOf(location.search)
        : null;
    // A link to a published note: Discover opens on it once the chapter is listed.
    const offering =
      fromUrl && typeof location !== "undefined"
        ? new URLSearchParams(location.search).get("offering")
        : null;
    const target = fromUrl ?? (await position.load());
    const saved = (await stores.prefs.get(TABS_KEY)) as SavedTabs | undefined;
    const restored = restoreTabs(saved);
    // A device's very first visit opens a Bible in its interface language (the old DEFAULT_TRANSLATIONS_BY_LANGUAGE).
    const tab =
      restored ??
      tabs.addTab(
        target ?? { translationId: defaultTranslationFor(language.value) }
      );
    tabsRestored = true;
    if (offering) {
      discover.focus.value = offering;
      ui.pane.value = "discover";
    }
    if (fromUrl && (restored || shared || offering))
      void tab.reading
        .goTo(fromUrl.translationId, fromUrl.bookId, fromUrl.chapterNumber)
        .then(() => {
          if (!shared) return;
          selection.select(shared[0], shared[1]);
          // The pane brings the linked verse into view once the chapter is on screen (readerViewport.ts).
          tab.reading.scrollToVerse.value = shared[0];
        });
    // Coming back to the tab after a refusal that the Home can heal (the agent lacked the reader's behaviour):
    // try again by itself rather than waiting for a tap on Sync now.
    const onBack = () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState !== "visible" ||
        !session.value
      )
        return;
      if (NEEDS_HOME.test(outbox.lastError.value ?? "")) void buckets.resync();
      // A picture or name changed on another device shows when you come back here.
      void profile.refresh();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onBack);
    // The reader's keys (state/chrome/keys.ts), on the selected tab.
    const onKey = (e: KeyboardEvent) => {
      const r = readingOf();
      const action = readerKeyAction(e.key, {
        rtl: r.translation.value?.textDirection === "rtl",
        hasNext: r.hasNext.value,
        hasPrev: r.hasPrev.value,
        typing: isTypingTarget(e.target),
        modifier: e.altKey || e.ctrlKey || e.metaKey || e.shiftKey,
      });
      if (!action) return;
      if (action === "escape") {
        if (tours.active.value) tours.done();
        else if (ui.share.value) ui.share.value = null;
        else if (ui.selector.value) ui.selector.value = null;
        else if (ui.sidebarDrawer.value) ui.sidebarDrawer.value = false;
        else if (verses.value.length) selection.clear();
        else if (ui.pane.value !== "none") ui.pane.value = "none";
        else return;
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (action === "search") {
        ui.searchOpen.value = true;
        return;
      }
      selection.clear();
      void (action === "next" ? r.next() : r.prev());
    };
    // While a tour shows, Esc is the tour's alone: caught before the search box, the picker or a menu under it
    // sees it, so skipping the tour leaves what it was pointing at open.
    const onTourEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !tours.active.value) return;
      tours.done();
      e.preventDefault();
      // Immediate: the windows' own Esc listeners sit on the same window, after this one.
      e.stopImmediatePropagation();
    };
    const keysOn = typeof window !== "undefined";
    if (keysOn) {
      window.addEventListener("keydown", onTourEsc, true);
      window.addEventListener("keydown", onKey);
    }
    const stops = [
      () => keysOn && window.removeEventListener("keydown", onTourEsc, true),
      () => keysOn && window.removeEventListener("keydown", onKey),
      bindWakeLock(settings.keepScreenAwake),
      bindRoute(readingOf),
      outbox.start(),
      presence.start(),
      () =>
        typeof document !== "undefined" &&
        document.removeEventListener("visibilitychange", onBack),
      // Leaving writes the last tab change at once rather than losing it to the debounce.
      saveTabsNow,
    ];
    void customizations.refresh();
    void offline.load();
    void extensions.bind(stateObject);
    // A share link: join the session (after sign-in when needed), and drop the query from the URL.
    if (typeof location !== "undefined") {
      const q = new URLSearchParams(location.search);
      // Embed mode and a theme or customization named in the link (the old `?embed=`, `?theme=`, `?customization=`).
      // `?lang=` (the old reader's, and the language segment of its links): the interface language, when we have it.
      const lang = q.get("lang");
      if (lang && AVAILABLE_LANGUAGES.includes(lang)) void setLanguage(lang);
      const embed = q.get("embed");
      if (embed === "minimal" || embed === "true") ui.embed.value = true;
      // `app.themeId` is the old reader's embed parameter; links made by it keep working.
      const theme = q.get("theme") ?? q.get("app.themeId");
      if (theme === "light" || theme === "dark") settings.theme.value = theme;
      const cust = q.get("customization");
      if (cust)
        void customizations.refresh().then(() => {
          const entry = customizations.findByRef(cust);
          if (entry) void customizations.select(entry);
        });
      // `?tutorial=<id>&tutorialStep=<n>` starts a tour once the page has drawn.
      const tour = parseTutorialLink(q);
      if (tour) setTimeout(() => tours.start(tour.id, tour.step), 800);
      // A friend link (`/friend/<address>?name=…`): who invited you, offered once the page is up.
      const invite = parseFriendLink(location.pathname, location.search);
      if (invite) {
        friendship.invite.value = invite;
        history.replaceState(null, "", "/");
      }
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

  const stateObject = {
    offline,
    toolbar,
    tours,
    session,
    backend,
    stores,
    api,
    extensions,
    outbox,
    buckets,
    highlights,
    annotations,
    bookmarks,
    saves,
    history: readingHistory,
    playlists,
    plans,
    files,
    customizations,
    search,
    scriptureCheck,
    position,
    settings,
    discover,
    publishing,
    today,
    profile,
    friendship,
    presence,
    live,
    huddle,
    voice,
    setVoiceMuted,
    audio,
    listening,
    tts,
    speechLang,
    listen,
    tabs,
    get reading() {
      return readingOf();
    },
    selection,
    ui,
    sessionTrouble,
    signIn,
    signOut,
    start,
  };
  return stateObject;
}

export type ReaderState = ReturnType<typeof createReaderState>;
