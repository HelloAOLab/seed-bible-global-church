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

  void deps.stores.prefs.get(SHARE_KEY).then((v) => {
    if (typeof v === "boolean") share.value = v;
  });

  /** One beat for the chapter on screen; nothing when sharing is off, signed out, hidden, or nothing is open. */
  async function beat(): Promise<boolean> {
    if (!share.value || !deps.backend.identity() || !visible()) return false;
    const h = deps.here();
    if (!h) return false;
    await deps.backend.presenceBeat(h);
    lastSent = h.scope;
    return true;
  }

  /** Leave: an immediate end to the beat (closing the tab, signing out, turning sharing off). */
  async function gone() {
    if (lastSent === null) return;
    lastSent = null;
    await deps.backend.presenceBeat({ gone: true }).catch(() => undefined);
  }

  async function setShare(on: boolean) {
    share.value = on;
    await deps.stores.prefs.set(SHARE_KEY, on);
    if (on) await beat();
    else await gone();
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

  /** The beat loop and the leave on page hide; returns the stop. */
  function start(): () => void {
    void beat();
    const t = setInterval(() => void beat(), beatMs);
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
