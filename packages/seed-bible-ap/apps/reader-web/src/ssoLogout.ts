// A HOME'S SIGN-OUT PASSES THROUGH HERE: it sends the browser, top level, to `/sso-logout?return=<its /logout>`. main.tsx
// runs this instead of booting, so no session is restored and the router never sees the path. It is a page-side route
// and not the Worker's because the service worker answers navigations with the app shell (sw.ts): this works whether
// or not it is in control. The session is kept in localStorage, so removing it reaches every tab: a tab already open
// hears the `storage` event (state/index.ts); one opened later finds nothing to restore.
import { ALL_ESTATES } from "../../../estate/faithnet";
import { indexedDbStores, type KeyValueStore } from "./backend/offline/db";
import { signOut } from "./session";
import { forgetPerson } from "./state/records/deviceOwner";

export const SSO_LOGOUT_PATH = "/sso-logout";

/** How long the device's copies may hold up the way back: a stuck IndexedDB must not strand the person here. */
export const FORGET_WAIT_MS = 1500;

/** Back to a Home's /logout and nowhere else (any other place would be an open redirect); otherwise this site's "/". */
export function ssoLogoutReturn(raw: string | null): string {
  try {
    const u = new URL(raw ?? "");
    if (
      u.pathname === "/logout" &&
      ALL_ESTATES.some((e) => e.home === u.origin)
    )
      return u.toString();
  } catch {
    /* no return, or a malformed one */
  }
  return "/";
}

/** Sign this app out, as Sign out does (the session, then the person's copies on this device), and go back. */
export async function ssoLogout(
  search: string,
  go: (url: string) => void = (url) => location.replace(url),
  prefs: () => KeyValueStore<unknown> = () => indexedDbStores().prefs
): Promise<void> {
  signOut();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.resolve()
      .then(() => forgetPerson(prefs()))
      .catch(() => undefined),
    new Promise((resolve) => (timer = setTimeout(resolve, FORGET_WAIT_MS))),
  ]);
  clearTimeout(timer);
  go(ssoLogoutReturn(new URLSearchParams(search).get("return")));
}
