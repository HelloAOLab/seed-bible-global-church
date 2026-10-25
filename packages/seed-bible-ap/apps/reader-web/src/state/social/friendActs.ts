// FRIENDS WITHOUT THE HOME'S WINDOW — whether the reader allowed this reader to add and remove friends for them
// (act-as-me: one consent at their Home for just those two acts, 30 days, revocable there), and doing it through
// reader-a2a (`/api/friends/*`; the browser talks to that origin only). Not allowed, lapsed or revoked: the friendship
// module opens the Home's window as before.
import { signal } from "@preact/signals";
import type { FriendActing } from "./friendship";

/**
 * Off until the estate's agent can FINISH a contact step under a standing wire. Today it can derive the mandate, but
 * adding a contact also needs the person's own signature on the contact grant, and removing redeems only a
 * person-signed mandate (ap-home agent-runtime contacts.ts) — so with this on, Add would park and ask for the Home
 * anyway. The consent, the wires and the routes are in place for when it can.
 */
export const FRIEND_ACTS_READY = false;

export function createFriendActs(deps: {
  /** reader-a2a's origin. */
  base: string;
  bearer: () => string | null;
  /** The Home's consent (session.ts `allowFriendActs`). */
  consent: () => Promise<{ ok: boolean; error?: string }>;
  fetchImpl?: typeof fetch;
}) {
  const f = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const allowed = signal(false);
  /** When the permission lapses (seconds since the epoch), when known. */
  const until = signal<number | null>(null);
  const asking = signal(false);
  const error = signal<string | null>(null);

  const call = async (path: string, init: RequestInit = {}) => {
    const token = deps.bearer();
    if (!token) return null;
    const res = await f(`${deps.base}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
      },
    }).catch(() => null);
    return res
      ? ((await res.json().catch(() => ({}))) as Record<string, unknown>)
      : { ok: false, error: "the reader's server could not be reached" };
  };

  async function refresh(): Promise<void> {
    const r = await call("/api/friends/act");
    allowed.value = r?.["allowed"] === true;
    until.value =
      typeof r?.["until"] === "number" ? (r["until"] as number) : null;
  }

  /** Ask the Home once; afterwards adding and removing happen here. */
  async function allow(): Promise<boolean> {
    asking.value = true;
    error.value = null;
    try {
      const r = await deps.consent();
      if (!r.ok) {
        if (r.error) error.value = r.error;
        return false;
      }
      await refresh();
      return allowed.value;
    } finally {
      asking.value = false;
    }
  }

  /** Forget the permission here (revoking it is at the Home, under Connected assistants). */
  async function forget(): Promise<void> {
    await call("/api/friends/act", { method: "DELETE" });
    allowed.value = false;
    until.value = null;
  }

  const acting: FriendActing = {
    allowed: () => FRIEND_ACTS_READY && allowed.value,
    run: async (kind, who) => {
      const r = await call(`/api/friends/${kind}`, {
        method: "POST",
        body: JSON.stringify({ contact: who }),
      });
      if (r?.["ok"] === true) return { ok: true };
      // Lapsed or revoked: stop offering to do it here until the reader allows it again.
      if (r?.["needsSignature"] === true) allowed.value = false;
      return {
        ok: false,
        ...(r?.["needsSignature"] === true ? { needsSignature: true } : {}),
        error: String(r?.["error"] ?? "it couldn't be done here").replace(
          /^needs-signature:\s*/,
          ""
        ),
      };
    },
  };

  return { allowed, until, asking, error, refresh, allow, forget, acting };
}

export type FriendActs = ReturnType<typeof createFriendActs>;
