// CONNECT — Home sign-in for readers, on `@agenticprimitives/connect-client`, the same client every app on the
// rail uses (pattern: verifiable-content-demo `apps/demo-bible-web/src/session.ts`, demo-openbook-reader).
//
// THE KEYS LIVE ONCE, AT THE HOME. This page holds no key, mints no identity, and keeps the id_token in
// sessionStorage only. Three ways in, all the Home's:
//   VIA HOME        the popup PKCE ceremony, else a full-page redirect when the popup is blocked.
//   QUICK CONNECT   one of the Home's sample people (the seed demo reader among them).
//   DEV READER      local dev only — the seed reader as a `dev:<handle>` token reader-a2a accepts with
//                   DEV_STUB_SESSIONS=1. Labelled as such everywhere it appears; it has no Home and no wire.
//
// THE WIRE (agenticprimitives spec 412 W5). Every Home sign-in asks for the `ask-as-me` template too: beside the
// id_token (who) the Home returns a delegation (how) — reader → reader-a2a's asking key, pinned to `harness.ask`,
// listed under the reader's Connected assistants and revocable there. This page hands it to reader-a2a
// (`/api/connect`) and forgets it; with it the reader's OWN agent writes their Library as them. The FedCM lane is
// not used: `/fedcm/grant` mints the site-login template only.

import {
  connectViaPopup,
  connectViaRedirect,
  createConnectClient,
  listQuickConnect,
  type ConnectClient,
  type QuickConnectIdentity,
} from "@agenticprimitives/connect-client";
import {
  ALL_ESTATES,
  READER_CLIENT_ID,
  estateById,
  type EstateId,
} from "../../../estate/faithnet";
import { connectActWires, connectWire, whoAmI } from "./api";

export const CLIENT_ID = READER_CLIENT_ID;
export const RELAY_CHANNEL = "seed-bible-reader-connect-relay";
export const ESTATES = ALL_ESTATES;
export const DEFAULT_ESTATE: EstateId = "faithnet";
/** The relying delegate the Home registers for `seed-bible-reader` — set at client registration (an operator step). */
const CONNECT_DELEGATE =
  (import.meta.env["VITE_CONNECT_DELEGATE"] as string | undefined) ?? "";
export const HOME_SIGNIN_AVAILABLE = /^0x[0-9a-fA-F]{40}$/.test(
  CONNECT_DELEGATE
);
export const DEV_READER_AVAILABLE = Boolean(import.meta.env.DEV);
const ASK_AS_ME = "ask-as-me";
const ACT_AS_ME = "act-as-me";
/** The acts the reader asks to run without the Home's window (the Home registers only these for this client). */
export const FRIEND_ACTS = ["person.contact.invite", "person.contact.remove"];

const KEY = "sbr.session";
const PENDING_KEY = "sbr.connect.pending";

export interface ReaderSession {
  readonly token: string;
  readonly estate: EstateId;
  readonly name: string;
  readonly sub: string;
  readonly via: "home" | "quick-connect" | "dev-stub";
  /** A sample person's handle at the Home (quick-connect), to ask for them again. */
  readonly handle?: string;
  /** Whether reader-a2a now holds this reader's ask-as-me wire (their Library can be written as them). */
  readonly wire: boolean;
  /** Why the wire is missing, in the Home's or the workspace's words — reading still works without it. */
  readonly wireNote?: string;
}

type Wire = Record<string, unknown>;

export function loadSession(): ReaderSession | null {
  try {
    return JSON.parse(
      sessionStorage.getItem(KEY) || "null"
    ) as ReaderSession | null;
  } catch {
    return null;
  }
}
function save(s: ReaderSession | null): void {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

export function signOut(): void {
  save(null);
}

function isAllowedIssuer(estateId: EstateId, origin: string): boolean {
  const est = estateById(estateId);
  if (!est) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return false;
    const h = u.hostname;
    return (
      h === est.homeHost || h === est.homeZone || h.endsWith(`.${est.homeZone}`)
    );
  } catch {
    return false;
  }
}

function clientFor(
  estateId: EstateId,
  template: string = ASK_AS_ME
): ConnectClient {
  const est = estateById(estateId);
  if (!est) throw new Error("unknown estate");
  const c = createConnectClient({
    clientId: CLIENT_ID,
    delegate: CONNECT_DELEGATE as `0x${string}`,
    redirectUri: () => `${location.origin}/`,
    scope: "openid agent profile",
    resolveAuthOrigin: () => est.home,
    isAllowedIssuerOrigin: (origin) => isAllowedIssuer(estateId, origin),
  });
  // The same client, asking for the ask-as-me template on every authorize it builds — and for the Home's person
  // chooser (OIDC prompt=select_account): signing in to the reader picks who, rather than taking whoever the Home
  // already has signed in (a demo person picked here used to come back as the browser's last Home session).
  const retemplate = async (
    start: Awaited<ReturnType<ConnectClient["startEnrollment"]>>
  ) => {
    const u = new URL(start.url);
    u.searchParams.set("delegation_template", template);
    // Allowing an act is for the person already signed in here, not a choice of who.
    if (template === ASK_AS_ME) u.searchParams.set("prompt", "select_account");
    return { ...start, url: u.toString() };
  };
  return {
    ...c,
    startEnrollment: (name, opts) =>
      c.startEnrollment(name, opts).then(retemplate),
  };
}

/** The code → id_token + the delegations the Home minted. `connect-client`'s `exchangeCode` drops the
 *  `askDelegation` an `ask_with_login` client receives, so the exchange is made here, at the Home's own /token. */
async function exchange(
  authOrigin: string,
  code: string,
  codeVerifier: string
): Promise<{
  idToken: string;
  askDelegation?: Wire;
  delegation?: Wire;
  delegations?: Wire[];
}> {
  const base = authOrigin.replace(/\/$/, "");
  const r = (await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: `${location.origin}/`,
    }),
  }).then((res) => res.json())) as {
    id_token?: string;
    error?: string;
    delegation?: Wire;
    askDelegation?: Wire;
    delegations?: Wire[];
  };
  if (!r.id_token) throw new Error(r.error || "the Home returned no id_token");
  return {
    idToken: r.id_token,
    ...(r.delegations ? { delegations: r.delegations } : {}),
    ...(r.askDelegation ? { askDelegation: r.askDelegation } : {}),
    ...(r.delegation ? { delegation: r.delegation } : {}),
  };
}

/** Hand the wire to reader-a2a, which checks it is this reader's and names its key. Never fatal: reading works
 *  without it; the record in their Library does not. */
async function handWire(
  token: string,
  wire: Wire | undefined
): Promise<{ wire: boolean; wireNote?: string }> {
  if (!wire) {
    // The Home minted nothing this time; the workspace may still hold the wire from an earlier sign-in.
    const me = await whoAmI(token).catch(() => null);
    if (me?.ok && me.wire)
      return {
        wire: true,
        wireNote:
          "Your permission from an earlier sign-in is still held by the reader workspace.",
      };
    return {
      wire: false,
      wireNote:
        "Your Home returned no permission for your agent to keep your reading record — reading still works.",
    };
  }
  const out = await connectWire(token, wire);
  return out.ok
    ? { wire: true }
    : {
        wire: false,
        wireNote: `The reader could not keep your permission (${out.error ?? "refused"}) — reading still works.`,
      };
}

/** The end of a Home sign-in: the code exchanged, the id_token verified, the wire handed to reader-a2a. */
export async function finish(
  c: ConnectClient,
  estateId: EstateId,
  authOrigin: string,
  code: string,
  codeVerifier: string,
  nonce: string
): Promise<ReaderSession> {
  const ex = await exchange(authOrigin, code, codeVerifier);
  const claims = (await c.verifyIdToken(
    authOrigin,
    ex.idToken,
    nonce
  )) as unknown as Record<string, unknown>;
  // An `ask_with_login` client gets the wire beside the site grant (`askDelegation`); asking for the ask-as-me
  // TEMPLATE (as this reader does) makes the wire the sign-in's own delegation. reader-a2a checks either is this
  // reader's, for its key, before keeping it.
  const handed = await handWire(ex.idToken, ex.askDelegation ?? ex.delegation);
  const s: ReaderSession = {
    token: ex.idToken,
    estate: estateId,
    name: String(claims["name"] ?? claims["agent_name"] ?? ""),
    sub: String(claims["canonical_agent_id"] ?? claims["sub"] ?? ""),
    via: "home",
    ...handed,
  };
  save(s);
  return s;
}

/** Sign in with your own Home. Popup first; a full-page redirect when the popup is blocked, announced. */
export async function connectViaHome(
  estateId: EstateId,
  onProgress?: (msg: string) => void
): Promise<ReaderSession | null> {
  if (!HOME_SIGNIN_AVAILABLE)
    throw new Error(
      `Home sign-in is not registered yet (client "${CLIENT_ID}" needs a delegate — VITE_CONNECT_DELEGATE).`
    );
  const c = clientFor(estateId);
  onProgress?.("Opening your Home…");
  const popup = await connectViaPopup(c, undefined, RELAY_CHANNEL, onProgress);
  if (popup.status === "success") {
    onProgress?.("Signing you in…");
    return finish(
      c,
      estateId,
      popup.authOrigin,
      popup.code,
      popup.codeVerifier,
      popup.stash.nonce
    );
  }
  if (popup.status === "cancelled") return null;
  onProgress?.("The popup was blocked — continuing in this window.");
  const start = await connectViaRedirect(c);
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ ...start.stash, estate: estateId })
  );
  location.href = start.url;
  return null;
}

/** Complete a redirect return if this load is one; null on every ordinary load. */
export async function completeRedirectIfReturning(): Promise<ReaderSession | null> {
  const sp = new URLSearchParams(location.search);
  const code = sp.get("code");
  const state = sp.get("state");
  if (!code || !state) return null;
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  const stash = JSON.parse(raw) as {
    state: string;
    authOrigin: string;
    codeVerifier: string;
    nonce: string;
    estate: EstateId;
  };
  sessionStorage.removeItem(PENDING_KEY);
  history.replaceState({}, "", "/");
  if (stash.state !== state) return null;
  return finish(
    clientFor(stash.estate),
    stash.estate,
    stash.authOrigin,
    code,
    stash.codeVerifier,
    stash.nonce
  );
}

/** The sample people the Home offers; `[]` when it offers none (that is the Home's answer, not an error). */
export async function listSamplePeople(
  estateId: EstateId
): Promise<QuickConnectIdentity[]> {
  const est = estateById(estateId);
  if (!est) return [];
  return listQuickConnect({ homeOrigin: est.home, clientId: CLIENT_ID });
}

/** Sign in as one of them — a real token from the real issuer, verified the same way as anyone's, with the
 *  ask-as-me wire asked for by name (the published `connectAsQuickConnect` cannot name a template). */
export async function connectAsSamplePerson(
  estateId: EstateId,
  handle: string
): Promise<ReaderSession> {
  const est = estateById(estateId);
  if (!est) throw new Error("unknown estate");
  const r = (await fetch(`${est.home}/connect/demo-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      handle,
      client_id: CLIENT_ID,
      delegation_template: ASK_AS_ME,
    }),
  }).then((res) => res.json())) as {
    sub?: string;
    agent_name?: string | null;
    id_token?: string;
    delegation?: Wire;
    error?: string;
  };
  if (!r.id_token)
    throw new Error(r.error || "the Home would not sign this person in");
  const handed = await handWire(r.id_token, r.delegation);
  const s: ReaderSession = {
    token: r.id_token,
    estate: estateId,
    name: r.agent_name ?? handle,
    sub: r.sub ?? "",
    via: "quick-connect",
    handle,
    ...handed,
  };
  save(s);
  return s;
}

/** Local dev only: the seed demo reader as a `dev:<handle>` token. reader-a2a refuses it unless DEV_STUB_SESSIONS=1. */
export function signInAsDevReader(
  handle: string,
  name: string,
  sa: string
): ReaderSession {
  if (!DEV_READER_AVAILABLE)
    throw new Error("dev readers exist in local dev only");
  const s: ReaderSession = {
    token: `dev:${handle}`,
    estate: DEFAULT_ESTATE,
    name: `${name} (dev reader)`,
    sub: sa,
    via: "dev-stub",
    wire: false,
    wireNote: "A dev reader has no Home, so reading stays local-only.",
  };
  save(s);
  return s;
}

/**
 * Let the reader add and remove friends with no Home window each time (act-as-me): ONE consent at the Home for just
 * those two acts, good for 30 days and revocable there under Connected assistants. The Home returns a standing wire
 * per act, naming reader-a2a's act key; reader-a2a keeps them. A sample person's custodian signs them at the Home
 * without a window; anyone else approves in the Home's window.
 */
export async function allowFriendActs(
  s: ReaderSession,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; error?: string }> {
  const est = estateById(s.estate);
  if (!est) return { ok: false, error: "unknown estate" };
  let token: string;
  let ask: Wire | undefined;
  let acts: Wire[] | undefined;
  if (s.via === "quick-connect") {
    if (!s.handle) return { ok: false, error: "sign in again to allow this" };
    const r = (await fetch(`${est.home}/connect/demo-signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: s.handle,
        client_id: CLIENT_ID,
        delegation_template: ACT_AS_ME,
        act: { capabilities: FRIEND_ACTS },
      }),
    })
      .then((res) => res.json())
      .catch(() => ({ error: "the Home could not be reached" }))) as {
      id_token?: string;
      delegation?: Wire;
      delegations?: Wire[];
      error?: string;
    };
    if (!r.id_token) return { ok: false, error: r.error ?? "the Home said no" };
    token = r.id_token;
    ask = r.delegation;
    acts = r.delegations;
  } else if (s.via === "home") {
    const c = clientFor(s.estate, ACT_AS_ME);
    onProgress?.("Opening your Home…");
    const popup = await connectViaPopup(
      c,
      undefined,
      RELAY_CHANNEL,
      onProgress
    );
    if (popup.status === "cancelled") return { ok: false };
    if (popup.status !== "success")
      return {
        ok: false,
        error:
          "your browser blocked the Home's window — allow pop-ups for this site and try again",
      };
    const ex = await exchange(popup.authOrigin, popup.code, popup.codeVerifier);
    await c.verifyIdToken(popup.authOrigin, ex.idToken, popup.stash.nonce);
    token = ex.idToken;
    ask = ex.delegation;
    acts = ex.delegations;
  } else {
    return { ok: false, error: "a dev reader has no Home" };
  }
  if (!acts?.length)
    return {
      ok: false,
      error: "the Home returned no permission for these acts",
    };
  // The consent also renewed the ask-as-me wire (the act set rides beside it).
  if (ask) await connectWire(token, ask).catch(() => null);
  return connectActWires(token, acts);
}
