// GUIDED TOURS — the old TutorialManager in this app's terms: coachmark tours (a spotlit element and a short card
// with Back / Next / Done), the introduction for a desktop or a phone, contextual tours shown the first time a
// feature is used (the book picker, the translation list), `?tutorial=<id>&tutorialStep=<n>` links, per-tour "seen"
// and a way to turn them all off. Step text is the old reader's (`tutorial.*` keys).
import { computed, signal } from "@preact/signals";
import type { KeyValueStore } from "../../backend/offline/db";

export interface TourStep {
  id: string;
  /** What to spotlight: a CSS selector; the first visible match. */
  target: string;
  titleKey: string;
  title: string;
  bodyKey: string;
  body: string;
}

export interface TourDeps {
  prefs: KeyValueStore<unknown>;
  /** A phone-sized screen: the introduction has its own steps there. */
  isPhone?: () => boolean;
  /** Before a step shows: open what it points at (the search pane, say). */
  prepare?: (tourId: string, step: TourStep) => void;
}

const step = (
  id: string,
  target: string,
  key: string,
  title: string,
  body: string
): TourStep => ({
  id,
  target,
  titleKey: `tutorial.${key}Title`,
  title,
  bodyKey: `tutorial.${key}Body`,
  body,
});

const SETTINGS =
  '.sb-reader-toolbar button[aria-label="Sign in"], .sb-reader-toolbar button[aria-label="Account settings"]';

export const TOURS: Record<
  string,
  { desktop: TourStep[]; phone?: TourStep[] }
> = {
  introduction: {
    desktop: [
      step(
        "tabs",
        ".sb-tabs-sidebar .sb-sidebar-tabs-header",
        "tabs",
        "Tabs and saves",
        "Your open passages and saves live here."
      ),
      step(
        "pane-layout",
        '.sb-tabs-sidebar button[aria-label="Pane layout"]',
        "paneLayout",
        "Arrange your panes",
        "Choose how many passages to read side by side from this layout menu."
      ),
      step(
        "add-tab",
        '.sb-tabs-sidebar button[aria-label="New tab"]',
        "addTab",
        "Open more passages",
        "Add a new tab to read several books or translations side by side."
      ),
      step(
        "toolbar",
        ".sb-reader-toolbar",
        "toolbar",
        "Toolbar",
        "You can customize the toolbar to your liking. By default, book selection, navigation, and search are built in."
      ),
      step(
        "settings",
        SETTINGS,
        "settings",
        "Settings",
        "Customize themes, text, and more here, or install the app to your device."
      ),
    ],
    phone: [
      step(
        "books",
        ".sb-bible-reader-active .sb-bible-reader-title",
        "mobileBooks",
        "Your book/chapter selection",
        "Tap the book name to jump to a different book or chapter."
      ),
      step(
        "passage",
        ".sb-bible-reader-active .sb-bible-reader-translation",
        "mobilePassage",
        "Your current translation",
        "Tap the translation name to jump to a different translation."
      ),
      step(
        "toolbar",
        ".sb-reader-toolbar",
        "mobileToolbar",
        "Toolbar",
        "Switch between the Bible, search, and more from the bottom bar."
      ),
      step(
        "settings",
        SETTINGS,
        "mobileSettings",
        "Settings",
        "Customize text, themes, and reading options here."
      ),
    ],
  },
  "pane-layout": {
    desktop: [
      step(
        "pane-layout",
        '.sb-tabs-sidebar button[aria-label="Pane layout"]',
        "paneLayout",
        "Arrange your panes",
        "Choose how many passages to read side by side from this layout menu."
      ),
    ],
  },
  "add-tab": {
    desktop: [
      step(
        "add-tab",
        '.sb-tabs-sidebar button[aria-label="New tab"]',
        "addTab",
        "Open more passages",
        "Add a new tab to read several books or translations side by side."
      ),
    ],
  },
  search: {
    desktop: [
      step(
        "search",
        '.sb-app-pane input[type="search"]',
        "selectorSearch",
        "Search by",
        "Search by chapter, verse or book from here."
      ),
    ],
  },
  selector: {
    desktop: [
      step(
        "books",
        ".sb-selector-panel .sidebar-results",
        "selectorBooks",
        "Select books and chapters",
        "Choose a chapter from here to begin reading."
      ),
      step(
        "translation",
        ".sidebar-translation-selector",
        "selectorTranslation",
        "Select a Bible text",
        "Choose from any of the available versions."
      ),
      step(
        "testament",
        ".sb-selector-panel .dropdown",
        "selectorTestament",
        "Filter book options",
        "Show all books, or narrow to just the Old Testament, New Testament, or extra-biblical writings."
      ),
      step(
        "search",
        ".sb-selector-panel .searchbar",
        "selectorSearch",
        "Search by",
        "Search by chapter, verse or book from here."
      ),
    ],
  },
  "offline-download": {
    desktop: [
      step(
        "offline",
        ".sb-translation-offline",
        "offlineDownload",
        "Tap to keep it on your device",
        "Any translation with this icon can be saved for offline reading."
      ),
    ],
  },
};

/** Tours a link may start (the old LINKABLE_TUTORIAL_IDS); the contextual ones need their panel open first. */
export const LINKABLE_TOURS = [
  "introduction",
  "pane-layout",
  "add-tab",
  "search",
] as const;
const DESKTOP_ONLY = ["pane-layout", "add-tab"];

export function parseTutorialLink(
  params: URLSearchParams
): { id: string; step: number } | null {
  const id = params.get("tutorial");
  if (!id || !(LINKABLE_TOURS as readonly string[]).includes(id)) return null;
  const raw = params.get("tutorialStep") ?? "";
  return { id, step: /^\d+$/.test(raw) ? Number(raw) : 0 };
}

const SEEN = "tours:seen";
const OFF = "tours:off";

export function createTours(deps: TourDeps) {
  const active = signal<{ id: string; index: number } | null>(null);
  const seen = signal<string[]>([]);
  const off = signal(false);
  void Promise.all([deps.prefs.get(SEEN), deps.prefs.get(OFF)])
    .then(([s, o]) => {
      seen.value = Array.isArray(s) ? (s as string[]) : [];
      off.value = o === true;
    })
    .catch(() => undefined);

  const stepsOf = (id: string): TourStep[] => {
    const t = TOURS[id];
    if (!t) return [];
    return deps.isPhone?.() && t.phone ? t.phone : t.desktop;
  };
  const steps = computed(() => (active.value ? stepsOf(active.value.id) : []));
  const current = computed(() =>
    active.value ? (steps.value[active.value.index] ?? null) : null
  );

  const markSeen = (id: string) => {
    if (seen.value.includes(id)) return;
    seen.value = [...seen.value, id];
    void deps.prefs.set(SEEN, seen.value).catch(() => undefined);
  };
  const show = (id: string, index: number) => {
    const list = stepsOf(id);
    if (!list.length) return false;
    const i = Math.min(Math.max(index, 0), list.length - 1);
    deps.prepare?.(id, list[i]!);
    active.value = { id, index: i };
    return true;
  };

  return {
    active,
    steps,
    current,
    seen,
    off,
    /** Start a tour (from a button or a link) whether or not it was seen before. */
    start(id: string, index = 0): boolean {
      if (deps.isPhone?.() && DESKTOP_ONLY.includes(id)) return false;
      return show(id, index);
    },
    /** The first time a feature is used: show its tour once, unless tours are turned off. */
    startContextual(id: string): boolean {
      if (off.value || active.value || seen.value.includes(id)) return false;
      return show(id, 0);
    },
    next() {
      const a = active.value;
      if (!a) return;
      if (a.index + 1 >= steps.value.length) return this.done();
      show(a.id, a.index + 1);
    },
    back() {
      const a = active.value;
      if (a && a.index > 0) show(a.id, a.index - 1);
    },
    done() {
      const a = active.value;
      if (a) markSeen(a.id);
      active.value = null;
    },
    /** Skip this tour; with `turnOffAll`, no contextual tour shows again (a link or a button still starts one). */
    skip(turnOffAll = false) {
      this.done();
      if (turnOffAll) {
        off.value = true;
        void deps.prefs.set(OFF, true).catch(() => undefined);
      }
    },
    /** Show tours again (Account → Tutorials). */
    turnOn() {
      off.value = false;
      seen.value = [];
      void deps.prefs.set(OFF, false).catch(() => undefined);
      void deps.prefs.set(SEEN, []).catch(() => undefined);
    },
  };
}

export type Tours = ReturnType<typeof createTours>;
