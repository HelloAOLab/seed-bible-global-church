// WHO TOUCHES THE BROWSER'S STORAGE — localStorage, sessionStorage and indexedDB wrapped so every read, write
// and open is recorded with its key. The page's boot must touch none of it before the edge-rendered chapter is
// adopted, and nothing session-like may ever go to localStorage (AGENTS.md). Install in a test, `vi.unstubAllGlobals()`
// in its afterEach.
import { vi } from "vitest";

export interface StorageAccess {
  store: "localStorage" | "sessionStorage" | "indexedDB";
  op: string;
  key?: string;
}

export interface StorageRecorder {
  accesses: StorageAccess[];
  /** The keys read or written in one store, in order, without repeats. */
  keys(store: StorageAccess["store"]): string[];
}

export function recordStorage(): StorageRecorder {
  const accesses: StorageAccess[] = [];
  const wrap = (store: "localStorage" | "sessionStorage", real: Storage) =>
    new Proxy(real, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (typeof value === "function")
          return (...args: unknown[]) => {
            accesses.push({
              store,
              op: String(prop),
              ...(typeof args[0] === "string" ? { key: args[0] } : {}),
            });
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        if (typeof prop === "string" && !(prop in Storage.prototype))
          accesses.push({ store, op: "get", key: prop });
        return value;
      },
      set(target, prop, value) {
        if (typeof prop === "string")
          accesses.push({ store, op: "set", key: prop });
        return Reflect.set(target, prop, value);
      },
    });
  vi.stubGlobal("localStorage", wrap("localStorage", window.localStorage));
  vi.stubGlobal(
    "sessionStorage",
    wrap("sessionStorage", window.sessionStorage)
  );
  // jsdom has no IndexedDB; a request that never settles is enough to see who asked.
  const request = () => ({
    onsuccess: null,
    onerror: null,
    onblocked: null,
    onupgradeneeded: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("indexedDB", {
    open(name: string) {
      accesses.push({ store: "indexedDB", op: "open", key: name });
      return request();
    },
    deleteDatabase(name: string) {
      accesses.push({ store: "indexedDB", op: "deleteDatabase", key: name });
      return request();
    },
    databases: async () => {
      accesses.push({ store: "indexedDB", op: "databases" });
      return [];
    },
  });
  return {
    accesses,
    keys: (store) => [
      ...new Set(
        accesses.filter((a) => a.store === store && a.key).map((a) => a.key!)
      ),
    ],
  };
}
