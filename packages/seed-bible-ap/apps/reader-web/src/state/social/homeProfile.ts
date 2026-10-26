// YOUR HOME PROFILE, IN THE READER — the name and photo your Home holds for you (its vault profile), read through
// reader-a2a under the reader's read grant, and shown as yours everywhere in the reader. Changing them here does not
// write anything from the reader (an app may not write your Home's records): the change is proposed to your Home,
// whose own small window shows it and saves it on your "Save"; the reader watches until it reads the change back.
import { signal } from "@preact/signals";

export interface HomeProfile {
  firstName: string;
  lastName: string;
  /** A line about them, in their words. */
  about: string;
  photo: string | null;
}

export type HomeProfileChange = Partial<
  Pick<HomeProfile, "firstName" | "lastName" | "about">
> & {
  photo?: string | null;
};

/** How long a change is watched for after the Home's window opens, and how often it looks. */
export const WATCH_MS = 3 * 60_000;
export const WATCH_EVERY_MS = 3_000;

export const fullName = (
  p: Pick<HomeProfile, "firstName" | "lastName"> | null | undefined
) =>
  [p?.firstName, p?.lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");

/** Whether what the Home holds now has the change in it. */
export function landed(
  p: HomeProfile | null,
  change: HomeProfileChange
): boolean {
  if (!p) return false;
  if (change.firstName !== undefined && p.firstName !== change.firstName.trim())
    return false;
  if (change.lastName !== undefined && p.lastName !== change.lastName.trim())
    return false;
  if (change.about !== undefined && p.about !== change.about.trim())
    return false;
  if (change.photo !== undefined && p.photo !== change.photo) return false;
  return true;
}

const openBlank = (url: string) =>
  window.open(url, "_blank", "popup,width=520,height=640");

export function createHomeProfile(deps: {
  base: string;
  bearer: () => string | null;
  homeOrigin: string;
  fetchImpl?: typeof fetch;
  /** Opens the Home's window (blank at first) and returns it; null when the browser blocked it. */
  openWindow?: (
    url: string
  ) => { location: { href: string }; close: () => void } | null;
  now?: () => number;
}) {
  const f = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const value = signal<HomeProfile | null>(null);
  /** idle (signed out) · loading · ok · no_grant (sign in again to let the reader read it) · error */
  const status = signal<"idle" | "loading" | "ok" | "no_grant" | "error">(
    "idle"
  );
  /** A change sent to the Home's window: waiting for the person's Save there, saved, or not seen in time. */
  const change = signal<{
    state: "waiting" | "saved" | "not-saved";
    error?: string;
  } | null>(null);
  let watch: ReturnType<typeof setInterval> | undefined;

  async function load(): Promise<HomeProfile | null> {
    const token = deps.bearer();
    if (!token) {
      value.value = null;
      status.value = "idle";
      return null;
    }
    if (!value.value) status.value = "loading";
    const res = await f(`${deps.base}/api/home-profile`, {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as
      | (HomeProfile & { ok?: boolean; code?: string })
      | null;
    if (!res?.ok || !out?.ok) {
      status.value = out?.code === "no_grant" ? "no_grant" : "error";
      return value.value;
    }
    value.value = {
      firstName: out.firstName ?? "",
      lastName: out.lastName ?? "",
      about: out.about ?? "",
      photo: out.photo ?? null,
    };
    status.value = "ok";
    return value.value;
  }

  /** Propose a change; the Home's window opens to save it; resolves once sent (the watch runs on). Call it straight
   *  from the person's tap: the window is opened at once — a browser lets a page open one only from a tap, not after
   *  waiting on the network — and is sent to the change when the Home has it. */
  async function propose(
    next: HomeProfileChange
  ): Promise<{ ok: boolean; error?: string }> {
    const token = deps.bearer();
    if (!token) return { ok: false, error: "sign in first" };
    const win = (deps.openWindow ?? openBlank)("about:blank");
    const res = await f(`${deps.base}/api/home-profile/propose`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(next),
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as {
      ok?: boolean;
      token?: string;
      error?: string;
    } | null;
    if (!res?.ok || !out?.token) {
      win?.close();
      return {
        ok: false,
        error: out?.error ?? "your Home could not be reached",
      };
    }
    if (!win)
      return {
        ok: false,
        error:
          "Your browser blocked your Home's window. Allow pop-ups for this site, then Save again.",
      };
    win.location.href = `${deps.homeOrigin}/profile-update?p=${encodeURIComponent(out.token)}&from=seed-reader`;
    change.value = { state: "waiting" };
    clearInterval(watch);
    const start = (deps.now ?? Date.now)();
    watch = setInterval(() => {
      void load().then((p) => {
        if (landed(p, next)) {
          change.value = { state: "saved" };
          clearInterval(watch);
        } else if ((deps.now ?? Date.now)() - start > WATCH_MS) {
          change.value = { state: "not-saved" };
          clearInterval(watch);
        }
      });
    }, WATCH_EVERY_MS);
    return { ok: true };
  }

  return {
    value,
    status,
    change,
    load,
    propose,
    clearChange: () => {
      clearInterval(watch);
      change.value = null;
    },
  };
}

export type HomeProfileState = ReturnType<typeof createHomeProfile>;
