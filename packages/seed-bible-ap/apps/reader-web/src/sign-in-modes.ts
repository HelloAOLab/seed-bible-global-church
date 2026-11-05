// HOW THE READER ASKS THE HOME TO SIGN SOMEONE IN — the three ways, the remembered last person, and the rules for
// trying once without asking. Everything here is a plain function over its arguments (a URL, a query string, a
// storage), so the rules are tested as they are; `session.ts` supplies the browser.
//
//   default   no `prompt`: the Home shows what it sees fit; a returning person gets no consent screen.
//   choose    `prompt=select_account`: the Home's account chooser — only from "Use a different account".
//   silent    `prompt=none` + `login_hint`: no screen at all; the Home answers `?code` or `?error` at once.

import type { EstateId } from "../../../estate/faithnet";

export type SignInMode =
  | { readonly kind: "default" }
  | { readonly kind: "choose" }
  | { readonly kind: "silent"; readonly loginHint: string };

const ASK_AS_ME = "ask-as-me";

/** The Home's authorize URL for one way of signing in. Every one asks for the ask-as-me template. */
export function authorizeUrlFor(
  url: string,
  mode: SignInMode,
  then?: string
): string {
  const u = new URL(url);
  u.searchParams.set("delegation_template", ASK_AS_ME);
  u.searchParams.delete("prompt");
  u.searchParams.delete("login_hint");
  if (mode.kind === "choose") u.searchParams.set("prompt", "select_account");
  if (mode.kind === "silent") {
    u.searchParams.set("prompt", "none");
    u.searchParams.set("login_hint", mode.loginHint);
  }
  // One friend act the same Home window takes after signing in (the Home accepts only that).
  if (then) u.searchParams.set("then", then);
  return u.toString();
}

/** Who last signed in through a Home on this device: enough to ask that Home for the same person without a screen. */
export interface SignInHint {
  readonly estate: EstateId;
  readonly sub: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const HINT_KEY = "sbr.signin.hint";
export const SILENT_TRIED_KEY = "sbr.signin.silent-tried";

const CAIP10 = /^eip155:\d+:0x[0-9a-fA-F]{40}$/;

/** The id the Home knows the person by (CAIP-10), from a verified id_token's claims; null when it carries none. */
export function hintSubOf(claims: Record<string, unknown>): string | null {
  for (const k of ["sub", "canonical_agent_id"]) {
    const v = claims[k];
    if (typeof v === "string" && CAIP10.test(v)) return v;
  }
  return null;
}

export function readHint(store: Store): SignInHint | null {
  try {
    const raw = store.getItem(HINT_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<SignInHint> | null;
    return h && typeof h.estate === "string" && CAIP10.test(String(h.sub))
      ? { estate: h.estate, sub: String(h.sub) }
      : null;
  } catch {
    return null;
  }
}

export function writeHint(store: Store, hint: SignInHint): void {
  try {
    store.setItem(HINT_KEY, JSON.stringify(hint));
  } catch {
    /* storage blocked: the next visit asks who they are */
  }
}

export function clearHint(store: Store): void {
  try {
    store.removeItem(HINT_KEY);
  } catch {
    /* storage blocked: there was nothing kept */
  }
}

/** One silent attempt per tab: the mark is in the tab's own storage, so a refused attempt is not repeated on the
 *  next load and a redirect loop cannot start. */
export function silentTried(tab: Store): boolean {
  try {
    return tab.getItem(SILENT_TRIED_KEY) === "1";
  } catch {
    return true; // no way to remember the attempt, so none is made
  }
}

/** False when the mark could not be kept — the caller then makes no attempt. */
export function markSilentTried(tab: Store): boolean {
  try {
    tab.setItem(SILENT_TRIED_KEY, "1");
    return tab.getItem(SILENT_TRIED_KEY) === "1";
  } catch {
    return false;
  }
}

export type HomeReturn =
  | { readonly kind: "none" }
  | { readonly kind: "code"; readonly code: string; readonly state: string }
  | { readonly kind: "error"; readonly error: string; readonly state: string };

/** What this page load is, read from its query string: an ordinary load, or the Home handing back a code or a refusal. */
export function homeReturnOf(search: string): HomeReturn {
  const sp = new URLSearchParams(search);
  const state = sp.get("state");
  const code = sp.get("code");
  const error = sp.get("error");
  if (!state) return { kind: "none" };
  if (error) return { kind: "error", error, state };
  if (code) return { kind: "code", code, state };
  return { kind: "none" };
}

/** A load that carries any of the Home's return parameters — even a malformed one — is never the start of a silent
 *  attempt. */
export function isHomeReturn(search: string): boolean {
  const sp = new URLSearchParams(search);
  return sp.has("code") || sp.has("error") || sp.has("state");
}

export interface SilentInputs {
  readonly search: string;
  /** A sign-in kept on the device that is still good (a dev reader's always is). */
  readonly signedIn: boolean;
  readonly hint: SignInHint | null;
  readonly tried: boolean;
  readonly homeSignInAvailable: boolean;
  readonly online: boolean;
  /** The reader shown inside another page (an embed): a Home cannot be visited from there. */
  readonly framed: boolean;
}

/** Whether this page load should ask the Home, once and without a screen, for the person who signed in last. */
export function shouldTrySilent(i: SilentInputs): boolean {
  return (
    i.homeSignInAvailable &&
    i.online &&
    !i.framed &&
    !i.signedIn &&
    i.hint !== null &&
    !i.tried &&
    !isHomeReturn(i.search)
  );
}

/** After the Home refused a silent attempt. The Home answers `login_required` for every silent request it does not
 *  grant (nobody signed in there, a different person, an Allow it will not reuse: one answer, so a probe learns
 *  nothing), and only an ordinary sign-in changes that, so the hint is dropped; that sign-in writes it again. Any other
 *  refusal (`interaction_required`, a server error) leaves the hint for a later visit. Nothing is shown either way:
 *  the reader stays signed out, with its Sign in button, and this tab does not ask again. */
export function afterSilentRefusal(store: Store, error: string): void {
  if (error === "login_required") clearHint(store);
}

const RETURN_PARAMS = ["code", "state", "error", "error_description", "iss"];

/** The page's address without what the Home added to it. */
export function withoutHomeReturn(
  pathname: string,
  search: string,
  hash = ""
): string {
  const sp = new URLSearchParams(search);
  for (const k of RETURN_PARAMS) sp.delete(k);
  const q = sp.toString();
  return `${pathname}${q ? `?${q}` : ""}${hash}`;
}

/** Where a silent attempt started, as a path on this origin; "/" for anything else. */
export function safeReturnTo(raw: unknown): string {
  return typeof raw === "string" && /^\/(?![/\\])/.test(raw) ? raw : "/";
}

/** The Home returns to the registered address ("/"); a silent attempt began wherever the person was. This is that
 *  place again, still carrying the Home's answer for the sign-in to finish with. */
export function restoredAddress(returnTo: string, search: string): string {
  const back = new URL(safeReturnTo(returnTo), "https://reader.invalid");
  const sp = new URLSearchParams(search);
  for (const k of RETURN_PARAMS) {
    const v = sp.get(k);
    if (v !== null) back.searchParams.set(k, v);
  }
  return `${back.pathname}${back.search}${back.hash}`;
}
