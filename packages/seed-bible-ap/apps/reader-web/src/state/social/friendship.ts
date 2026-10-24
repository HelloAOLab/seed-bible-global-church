// FRIENDSHIP FROM THE READER — what the old FriendsManager and InvitationsManager did, on the Home's terms: your
// friend link to send, the requests waiting on you, and adding someone (asking, or accepting their request). Being
// friends is two contact grants each person signs as themselves, so the one Home step is the signature: the reader
// opens the Home's add-a-contact page for that person and watches the friends view until they show up. "Not now"
// is kept on this device only (declining is doing nothing — spec 401).
import { computed, signal } from "@preact/signals";
import type { Friend, FriendsView } from "../../backend/ReaderBackend";
import type { KeyValueStore } from "../../backend/offline/db";

const NOT_NOW_KEY = "friends:not-now";
/** How long the reader watches for a signature made at the Home, and how often it looks. */
export const WATCH_MS = 3 * 60_000;
export const WATCH_EVERY_MS = 4_000;

export interface FriendInvite {
  agent: string;
  name: string | null;
}

/** `/friend/<address>?name=<name>` — a friend link; null for any other path. */
export function parseFriendLink(
  pathname: string,
  search: string
): FriendInvite | null {
  const m = /^\/friend\/(0x[0-9a-fA-F]{40})\/?$/.exec(pathname);
  if (!m) return null;
  const name = new URLSearchParams(search).get("name")?.trim().slice(0, 80);
  return { agent: m[1]!.toLowerCase(), name: name || null };
}

export function friendLink(
  origin: string,
  agent: string,
  name?: string | null
): string {
  const q = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : "";
  return `${origin}/friend/${agent.toLowerCase()}${q}`;
}

/** Where someone's standing is: a friend, waiting on you, waiting on them, or none of these. */
export function standingOf(
  view: FriendsView | null,
  who: string
): "friend" | "asked-you" | "you-asked" | "none" {
  const w = who.toLowerCase();
  // A typed name may leave off its suffix ("ruth" for ruth.me).
  const is = (f: Friend) =>
    f.agent.toLowerCase() === w ||
    (!!f.name &&
      (f.name.toLowerCase() === w || f.name.toLowerCase().split(".")[0] === w));
  if (!view) return "none";
  if (view.friends.some(is)) return "friend";
  if (view.requests.some(is)) return "asked-you";
  if (view.requested.some(is)) return "you-asked";
  return "none";
}

export function createFriendship(deps: {
  prefs: KeyValueStore<unknown>;
  friendsView: () => FriendsView | null;
  refresh: () => Promise<void>;
  homeOrigin: string;
  openWindow?: (url: string) => void;
  now?: () => number;
}) {
  const notNow = signal<string[]>([]);
  void deps.prefs.get(NOT_NOW_KEY).then((v) => {
    if (Array.isArray(v)) notNow.value = v as string[];
  });
  /** A friend link opened on this device, until it is acted on or closed. */
  const invite = signal<FriendInvite | null>(null);
  /** Someone the reader is adding at their Home right now, and what they were before. */
  const waiting = signal<{
    who: string;
    label: string;
    /** Their standing: before the Home step while `landed` is false, after it once true. */
    was: ReturnType<typeof standingOf>;
    landed: boolean;
  } | null>(null);
  /** Everyone already a friend or asked, so the one who newly appears is the one just added, however they were typed. */
  const known = (v: FriendsView | null) =>
    new Set(
      [...(v?.friends ?? []), ...(v?.requested ?? [])].map((f) =>
        f.agent.toLowerCase()
      )
    );
  let watch: ReturnType<typeof setInterval> | undefined;

  /** Requests the reader has not put aside. */
  const requests = computed(() =>
    (deps.friendsView()?.requests ?? []).filter(
      (r) => !notNow.value.includes(r.agent.toLowerCase())
    )
  );

  function stopWatching() {
    clearInterval(watch);
    watch = undefined;
  }

  /** Add someone (ask, or accept their request): the Home signs it; this device watches for it to land. */
  function add(who: string, label?: string | null): void {
    const was = standingOf(deps.friendsView(), who);
    const url = `${deps.homeOrigin}/contacts?add=${encodeURIComponent(who)}`;
    (
      deps.openWindow ??
      ((u) => window.open(u, "_blank", "popup,width=520,height=760"))
    )(url);
    waiting.value = { who, label: label || who, was, landed: false };
    stopWatching();
    const before = known(deps.friendsView());
    const start = (deps.now ?? Date.now)();
    watch = setInterval(() => {
      void deps.refresh().then(() => {
        const w = waiting.value;
        if (!w) return stopWatching();
        const v = deps.friendsView();
        let now = standingOf(v, w.who);
        const added = [...(v?.friends ?? []), ...(v?.requested ?? [])].find(
          (f) => !before.has(f.agent.toLowerCase())
        );
        if (now !== "friend" && added)
          now = v?.friends.includes(added) ? "friend" : "you-asked";
        const landed =
          now === "friend" || (now === "you-asked" && w.was !== "you-asked");
        if (landed || (deps.now ?? Date.now)() - start > WATCH_MS) {
          if (!landed) waiting.value = null;
          else
            waiting.value = {
              ...w,
              label: added?.name ?? w.label,
              was: now,
              landed: true,
            };
          stopWatching();
        }
      });
    }, WATCH_EVERY_MS);
  }

  /** Someone the reader is removing at their Home (a friend, or a request they sent), until they are gone. */
  const removing = signal<{ who: string; label: string; done: boolean } | null>(
    null
  );
  let removeWatch: ReturnType<typeof setInterval> | undefined;
  /** Remove a friend, or take back a request: the Home revokes the grant (its own flyout asks first). */
  function remove(who: string, label?: string | null): void {
    const url = `${deps.homeOrigin}/contacts?remove=${encodeURIComponent(who)}`;
    (
      deps.openWindow ??
      ((u) => window.open(u, "_blank", "popup,width=520,height=760"))
    )(url);
    removing.value = { who, label: label || who, done: false };
    clearInterval(removeWatch);
    const start = (deps.now ?? Date.now)();
    removeWatch = setInterval(() => {
      void deps.refresh().then(() => {
        const r = removing.value;
        if (!r) return clearInterval(removeWatch);
        const gone = standingOf(deps.friendsView(), r.who) === "none";
        if (gone) removing.value = { ...r, done: true };
        if (gone || (deps.now ?? Date.now)() - start > WATCH_MS) {
          if (!gone) removing.value = null;
          clearInterval(removeWatch);
        }
      });
    }, WATCH_EVERY_MS);
  }

  async function putAside(agent: string) {
    notNow.value = [...new Set([...notNow.value, agent.toLowerCase()])];
    await deps.prefs.set(NOT_NOW_KEY, notNow.value);
  }

  return {
    invite,
    waiting,
    requests,
    notNow,
    add,
    remove,
    removing,
    clearRemoving: () => {
      clearInterval(removeWatch);
      removing.value = null;
    },
    putAside,
    stopWatching,
    /** Done with the "added" line. */
    clearWaiting: () => {
      stopWatching();
      waiting.value = null;
    },
  };
}

export type Friendship = ReturnType<typeof createFriendship>;
