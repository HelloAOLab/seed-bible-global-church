// THE READER STATE FOR A TEST — `createReaderState` over the in-memory dev backend (or a backend the test brings,
// such as the live one over fakeWorkspace), memory stores and the canned Bible API, with the dwell and the
// presence beat shortened. `url` sets the page's location before boot so `?embed=`, `?theme=`, `?customization=`,
// `/read/...` and `?v=` run for real; `identity: null` is a stranger; `offline` makes the backend unreachable.
import { vi } from "vitest";
import { createReaderState } from "../../apps/reader-web/src/state";
import {
  createDevBackend,
  type DevBackend,
} from "../../apps/reader-web/src/backend/dev";
import type {
  ReaderBackend,
  ReaderIdentity,
} from "../../apps/reader-web/src/backend/ReaderBackend";
import {
  memoryStores,
  type ReaderStores,
} from "../../apps/reader-web/src/backend/offline/db";
import type { ReaderSession } from "../../apps/reader-web/src/session";
import type { ReadingApi } from "../../apps/reader-web/src/state/reading/reading";
import { initI18n, setLanguage } from "../../apps/reader-web/src/i18n";
import { bibleResponses, type BibleResponses } from "./bibleResponses";

export const TEST_READER: ReaderIdentity = {
  agent: "0x" + "ab".repeat(20),
  name: "Seed Reader",
  wire: true,
};

export interface TestReaderStateOptions {
  /** The page's URL before boot (path and query; the origin is the test host's). */
  url?: string;
  /** Who is signed in; `null` is anonymous; default TEST_READER. */
  identity?: ReaderIdentity | null;
  /** A session to hold (the live backend reads its token); derived from `identity` when omitted. */
  session?: ReaderSession | null;
  offline?: boolean;
  locale?: string;
  /** A backend to use instead of the dev one (the live backend over fakeWorkspace). */
  backend?: ReaderBackend;
  stores?: ReaderStores;
  bible?: BibleResponses;
  api?: ReadingApi;
  readDwellMs?: number;
  presenceBeatMs?: number;
}

export interface TestReaderState {
  state: ReturnType<typeof createReaderState>;
  /** The dev backend (its buckets, calls, works, registry) — null when the test brought another. */
  backend: DevBackend | null;
  stores: ReaderStores;
  bible: BibleResponses;
  session: ReaderSession | null;
  online: { value: boolean };
}

export function sessionFor(
  identity: ReaderIdentity,
  token = `test:${identity.agent}`
): ReaderSession {
  return {
    token,
    estate: "faithnet",
    name: identity.name,
    sub: identity.agent,
    via: "home",
    wire: identity.wire,
  };
}

/** Put the page at `url` before the state boots (jsdom's history, or a `location` global under node). */
export function setPageUrl(url: string): void {
  if (typeof window !== "undefined" && typeof history !== "undefined") {
    history.replaceState(null, "", url);
    return;
  }
  const u = new URL(url, "https://seed-reader.faithnet.io");
  vi.stubGlobal("location", u);
  if (typeof history === "undefined")
    vi.stubGlobal("history", {
      replaceState: (_s: unknown, _t: string, next?: string) => {
        if (next) vi.stubGlobal("location", new URL(next, u));
      },
      pushState: () => {},
      state: null,
    });
}

export async function createTestReaderState(
  opts: TestReaderStateOptions = {}
): Promise<TestReaderState> {
  if (opts.url) setPageUrl(opts.url);
  await initI18n(["en"]);
  if (opts.locale) await setLanguage(opts.locale);
  const identity = opts.identity === undefined ? TEST_READER : opts.identity;
  const session =
    opts.session !== undefined
      ? opts.session
      : identity
        ? sessionFor(identity)
        : null;
  const dev = opts.backend ? null : createDevBackend(identity);
  const backend = opts.backend ?? dev!;
  const stores = opts.stores ?? memoryStores();
  const bible = opts.bible ?? bibleResponses();
  const online = { value: !opts.offline };
  if (opts.offline) dev?.setOffline(true);
  const state = createReaderState({
    backend,
    stores,
    api: opts.api ?? bible.api,
    session,
    isOnline: () => online.value,
    readDwellMs: opts.readDwellMs ?? 10,
    presenceBeatMs: opts.presenceBeatMs ?? 50,
  });
  return { state, backend: dev, stores, bible, session, online };
}
