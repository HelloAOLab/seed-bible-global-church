// THE EXTENSION HOST — ported in shape from packages/seed-bible ExtensionManager (docs/porting/ExtensionManager.md):
// an extension registers `{ id, init }`; `init(context)` yields cleanups; installing runs it, uninstalling runs the
// cleanups. What an extension may add: a verse-toolbar tool, a Discover provider, a toolbar item, a side pane. It
// emits intents through the app's state; it never fetches a third party with a key (the Bible API and the
// serving plane through the workspace are the only lanes).
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

export interface ExtensionPane {
  id: string;
  title: string;
  render: () => ComponentChildren;
}

export interface ExtensionContext {
  state: ReaderState;
  tools: { registerVerseTool: (tool: VerseTool) => () => void };
  discover: { registerProvider: (p: DiscoverProvider) => () => void };
  toolbar: { add: (item: ToolbarItem) => () => void };
  panes: {
    register: (pane: ExtensionPane) => () => void;
    open: (id: string) => void;
    close: (id: string) => void;
  };
}

export type Cleanup = () => void;
export interface ExtensionRegistration {
  id: string;
  label: string;
  description?: string;
  /** On by default for a new reader. */
  defaultEnabled?: boolean;
  init: (context: ExtensionContext) => Iterable<Cleanup>;
}

const KEY = "extensions:enabled";

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
  const providers = registry<DiscoverProvider>();
  const toolbarItems = registry<ToolbarItem>();
  const panes = registry<ExtensionPane>();
  const cleanups = new Map<string, Cleanup[]>();
  const errors = signal<Record<string, string>>({});
  let state: ReaderState | null = null;
  let saved: string[] | null = null;
  const ready = stores.prefs.get(KEY).then((v) => {
    if (Array.isArray(v)) saved = v as string[];
  });

  function register(reg: ExtensionRegistration) {
    registered.value = [
      ...registered.value.filter((r) => r.id !== reg.id),
      reg,
    ];
    if (state && enabled.value.has(reg.id)) install(reg.id);
  }

  function context(): ExtensionContext {
    if (!state)
      throw new Error("the extension host is not bound to the reader state");
    const s = state;
    return {
      state: s,
      tools: { registerVerseTool: verseTools.add },
      discover: { registerProvider: providers.add },
      toolbar: { add: toolbarItems.add },
      panes: {
        register: panes.add,
        open: (id) => (s.ui.pane.value = `ext:${id}` as never),
        close: (id) => {
          if (s.ui.pane.value === (`ext:${id}` as never))
            s.ui.pane.value = "none";
        },
      },
    };
  }

  function install(id: string) {
    const reg = registered.value.find((r) => r.id === id);
    if (!reg || cleanups.has(id) || !state) return;
    const done: Cleanup[] = [];
    try {
      for (const c of reg.init(context())) done.push(c);
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
    providers: providers.items,
    toolbarItems: toolbarItems.items,
    panes: panes.items,
    register,
    bind,
    setEnabled,
    isEnabled: (id: string) => enabled.value.has(id),
  };
}

export type ExtensionHost = ReturnType<typeof createExtensionHost>;
