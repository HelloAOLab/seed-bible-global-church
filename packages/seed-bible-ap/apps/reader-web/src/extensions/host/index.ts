// THE EXTENSION HOST — ported in shape from packages/seed-bible ExtensionManager (docs/porting/ExtensionManager.md):
// an extension registers `{ id, init }`; `init(context)` yields cleanups; installing runs it, uninstalling runs the
// cleanups. What an extension may add: a verse-toolbar tool, a Discover provider, a toolbar item, a chapter-header
// button, a side pane. It emits intents through the app's state; it never fetches a third party with a key (the Bible
// API and the serving plane through the workspace are the only lanes).
import { signal, type Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { ReaderStores } from "../../backend/offline/db";
import type {
  TranslationBookChapter,
  TranslationBook,
} from "../../backend/bible";
import type { ReaderState } from "../../state";

export interface VerseToolContext {
  chapterRef: string;
  start: number;
  end: number;
  verses: number[];
}
export interface VerseTool {
  id: string;
  label: string;
  icon: string;
  priority?: number;
  isVisible?: (ctx: VerseToolContext) => boolean;
  onSelect: (ctx: VerseToolContext) => void;
  /** A short list to choose from instead (the old reader's tool sub-menus, e.g. Ask AI with several providers): when
   *  it gives two or more, the tool opens them as a menu; fewer, and onSelect runs. */
  items?: (ctx: VerseToolContext) => VerseToolItem[];
}
export interface VerseToolItem {
  id: string;
  label: string;
  icon?: string;
  onSelect: (ctx: VerseToolContext) => void;
}

/** A section of the chapter: an edition's heading (scr:EditionMark, section-heading) and the verses under it (scr:Pericope). */
export interface HeadingToolContext {
  chapterRef: string;
  /** The heading's words as the edition prints them. */
  heading: string;
  /** The first and last verse under the heading. */
  start: number;
  end: number;
}
/** A tool on the heading toolbar — what the verse toolbar is to verses, for a section heading. */
export interface HeadingTool {
  id: string;
  label: string;
  icon: string;
  /** Higher comes first. */
  priority?: number;
  isVisible?: (ctx: HeadingToolContext) => boolean;
  onSelect: (ctx: HeadingToolContext) => void;
}

export interface DiscoverItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  onOpen?: () => void;
  /** A picture for the old reader's content cards (videos and articles), grouped under their `author`. */
  image?: string;
  author?: string;
  /** The full text behind "Read more". */
  longText?: string;
  /** A video that can play in place (an embeddable player address). */
  embedUrl?: string;
  /** The section it is listed under within its source (People, Places, Events; Old or New Testament). */
  section?: string;
}
export interface DiscoverContext {
  chapterRef: string;
  chapter: TranslationBookChapter | null;
  books: TranslationBook[];
  selectedVerses: number[];
}
export interface DiscoverProvider {
  id: string;
  label: string;
  discover: (ctx: DiscoverContext) => Promise<DiscoverItem[]>;
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon: string;
  onSelect: () => void;
}

/** A button in the chapter header beside Save and Share (the old reader's quick tools). */
export interface HeaderButton {
  id: string;
  label: string;
  icon: string;
  /** Lower comes first. */
  priority?: number;
  /** Also shown in an embed, where the header is otherwise just Open in New Tab and Text settings. */
  showInEmbedded?: boolean;
  isVisible?: (chapterRef: string) => boolean;
  onSelect: (chapterRef: string) => void;
}

export interface ExtensionPane {
  id: string;
  title: string;
  render: () => ComponentChildren;
}

export interface ExtensionContext {
  state: ReaderState;
  tools: {
    registerVerseTool: (tool: VerseTool) => () => void;
    registerHeadingTool: (tool: HeadingTool) => () => void;
  };
  discover: { registerProvider: (p: DiscoverProvider) => () => void };
  toolbar: { add: (item: ToolbarItem) => () => void };
  header: { add: (button: HeaderButton) => () => void };
  panes: {
    register: (pane: ExtensionPane) => () => void;
    open: (id: string) => void;
    close: (id: string) => void;
  };
  /** This extension's own setting (its saved value, else the default it declared). */
  setting: (key: string) => SettingValue | undefined;
}

export type Cleanup = () => void;
export type SettingValue = string | number | boolean;
/** One field of an extension's settings form (the old reader's text, number, switch and choice fields). */
export interface SettingSpec {
  type: "text" | "number" | "switch" | "choice";
  label: string;
  description?: string;
  default: SettingValue;
  options?: Array<[string, string]>;
  min?: number;
  max?: number;
}
export interface ExtensionRegistration {
  id: string;
  label: string;
  description?: string;
  /** On by default for a new reader. */
  defaultEnabled?: boolean;
  /** The settings it offers under Configure, by key. */
  settings?: Record<string, SettingSpec>;
  init: (context: ExtensionContext) => Iterable<Cleanup>;
}

const KEY = "extensions:enabled";
const SETTINGS_KEY = "extensions:settings";

function registry<T extends { id: string }>(): {
  items: Signal<T[]>;
  add: (t: T) => Cleanup;
} {
  const items = signal<T[]>([]);
  return {
    items,
    add: (t) => {
      items.value = [...items.value.filter((x) => x.id !== t.id), t];
      return () => (items.value = items.value.filter((x) => x.id !== t.id));
    },
  };
}

export function createExtensionHost(stores: ReaderStores) {
  const registered = signal<ExtensionRegistration[]>([]);
  const enabled = signal<Set<string>>(new Set());
  const verseTools = registry<VerseTool>();
  const headingTools = registry<HeadingTool>();
  const providers = registry<DiscoverProvider>();
  const toolbarItems = registry<ToolbarItem>();
  const headerButtons = registry<HeaderButton>();
  const panes = registry<ExtensionPane>();
  const cleanups = new Map<string, Cleanup[]>();
  const errors = signal<Record<string, string>>({});
  let state: ReaderState | null = null;
  let saved: string[] | null = null;
  /** Each extension's changed settings (what is not here is its default). */
  const settings = signal<Record<string, Record<string, SettingValue>>>({});
  const ready = Promise.all([
    stores.prefs.get(KEY).then((v) => {
      if (Array.isArray(v)) saved = v as string[];
    }),
    stores.prefs.get(SETTINGS_KEY).then((v) => {
      if (v && typeof v === "object")
        settings.value = v as Record<string, Record<string, SettingValue>>;
    }),
  ]);
  const settingOf = (id: string, key: string): SettingValue | undefined => {
    const own = settings.value[id]?.[key];
    if (own !== undefined) return own;
    return registered.value.find((r) => r.id === id)?.settings?.[key]?.default;
  };
  async function setSetting(id: string, key: string, value: SettingValue) {
    settings.value = {
      ...settings.value,
      [id]: { ...(settings.value[id] ?? {}), [key]: value },
    };
    await stores.prefs.set(SETTINGS_KEY, settings.value);
  }
  async function resetSettings(id: string) {
    const { [id]: _gone, ...rest } = settings.value;
    settings.value = rest;
    await stores.prefs.set(SETTINGS_KEY, settings.value);
  }
  /** The installed set and settings as a file to keep (the old reader's Download extensions). */
  const exportSet = () => ({
    version: 1,
    enabled: [...enabled.value],
    settings: settings.value,
  });
  /** A kept set put back: those extensions on, the rest off, their settings restored. */
  async function importSet(raw: unknown) {
    const v = raw as {
      enabled?: unknown;
      settings?: Record<string, Record<string, SettingValue>>;
    };
    if (!v || !Array.isArray(v.enabled))
      throw new Error("not an extension set");
    const known = new Set(registered.value.map((r) => r.id));
    const want = new Set(
      (v.enabled as unknown[]).filter(
        (x): x is string => typeof x === "string" && known.has(x)
      )
    );
    for (const r of registered.value)
      if (want.has(r.id) !== enabled.value.has(r.id))
        await setEnabled(r.id, want.has(r.id));
    if (v.settings && typeof v.settings === "object") {
      settings.value = Object.fromEntries(
        Object.entries(v.settings).filter(([k]) => known.has(k))
      );
      await stores.prefs.set(SETTINGS_KEY, settings.value);
    }
  }

  function register(reg: ExtensionRegistration) {
    registered.value = [
      ...registered.value.filter((r) => r.id !== reg.id),
      reg,
    ];
    if (state && enabled.value.has(reg.id)) install(reg.id);
  }

  function context(id: string): ExtensionContext {
    if (!state)
      throw new Error("the extension host is not bound to the reader state");
    const s = state;
    return {
      state: s,
      tools: {
        registerVerseTool: verseTools.add,
        registerHeadingTool: headingTools.add,
      },
      discover: { registerProvider: providers.add },
      toolbar: { add: toolbarItems.add },
      header: { add: headerButtons.add },
      panes: {
        register: panes.add,
        open: (id) => (s.ui.pane.value = `ext:${id}` as never),
        close: (id) => {
          if (s.ui.pane.value === (`ext:${id}` as never))
            s.ui.pane.value = "none";
        },
      },
      setting: (key) => settingOf(id, key),
    };
  }

  function install(id: string) {
    const reg = registered.value.find((r) => r.id === id);
    if (!reg || cleanups.has(id) || !state) return;
    const done: Cleanup[] = [];
    try {
      for (const c of reg.init(context(id))) done.push(c);
      cleanups.set(id, done);
      errors.value = Object.fromEntries(
        Object.entries(errors.value).filter(([k]) => k !== id)
      );
    } catch (e) {
      for (const c of done) c();
      errors.value = {
        ...errors.value,
        [id]: e instanceof Error ? e.message : String(e),
      };
    }
  }

  function uninstall(id: string) {
    for (const c of cleanups.get(id) ?? []) {
      try {
        c();
      } catch {
        /* a cleanup that throws still lets the rest run */
      }
    }
    cleanups.delete(id);
  }

  async function setEnabled(id: string, on: boolean) {
    const next = new Set(enabled.value);
    if (on) next.add(id);
    else next.delete(id);
    enabled.value = next;
    if (on) install(id);
    else uninstall(id);
    await stores.prefs.set(KEY, [...next]);
  }

  /** Bind to the reader state and install what is enabled (the saved set, else the defaults). */
  async function bind(s: ReaderState) {
    state = s;
    await ready;
    const ids =
      saved ??
      registered.value
        .filter((r) => r.defaultEnabled !== false)
        .map((r) => r.id);
    enabled.value = new Set(ids);
    for (const id of ids) install(id);
  }

  return {
    registered,
    enabled,
    errors,
    verseTools: verseTools.items,
    headingTools: headingTools.items,
    providers: providers.items,
    toolbarItems: toolbarItems.items,
    headerButtons: headerButtons.items,
    panes: panes.items,
    register,
    bind,
    setEnabled,
    isEnabled: (id: string) => enabled.value.has(id),
    settings,
    settingOf,
    setSetting,
    resetSettings,
    exportSet,
    importSet,
  };
}

export type ExtensionHost = ReturnType<typeof createExtensionHost>;
