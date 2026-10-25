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

  /** Invite an address; the same address still waiting is sent its invitation again. */
  async function send(
    email: string,
    fromName?: string | null,
    note?: string | null
  ): Promise<{ ok: boolean; again?: boolean; error?: string }> {
    const r = await post<{ again?: boolean }>({
      email: email.trim(),
      ...(fromName ? { fromName } : {}),
      ...(note ? { note } : {}),
    }).catch((e: unknown) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      again: false,
    }));
    if (r.ok) await refresh();
    return {
      ok: !!r.ok,
      ...(r.again ? { again: true } : {}),
      ...(r.error ? { error: r.error } : {}),
    };
  }

  async function cancel(token: string): Promise<boolean> {
    sent.value = sent.value.filter((s) => s.token !== token);
    const r = await post({ token, cancel: true }).catch(() => null);
    await refresh();
    return !!r?.ok;
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
