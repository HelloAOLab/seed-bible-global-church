// PRESENCE — where the reader is now, told to their friends, and where their friends are. While signed in, the tab
// is visible and sharing is on, the device beats the chapter on screen ("reading John 3 · BSB") every half minute
// through the workspace to the reader's own presence object at the runtime; the beat lapses on its own (90 s), so
// closing the tab or going quiet is enough — `gone` just makes it immediate. Friends' presence is read on demand
// (Today) and every half minute while Today is open. Sharing is a device preference, on by default: friends seeing
// what each other read was the old app's community reading, and a person turns it off in Account.
import { computed, signal } from "@preact/signals";
import type {
  FriendPresence,
  ReaderBackend,
} from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";

export const BEAT_MS = 30_000;
const SHARE_KEY = "presence:share";

export interface PresenceDeps {
  backend: ReaderBackend;
  stores: ReaderStores;
  /** The chapter on screen and how to say it — null when nothing is open. */
  here: () => { scope: string; label: string } | null;
  /** The live session this reader hosts, for friends to join (`session:<id>:<code>`) — null when none. */
  sharing?: () => { scope: string; label: string } | null;
  /** How often friends' presence is looked at in the background (a friend's "is sharing" reaches the reader). */
  friendsEveryMs?: number;
  isVisible?: () => boolean;
  beatMs?: number;
}

export function createPresence(deps: PresenceDeps) {
  const share = signal(true);
  const friends = signal<FriendPresence[]>([]);
  const error = signal<string | null>(null);
  const loading = signal(false);
  const loadedAt = signal<string | null>(null);
  const beatMs = deps.beatMs ?? BEAT_MS;
  const visible =
    deps.isVisible ??
    (() =>
      typeof document === "undefined" || document.visibilityState !== "hidden");
  let lastSent: string | null = null;
  let sharingSent: string | null = null;
  /** Live sessions a friend is sharing that this reader put aside (by session id). */
  const dismissed = signal<string[]>([]);

  void deps.stores.prefs.get(SHARE_KEY).then((v) => {
    if (typeof v === "boolean") share.value = v;
  });

  /** One beat for the chapter on screen; nothing when sharing is off, signed out, hidden, or nothing is open. */
  async function beat(): Promise<boolean> {
    if (!share.value || !deps.backend.identity() || !visible()) return false;
    await beatSharing();
    const h = deps.here();
    if (!h) return false;
    await deps.backend.presenceBeat(h);
    lastSent = h.scope;
    return true;
  }

  /** "I am sharing a live session": beaten while this reader hosts one, ended when it ends. */
  async function beatSharing() {
    const s = deps.sharing?.() ?? null;
    if (s) {
      await deps.backend.presenceBeat({ ...s, channel: "session" });
      sharingSent = s.scope;
    } else if (sharingSent) {
      sharingSent = null;
      await deps.backend
        .presenceBeat({ gone: true, channel: "session" })
        .catch(() => undefined);
    }
  }

  /** Leave: an immediate end to the beat (closing the tab, signing out, turning sharing off). */
  async function gone(forget = false) {
    if (sharingSent) {
      sharingSent = null;
      await deps.backend
        .presenceBeat({ gone: true, channel: "session" })
        .catch(() => undefined);
    }
    if (lastSent === null && !forget) return;
    lastSent = null;
    await deps.backend
      .presenceBeat({ gone: true, ...(forget ? { forget: true } : {}) })
      .catch(() => undefined);
  }

  async function setShare(on: boolean) {
    share.value = on;
    await deps.stores.prefs.set(SHARE_KEY, on);
    if (on) await beat();
    // turned off: friends stop seeing where the reader is now, and where they were this week
    else await gone(true);
  }

  async function refresh() {
    if (!deps.backend.identity()) {
      friends.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      friends.value = await deps.backend.presenceFriends();
      loadedAt.value = new Date().toISOString();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  const here = computed(() => friends.value.filter((f) => f.presence.length));
  /** Friends sharing a live session right now, that this reader has not put aside. */
  const sharingNow = computed(() =>
    friends.value.flatMap((f) =>
      f.presence
        .filter(
          (p) => p.app.endsWith(":session") && p.scope?.startsWith("session:")
        )
        .map((p) => {
          const [, sessionId = "", code = ""] = p.scope!.split(":");
          return {
            agent: f.agent,
            name: f.profileName ?? f.name ?? null,
            sessionId,
            code,
            label: p.label ?? null,
          };
        })
        .filter((s) => s.sessionId && !dismissed.value.includes(s.sessionId))
    )
  );
  const dismiss = (sessionId: string) => {
    dismissed.value = [...dismissed.value, sessionId];
  };

  /** The beat loop and the leave on page hide; returns the stop. */
  function start(): () => void {
    void beat();
    const t = setInterval(() => void beat(), beatMs);
    // friends' presence, now and then while the reader is here — so "Ruth is sharing" reaches them on any screen
    const look = setInterval(() => {
      if (deps.backend.identity() && visible()) void refresh();
    }, deps.friendsEveryMs ?? 60_000);
    const onHide = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        void gone();
      else void beat();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onHide);
    if (typeof window !== "undefined")
      window.addEventListener("pagehide", () => void gone());
    return () => {
      clearInterval(t);
      clearInterval(look);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onHide);
      void gone();
    };
  }

  return {
    share,
    setShare,
    friends,
    here,
    sharingNow,
    dismiss,
    error,
    loading,
    loadedAt,
    beat,
    gone,
    refresh,
    start,
  };
}

export type Presence = ReturnType<typeof createPresence>;
