// CONNECT — Home sign-in for readers, on `@agenticprimitives/connect-client`, the same client every app on the
// rail uses (pattern: verifiable-content-demo `apps/demo-bible-web/src/session.ts`, demo-openbook-reader).
//
// THE KEYS LIVE ONCE, AT THE HOME. This page holds no key and mints no identity; it keeps the Home's id_token on the
// device (localStorage) until it expires — seven days for this app, set at the Home — or Sign out drops it, so a
// reader is not signed out by closing the tab. Three ways in, all the Home's:
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
//
// WHO SIGNED IN LAST. A Home sign-in leaves a hint on the device (the estate and the person's id, nothing else), kept
// across Sign out. A later visit with no sign-in asks that Home once, with no screen, for the same person
// (`sign-in-modes.ts` has the rules); the Home answers with a code or a refusal, and a refusal just leaves the reader
// signed out. The connect client has no helper for this (its only screenless lane is FedCM), so the reader adds the
// two parameters to the client's own authorize URL and goes there as a full page: the Home's session cookie is the
// Home's own, which a frame on this site would not be sent.

import {
  openCentralAuthPopup,
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
import { connectWire, whoAmI } from "./api";
import {
  afterSilentRefusal,
  authorizeUrlFor,
  clearHint,
  hintSubOf,
  homeReturnOf,
  markSilentTried,
  readHint,
  restoredAddress,
  safeReturnTo,
  shouldTrySilent,
  silentTried,
  withoutHomeReturn,
  writeHint,
  type SignInMode,
} from "./sign-in-modes";

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

const KEY = "sbr.session";
const PENDING_KEY = "sbr.connect.pending";

export interface ReaderSession {
  readonly token: string;
  readonly estate: EstateId;
  readonly name: string;
  readonly sub: string;
  readonly via: "home" | "quick-connect" | "dev-stub";
  /** Whether reader-a2a now holds this reader's ask-as-me wire (their Library can be written as them). */
  readonly wire: boolean;
  /** Why the wire is missing, in the Home's or the workspace's words — reading still works without it. */
  readonly wireNote?: string;
}

type Wire = Record<string, unknown>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const NO_STORE: Store = {
  getItem: () => null,
  setItem: () => {
    throw new Error("no storage");
  },
  removeItem: () => undefined,
};
/** The device's storage (kept) and the tab's (gone with the tab); a stand-in that keeps nothing where there is none. */
function deviceStore(): Store {
  try {
    return localStorage ?? NO_STORE;
  } catch {
    return NO_STORE;
  }
}
function tabStore(): Store {
  try {
    return sessionStorage ?? NO_STORE;
  } catch {
    return NO_STORE;
  }
}

/** The sign-in is kept across closing the browser (localStorage), for as long as the Home's token lasts — days, for
 *  this app — and dropped at its expiry (state's expiry watch) or on Sign out. A sign-in kept by an earlier version in
 *  this tab's sessionStorage is carried over once. */
export function loadSession(): ReaderSession | null {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept) return JSON.parse(kept) as ReaderSession;
    const older = sessionStorage.getItem(KEY);
    if (!older) return null;
    localStorage.setItem(KEY, older);
    sessionStorage.removeItem(KEY);
    return JSON.parse(older) as ReaderSession;
  } catch {
    return null;
  }
}
function save(s: ReaderSession | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    }
  } catch {
    /* storage blocked: the session lives for this page only */
  }
}

/** When this sign-in stops being accepted: the id_token's own `exp` (the Home's single sign-on lasts as long), in ms.
 *  Null for a sign-in without one (a dev reader). */
/** The email the Home shared with the reader at sign-in (the id_token's `email`), if it shared one. */
export function sessionEmail(s: ReaderSession): string | null {
  try {
    const part = s.token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === "string" && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export function sessionExpiresAt(s: ReaderSession): number | null {
  if (s.via === "dev-stub") return null;
  try {
    const part = s.token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function signOut(): void {
  save(null);
}

/** Another tab's `storage` event saying the kept sign-in was removed (a Home's /sso-logout, or Sign out there). */
export function isSessionCleared(
  e: Pick<StorageEvent, "key" | "newValue">
): boolean {
  return e.key === KEY && e.newValue === null;
}

/** After the person's own Sign out: this tab does not sign them back in by itself. The hint stays for a later visit. */
export function noSilentSignInThisTab(): void {
  markSilentTried(tabStore());
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
  opts: { then?: string; mode?: SignInMode } = {}
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
  const mode = opts.mode ?? { kind: "default" };
  const retemplate = (
    start: Awaited<ReturnType<ConnectClient["startEnrollment"]>>
  ) => ({ ...start, url: authorizeUrlFor(start.url, mode, opts.then) });
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
): Promise<{ idToken: string; askDelegation?: Wire; delegation?: Wire }> {
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
  };
  if (!r.id_token) throw new Error(r.error || "the Home returned no id_token");
  return {
    idToken: r.id_token,
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
  nonce: string,
  /** A silent attempt names who it asked for; the Home's answer is kept only if it is that person. */
  expectSub?: string
): Promise<ReaderSession> {
  const ex = await exchange(authOrigin, code, codeVerifier);
  const claims = (await c.verifyIdToken(
    authOrigin,
    ex.idToken,
    nonce
  )) as unknown as Record<string, unknown>;
  // Nobody chose an account on a silent attempt, so a different person coming back is not a sign-in anyone made
  // (the Home's session could have been put there by a link). It is dropped before anything is kept or handed on.
  if (
    expectSub &&
    (hintSubOf(claims) ?? "").toLowerCase() !== expectSub.toLowerCase()
  )
    throw new SilentSignInMismatch();
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
  // Whoever the Home signed in is the person to ask for next time.
  const hintSub = hintSubOf(claims);
  if (hintSub) writeHint(deviceStore(), { estate: estateId, sub: hintSub });
  return s;
}

/** A silent attempt came back as someone other than the person it asked for. */
export class SilentSignInMismatch extends Error {
  constructor() {
    super("the Home answered for a different person than the one asked for");
    this.name = "SilentSignInMismatch";
  }
}

/** How long a sign-in in the Home's window is waited for, all told. The SDK's popup gives up after 2 minutes (under the
 *  Home's opener policy it cannot see the window close); signing in by email — go to the inbox, find the code, type
 *  it — takes longer than that, and the code the Home then sends would reach no one. */
export const SIGN_IN_WAIT_MS = 15 * 60_000;

/** The Home's sign-in window, waited for as long as a person may take: past the SDK's 2-minute backstop it goes on
 *  listening on the relay for this sign-in's code ("Still waiting…"), until it comes, Cancel, or SIGN_IN_WAIT_MS. */
export async function signInPopup(
  c: ConnectClient,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal
): Promise<
  | {
      status: "success";
      authOrigin: string;
      code: string;
      codeVerifier: string;
      stash: { nonce: string };
    }
  | { status: "cancelled" | "blocked" | "error"; error?: string }
> {
  const start = await c.startEnrollment("");
  const opened = Date.now();
  const res = await openCentralAuthPopup(
    start.url,
    start.state,
    start.authOrigin,
    RELAY_CHANNEL,
    onProgress,
    signal,
    c.isAllowedIssuerOrigin
  );
  const ok = (code: string, iss?: string) => ({
    status: "success" as const,
    authOrigin:
      iss && c.isAllowedIssuerOrigin?.(iss)
        ? iss
        : ((res as { authOrigin?: string }).authOrigin ?? start.authOrigin),
    code,
    codeVerifier: start.codeVerifier,
    stash: { nonce: start.nonce },
  });
  if (res.status === "success") return ok(res.code, res.authOrigin);
  if (res.status !== "cancelled" || signal?.aborted) return res;
  onProgress?.(
    "Still waiting for your Home — finish signing in there. (Cancel if you closed it.)"
  );
  const late = await lateRelay(
    start.state,
    SIGN_IN_WAIT_MS - (Date.now() - opened),
    signal
  );
  return late ? ok(late.code, late.iss) : { status: "cancelled" };
}

/** A sign-in's code arriving late on the relay (the Home's window relays it on this origin): null on timeout or abort. */
function lateRelay(
  state: string,
  ms: number,
  signal?: AbortSignal
): Promise<{ code: string; iss?: string } | null> {
  if (typeof BroadcastChannel === "undefined" || ms <= 0)
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const relay = new BroadcastChannel(RELAY_CHANNEL);
    const done = (v: { code: string; iss?: string } | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      relay.close();
      resolve(v);
    };
    const onAbort = () => done(null);
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => done(null), ms);
    relay.onmessage = (e: MessageEvent) => {
      const m = e.data as {
        kind?: string;
        state?: string;
        code?: string;
        iss?: string;
      } | null;
      if (m?.kind === "ac-relay" && m.state === state && m.code)
        done({ code: m.code, ...(m.iss ? { iss: m.iss } : {}) });
    };
  });
}

/** Sign in with your own Home. Popup first; a full-page redirect when the popup is blocked, announced.
 *  `differentAccount` is the person saying "not the one you remember": the Home shows its account chooser, and the
 *  remembered person is forgotten here. */
export async function connectViaHome(
  estateId: EstateId,
  onProgress?: (msg: string) => void,
  opts: {
    then?: string;
    signal?: AbortSignal;
    differentAccount?: boolean;
  } = {}
): Promise<ReaderSession | null> {
  if (!HOME_SIGNIN_AVAILABLE)
    throw new Error(
      `Home sign-in is not registered yet (client "${CLIENT_ID}" needs a delegate — VITE_CONNECT_DELEGATE).`
    );
  if (opts.differentAccount) {
    clearHint(deviceStore());
    markSilentTried(tabStore());
  }
  const c = clientFor(estateId, {
    ...(opts.then ? { then: opts.then } : {}),
    mode: { kind: opts.differentAccount ? "choose" : "default" },
  });
  onProgress?.("Opening your Home…");
  const popup = await signInPopup(c, onProgress, opts.signal);
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

interface PendingSignIn {
  state: string;
  authOrigin: string;
  codeVerifier: string;
  nonce: string;
  estate: EstateId;
  /** A silent attempt, who it asked for, and the page it began on (the Home returns to "/"). */
  silent?: boolean;
  expectSub?: string;
  returnTo?: string;
}

function pendingSignIn(): PendingSignIn | null {
  try {
    const raw = tabStore().getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingSignIn) : null;
  } catch {
    return null;
  }
}

/** Complete a redirect return if this load is one; null on every ordinary load. A refusal from the Home (a silent
 *  attempt it could not grant) also ends here, as null: the reader stays signed out and says nothing. */
export async function completeRedirectIfReturning(): Promise<ReaderSession | null> {
  const back = homeReturnOf(location.search);
  if (back.kind === "none") return null;
  const stash = pendingSignIn();
  const clean = () =>
    history.replaceState(
      {},
      "",
      withoutHomeReturn(location.pathname, location.search, location.hash)
    );
  // An answer that is not for the sign-in in flight (another `state`, e.g. a crafted link) is tidied off the address
  // and otherwise ignored: it must not cancel that sign-in or touch the remembered person.
  if (!stash || stash.state !== back.state) {
    clean();
    return null;
  }
  tabStore().removeItem(PENDING_KEY);
  clean();
  if (back.kind === "error") {
    if (stash.silent) afterSilentRefusal(deviceStore(), back.error);
    return null;
  }
  try {
    return await finish(
      clientFor(stash.estate),
      stash.estate,
      stash.authOrigin,
      back.code,
      stash.codeVerifier,
      stash.nonce,
      stash.silent ? stash.expectSub : undefined
    );
  } catch (e) {
    if (e instanceof SilentSignInMismatch) return null;
    // A silent attempt that fails for any reason leaves the reader signed out, with nothing said.
    if (stash.silent) return null;
    throw e;
  }
}

/** Before the page starts: a silent attempt's answer arrives at "/", so the address is put back to where the person
 *  was (still carrying the answer) for the reader to open that place and `completeRedirectIfReturning` to finish. */
export function restoreSilentReturnAddress(): void {
  const back = homeReturnOf(location.search);
  if (back.kind === "none") return;
  const stash = pendingSignIn();
  if (!stash?.silent || stash.state !== back.state || !stash.returnTo) return;
  history.replaceState(
    {},
    "",
    restoredAddress(stash.returnTo, location.search)
  );
}

/** With nobody signed in and a remembered person: ask their Home for them once, with no screen, as a full-page
 *  visit that comes straight back. True when the page is leaving for the Home. At most once per tab, never on a load
 *  that is itself the Home's answer, never for a dev reader (it has no Home and leaves no hint). */
export async function silentSignInIfDue(): Promise<boolean> {
  const kept = loadSession();
  const expiry = kept ? sessionExpiresAt(kept) : null;
  const hint = readHint(deviceStore());
  const due = shouldTrySilent({
    search: location.search,
    signedIn: kept !== null && (expiry === null || expiry > Date.now()),
    hint,
    tried: silentTried(tabStore()),
    homeSignInAvailable: HOME_SIGNIN_AVAILABLE,
    online: typeof navigator === "undefined" || navigator.onLine !== false,
    framed: typeof window !== "undefined" && window.top !== window,
  });
  if (!due || !hint) return false;
  if (!estateById(hint.estate)) {
    clearHint(deviceStore());
    return false;
  }
  if (!markSilentTried(tabStore())) return false;
  const start = await connectViaRedirect(
    clientFor(hint.estate, {
      mode: { kind: "silent", loginHint: hint.sub },
    })
  );
  const pending: PendingSignIn = {
    ...start.stash,
    estate: hint.estate,
    silent: true,
    expectSub: hint.sub,
    returnTo: safeReturnTo(
      `${location.pathname}${location.search}${location.hash}`
    ),
  };
  tabStore().setItem(PENDING_KEY, JSON.stringify(pending));
  location.replace(start.url);
  return true;
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
    ...handed,
  };
  save(s);
  // A sample person has no session at the Home; the person remembered before them must not come back in their place.
  clearHint(deviceStore());
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
  clearHint(deviceStore());
  return s;
}

/** The Home's next step for a window that relayed its sign-in (`ac_then`): only a Contacts page on an allowed Home. */
export function relayThen(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.pathname === "/contacts" &&
      ALL_ESTATES.some((e) => isAllowedIssuer(e.id, u.origin))
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
