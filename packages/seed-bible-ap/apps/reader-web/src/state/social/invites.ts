// INVITING BY EMAIL — the Home's friend invitations (ap-home `/connect/friend-invite`), asked through reader-a2a
// (`/api/friends/invites`, the browser talks to that origin only) with the reader's own sign-in, so no Home window
// opens: send one to an address, see what you sent (Resend,
// Cancel), and, for an invitation opened here (`/invite/<token>`), who sent it and taking it. The Home mails it; the
// link it mails lands back in this reader. Taking an invitation tells the inviter who joined from it; the two
// contact grants that make the friendship are still each person's own (state/social/friendship.ts).
//
// Whether people who have your email can find you by it is the Home's too (`/api/findable` → `/connect/findable`).
import { signal } from "@preact/signals";

export interface SentInvite {
  token: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  acceptedBy?: string;
  acceptedAt?: number;
}

export interface OpenedInvite {
  from: string;
  fromName: string | null;
  note: string | null;
  accepted: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

/** `/invite/<token>` — an emailed invitation; null for any other path. */
export function parseInviteLink(pathname: string): string | null {
  return /^\/invite\/([a-f0-9]{40,80})\/?$/.exec(pathname)?.[1] ?? null;
}

export function createInvites(deps: {
  /** reader-a2a's origin. */
  base: string;
  /** The reader's sign-in (the Home's id_token for this reader), or null when signed out. */
  bearer: () => string | null;
  fetchImpl?: typeof fetch;
  /** The Home that signs the sender's half of the friendship (`/friend-invitation`); without it, no window opens. */
  homeOrigin?: string;
  /** Opens the Home's window (blank at first, on the tap) and returns it; null when the browser blocked it. */
  openWindow?: (
    url: string
  ) => { location: { href: string }; close: () => void } | null;
}) {
  const f = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sent = signal<SentInvite[]>([]);
  const findable = signal<boolean | null>(null);
  /** The reader's public name (alice.me) — what friends can type to find them; null when they have none, undefined
   *  until read. */
  const publicName = signal<string | null | undefined>(undefined);
  const url = (path: string) => `${deps.base}${path}`;

  async function call<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T & { ok?: boolean; error?: string }> {
    const token = deps.bearer();
    const res = await f(url(path), {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as T & {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok && !body.error) body.error = `the Home answered ${res.status}`;
    return body;
  }
  const post = <T>(body: unknown) =>
    call<T>("/api/friends/invites", {
      method: "POST",
      body: JSON.stringify(body),
    });

  async function refresh(): Promise<void> {
    if (!deps.bearer()) {
      sent.value = [];
      return;
    }
    const r = await call<{ sent?: SentInvite[] }>("/api/friends/invites").catch(
      () => null
    );
    if (r?.sent) sent.value = r.sent;
  }

  /** Invite an address; the same address still waiting is sent its invitation again. The Home's window opens with
   *  it (before anything is awaited — a window opened later is blocked) so the sender signs their half of the
   *  friendship now, and the invitee is a friend the moment they accept. */
  async function send(
    email: string,
    fromName?: string | null,
    note?: string | null
  ): Promise<{
    ok: boolean;
    again?: boolean;
    error?: string;
    window?: "opened" | "blocked";
  }> {
    const win = deps.homeOrigin
      ? (
          deps.openWindow ??
          ((u: string) =>
            window.open(u, "_blank", "popup,width=520,height=640"))
        )("about:blank")
      : undefined;
    const r = await post<{ again?: boolean; token?: string }>({
      email: email.trim(),
      ...(fromName ? { fromName } : {}),
      ...(note ? { note } : {}),
    }).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      again: false,
    }));
    const token = "token" in r ? r.token : undefined;
    if (win && r.ok && token)
      win.location.href = `${deps.homeOrigin}/friend-invitation?${new URLSearchParams({ t: token, from: "seed-reader" })}`;
    else win?.close();
    if (r.ok) await refresh();
    return {
      ok: !!r.ok,
      ...(r.again ? { again: true } : {}),
      ...(r.error ? { error: r.error } : {}),
      ...(win !== undefined && r.ok
        ? { window: win ? ("opened" as const) : ("blocked" as const) }
        : {}),
    };
  }

  async function cancel(token: string): Promise<boolean> {
    sent.value = sent.value.filter((s) => s.token !== token);
    const r = await post({ token, cancel: true }).catch(() => null);
    await refresh();
    return !!r?.ok;
  }

  /** Clear the invitations a person accepted from your list — they became your friend (the invitation did its work),
   *  you removed them, or you would rather not add them — so "Joined from your invitation" never offers them again. */
  async function clearAccepted(agent: string): Promise<void> {
    const who = agent.toLowerCase();
    for (const i of sent.value.filter(
      (x) => x.acceptedBy?.toLowerCase() === who
    ))
      await cancel(i.token);
  }

  async function resend(token: string): Promise<boolean> {
    const r = await post({ token, resend: true }).catch(() => null);
    return !!r?.ok;
  }

  /** Who sent an invitation opened here (no sign-in needed: the token is the secret). */
  async function lookup(
    token: string
  ): Promise<OpenedInvite | { error: string }> {
    const r = await call<OpenedInvite>(
      `/api/friends/invites/lookup?token=${encodeURIComponent(token)}`
    ).catch(
      () =>
        ({ error: "couldn't reach the reader's server" }) as { error: string }
    );
    return "from" in r && r.ok ? r : { error: r.error ?? "invalid invitation" };
  }

  /** Take an invitation as the signed-in reader: the inviter's list now says who joined from it. */
  async function claim(token: string): Promise<boolean> {
    const r = await post<{ claimed?: boolean }>({ token, claim: true }).catch(
      () => null
    );
    return !!r?.claimed;
  }

  async function loadFindable(): Promise<void> {
    if (!deps.bearer()) return;
    const r = await call<{ email?: boolean }>("/api/findable").catch(
      () => null
    );
    if (typeof r?.email === "boolean") findable.value = r.email;
  }

  async function loadPublicName(address: string): Promise<void> {
    const r = await call<{ name?: string | null }>(
      `/api/public-name?address=${encodeURIComponent(address.toLowerCase())}`
    ).catch(() => null);
    if (r && "name" in r) publicName.value = r.name ?? null;
  }

  async function setFindable(on: boolean): Promise<void> {
    const was = findable.value;
    findable.value = on;
    const r = await call("/api/findable", {
      method: "POST",
      body: JSON.stringify({ email: on }),
    }).catch(() => null);
    if (!r?.ok) findable.value = was;
  }

  return {
    sent,
    findable,
    refresh,
    send,
    cancel,
    clearAccepted,
    resend,
    lookup,
    claim,
    loadFindable,
    setFindable,
    publicName,
    loadPublicName,
  };
}

export type Invites = ReturnType<typeof createInvites>;
