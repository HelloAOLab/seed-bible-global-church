// CONNECT — Home sign-in for readers, on `@agenticprimitives/connect-client`, the same client every app on the
// rail uses (pattern: verifiable-content-demo `apps/demo-bible-web/src/session.ts`, cut to hello-world size).
//
// THE KEYS LIVE ONCE, AT THE HOME. This page holds no key, mints no identity, and keeps the id_token in
// sessionStorage only. Three ways in, all the Home's:
//   VIA HOME        FedCM when a Home session exists, else the popup PKCE ceremony, else a full-page redirect.
//   QUICK CONNECT   one of the Home's sample people (the seed demo reader, once the Home lists them).
//   DEV READER      local dev only — the seed reader as a `dev:<handle>` token reader-a2a accepts with
//                   DEV_STUB_SESSIONS=1. Labelled as such everywhere it appears.

import {
  connectAsQuickConnect,
  connectViaFedcm,
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

const KEY = "sbr.session";
const PENDING_KEY = "sbr.connect.pending";

export interface ReaderSession {
  readonly token: string;
  readonly estate: EstateId;
  readonly name: string;
  readonly sub: string;
  readonly via: "home" | "quick-connect" | "dev-stub";
}

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

function clientFor(estateId: EstateId): ConnectClient {
  const est = estateById(estateId);
  if (!est) throw new Error("unknown estate");
  return createConnectClient({
    clientId: CLIENT_ID,
    delegate: CONNECT_DELEGATE as `0x${string}`,
    redirectUri: () => `${location.origin}/`,
    scope: "openid agent profile",
    resolveAuthOrigin: () => est.home,
    isAllowedIssuerOrigin: (origin) => isAllowedIssuer(estateId, origin),
  });
}

async function finish(
  c: ConnectClient,
  estateId: EstateId,
  authOrigin: string,
  idToken: string,
  nonce: string,
  via: ReaderSession["via"]
): Promise<ReaderSession> {
  const claims = (await c.verifyIdToken(
    authOrigin,
    idToken,
    nonce
  )) as unknown as Record<string, unknown>;
  const s: ReaderSession = {
    token: idToken,
    estate: estateId,
    name: String(claims["name"] ?? claims["agent_name"] ?? ""),
    sub: String(claims["canonical_agent_id"] ?? claims["sub"] ?? ""),
    via,
  };
  save(s);
  return s;
}

function within(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timed out")), ms)
  );
}

/** FedCM when this browser already has a Home session, then the Home popup, then a full-page redirect. */
export async function connectViaHome(
  estateId: EstateId,
  onProgress?: (msg: string) => void
): Promise<ReaderSession | null> {
  if (!HOME_SIGNIN_AVAILABLE)
    throw new Error(
      `Home sign-in is not registered yet (client "${CLIENT_ID}" needs a delegate — VITE_CONNECT_DELEGATE).`
    );
  const est = estateById(estateId);
  if (!est) throw new Error("unknown estate");
  const c = clientFor(estateId);
  try {
    onProgress?.("Checking for a Home session…");
    const fedcm = await Promise.race([
      connectViaFedcm(est.home, CLIENT_ID, onProgress),
      within(12000),
    ]);
    return await finish(
      c,
      estateId,
      fedcm.authOrigin,
      fedcm.idToken,
      "",
      "home"
    );
  } catch {
    /* no Home session, or this member has to sign in the popup */
  }
  onProgress?.("Opening your Home…");
  const popup = await connectViaPopup(c, undefined, RELAY_CHANNEL, onProgress);
  if (popup.status === "success") {
    onProgress?.("Signing you in…");
    const { idToken } = await c.exchangeCode(
      popup.authOrigin,
      popup.code,
      popup.codeVerifier
    );
    if (!idToken) throw new Error("the Home returned no id_token");
    return await finish(
      c,
      estateId,
      popup.authOrigin,
      idToken,
      popup.stash.nonce,
      "home"
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
  const c = clientFor(stash.estate);
  const { idToken } = await c.exchangeCode(
    stash.authOrigin,
    code,
    stash.codeVerifier
  );
  if (!idToken) throw new Error("the Home returned no id_token");
  return finish(
    c,
    stash.estate,
    stash.authOrigin,
    idToken,
    stash.nonce,
    "home"
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

/** Sign in as one of them — a real token from the real issuer, verified the same way as anyone's. */
export async function connectAsSamplePerson(
  estateId: EstateId,
  handle: string
): Promise<ReaderSession> {
  const est = estateById(estateId);
  if (!est) throw new Error("unknown estate");
  const q = await connectAsQuickConnect(
    { homeOrigin: est.home, clientId: CLIENT_ID },
    handle
  );
  const s: ReaderSession = {
    token: q.idToken,
    estate: estateId,
    name: q.agentName ?? handle,
    sub: q.sub,
    via: "quick-connect",
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
  };
  save(s);
  return s;
}
