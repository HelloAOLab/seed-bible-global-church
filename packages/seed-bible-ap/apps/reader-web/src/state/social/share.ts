// SHARING WITH A FRIEND — the reader's side of reader-a2a's seed.share.* (skills/share.ts). Sharing a note or a
// prayer with one friend saves it on that friend's shelf in the reader's OWN Library; the first time for that friend
// it also asks them to sign, at their Home, a year's read grant on the shelf and the message that carries the friend
// the link (`/shared-with-me?from=&shelf=&g=`). The friend's reader keeps that link's grant on the device and reads the
// shelf with its own agent under it, so a later share reaches them with no new signing and no new message.
import { signal } from "@preact/signals";
import type { KeyValueStore } from "../../backend/offline/db";

export const SHARE_KINDS = ["note", "prayer", "plan", "playlist"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface SharedItem {
  key: string;
  kind: ShareKind;
  title: string;
  passage?: string;
  text: string;
  sharedAt?: string;
}

/** What a parked act answers: the run the reader signs at their Home (`/you?run=`). */
export interface Parked {
  parked: true;
  runRef: string;
  prompt?: string;
}

export interface ShareBackend {
  sharePut(
    friend: string,
    item: SharedItem | { key: string; remove: true }
  ): Promise<{ shelf: string }>;
  shareGrants(friend: string): Promise<{ grant: unknown | null }>;
  shareGrant(friend: string): Promise<Parked | { grant: unknown }>;
  shareNotify(
    friend: string,
    message: string
  ): Promise<Parked | { sent: true }>;
  shareFetch(
    publisher: string,
    id: string,
    grant: unknown
  ): Promise<{ items: SharedItem[] }>;
}

/** A shelf someone shared with this reader, as the link brought it. */
export interface Received {
  from: string;
  name?: string;
  shelf: string;
  grant: unknown;
  receivedAt: string;
}

export type ShareStep =
  | "saving"
  | "sign-grant"
  | "sign-message"
  | "done"
  | "failed";
export interface ShareProgress {
  key: string;
  friend: string;
  friendName: string;
  step: ShareStep;
  error?: string;
  /** The link that opens this friend's shelf, once the grant is known (to copy, or to send another way). */
  link?: string;
}

export interface ShareDeps {
  backend: ShareBackend;
  prefs: KeyValueStore<unknown>;
  /** The reader's own agent address and name; null signed out. */
  me: () => { agent: string; name?: string } | null;
  homeOrigin: string;
  origin: string;
  openWindow?: (url: string) => Window | null;
  now?: () => number;
  /** How often, and for how long, to look for the grant the reader is signing at their Home. */
  pollMs?: number;
  waitMs?: number;
}

const RECEIVED = "shares:received";
const b64url = (s: string) =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/** The link that carries a friend to a shelf: whose, which document, and the grant to read it with. */
export function shareLink(
  origin: string,
  from: string,
  shelf: string,
  grant: unknown,
  name?: string
): string {
  const q = new URLSearchParams({
    from,
    shelf,
    g: b64url(JSON.stringify(grant)),
  });
  if (name) q.set("name", name);
  return `${origin}/shared-with-me?${q}`;
}

/** A `/shared-with-me` link read back, or null when it is not one. */
export function readShareLink(url: URL): Omit<Received, "receivedAt"> | null {
  if (url.pathname !== "/shared-with-me") return null;
  const from = (url.searchParams.get("from") ?? "").toLowerCase();
  const shelf = url.searchParams.get("shelf") ?? "";
  const g = url.searchParams.get("g") ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(from) || !shelf || !g) return null;
  try {
    const name = url.searchParams.get("name") ?? undefined;
    return {
      from,
      shelf,
      grant: JSON.parse(fromB64url(g)),
      ...(name ? { name } : {}),
    };
  } catch {
    return null;
  }
}

const isParked = (x: unknown): x is Parked =>
  !!x && (x as Parked).parked === true;

export function createShare(deps: ShareDeps) {
  const now = deps.now ?? Date.now;
  const open =
    deps.openWindow ??
    ((u: string) => window.open(u, "_blank", "popup,width=520,height=760"));
  const progress = signal<ShareProgress | null>(null);
  const received = signal<Received[]>([]);
  /** What each shelf holds, by `from|shelf`, as last read (or why it could not be). */
  const shelves = signal<
    Record<string, { items: SharedItem[] } | { error: string }>
  >({});

  void deps.prefs
    .get(RECEIVED)
    .then((r) => {
      if (Array.isArray(r)) received.value = r as Received[];
    })
    .catch(() => undefined);

  const signAt = (runRef: string) =>
    `${deps.homeOrigin}/you?run=${encodeURIComponent(runRef)}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** The grant once the reader has signed it at their Home: looked for until it lands or the wait runs out. */
  async function waitForGrant(friend: string): Promise<unknown | null> {
    const until = now() + (deps.waitMs ?? 180_000);
    while (now() < until) {
      await sleep(deps.pollMs ?? 4000);
      const { grant } = await deps.backend
        .shareGrants(friend)
        .catch(() => ({ grant: null }));
      if (grant) return grant;
    }
    return null;
  }

  /** Share one thing with one friend. The first share with them asks for two signatures at the reader's Home. */
  async function shareWith(
    friend: { agent: string; name?: string | null },
    item: SharedItem
  ): Promise<boolean> {
    const me = deps.me();
    const who = friend.agent.toLowerCase();
    const friendName = friend.name || who;
    let link: string | undefined;
    const step = (s: ShareStep, error?: string) =>
      (progress.value = {
        key: item.key,
        friend: who,
        friendName,
        step: s,
        ...(error ? { error } : {}),
        ...(link ? { link } : {}),
      });
    if (!me) {
      step("failed", "Sign in to share with a friend.");
      return false;
    }
    try {
      step("saving");
      const { shelf } = await deps.backend.sharePut(who, item);
      let { grant } = await deps.backend.shareGrants(who);
      if (grant) {
        link = shareLink(deps.origin, me.agent, shelf, grant, me.name);
        step("done");
        return true;
      }
      // First share with this friend: the read grant, signed at the reader's Home.
      const asked = await deps.backend.shareGrant(who);
      if (isParked(asked)) {
        step("sign-grant");
        open(signAt(asked.runRef));
        grant = await waitForGrant(who);
        if (!grant) {
          step(
            "failed",
            "The grant was not signed. Share again to try once more."
          );
          return false;
        }
      } else grant = asked.grant;
      // And the message that carries them the link, signed there too.
      link = shareLink(deps.origin, me.agent, shelf, grant, me.name);
      const message = `${me.name ?? "A friend"} shared with you in Seed Bible: ${item.title}. Open it here: ${link}`;
      const sent = await deps.backend.shareNotify(who, message);
      if (isParked(sent)) {
        step("sign-message");
        open(signAt(sent.runRef));
      }
      step("done");
      return true;
    } catch (e) {
      step("failed", e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function unshare(friend: string, key: string) {
    await deps.backend.sharePut(friend.toLowerCase(), { key, remove: true });
  }

  /** Keep a shelf a link brought, then read it. */
  async function accept(r: Omit<Received, "receivedAt">) {
    const rest = received.value.filter(
      (x) => !(x.from === r.from && x.shelf === r.shelf)
    );
    received.value = [
      { ...r, receivedAt: new Date(now()).toISOString() },
      ...rest,
    ];
    await deps.prefs.set(RECEIVED, received.value).catch(() => undefined);
    await refresh();
  }

  /** Read every shelf shared with this reader, with their own agent under each grant. */
  async function refresh() {
    if (!deps.me()) return;
    const next: typeof shelves.value = {};
    await Promise.all(
      received.value.map(async (r) => {
        const k = `${r.from}|${r.shelf}`;
        try {
          next[k] = await deps.backend.shareFetch(r.from, r.shelf, r.grant);
        } catch (e) {
          next[k] = { error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    shelves.value = next;
  }

  return {
    progress,
    received,
    shelves,
    shareWith,
    unshare,
    accept,
    refresh,
    signAt,
  };
}

export type Share = ReturnType<typeof createShare>;
