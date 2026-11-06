// A HOME'S SIGN-OUT (`/sso-logout?return=<its /logout>`): this app's session goes, here and in the tabs already open,
// the person's copies on the device go as Sign out's do, and the way back goes only to the Home's /logout.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  FORGET_WAIT_MS,
  ssoLogout,
  ssoLogoutReturn,
} from "../../../apps/reader-web/src/ssoLogout";
import { createTestReaderState } from "../../helpers/createTestReaderState";

const KEPT = JSON.stringify({ token: "t", estate: "faithnet", sub: "0xa" });
const BACK = "https://www.faithnet.me/logout?return=https%3A%2F%2Fapp.test%2F";
const searchFor = (ret: string) => `?return=${encodeURIComponent(ret)}`;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  history.replaceState(null, "", "/");
});

describe("where a Home's sign-out goes back to", () => {
  it("the Home's /logout, with what it carries", () => {
    expect(ssoLogoutReturn(BACK)).toBe(BACK);
  });

  it.each([
    ["a look-alike host", "https://www.faithnet.me.evil.test/logout"],
    ["a credentials trick", "https://www.faithnet.me@evil.test/logout"],
    ["another site", "https://evil.test/logout"],
    ["the Home's other paths", "https://www.faithnet.me/account"],
    ["a longer path", "https://www.faithnet.me/logout/more"],
    ["plain http", "http://www.faithnet.me/logout"],
    ["another port", "https://www.faithnet.me:8443/logout"],
    ["another Home subdomain", "https://evil.faithnet.me/logout"],
    ["script", "javascript:alert(1)//www.faithnet.me/logout"],
    ["protocol-relative", "//evil.test/logout"],
    ["a relative path", "/logout"],
    ["not a URL", "not a url"],
    ["empty", ""],
    ["none", null],
  ])("%s stays on this site", (_what, raw) => {
    expect(ssoLogoutReturn(raw)).toBe("/");
  });
});

describe("the sign-out", () => {
  it("clears the session and the person's copies, keeps the device's own, and goes back", async () => {
    localStorage.setItem("sbr.session", KEPT);
    sessionStorage.setItem("sbr.session", KEPT);
    const { prefs } = memoryStores();
    await prefs.set("device:person", "0xa");
    await prefs.set("friends", { friends: [] });
    await prefs.set("sbr.settings", { theme: "dark" });
    const go = vi.fn();
    await ssoLogout(searchFor(BACK), go, () => prefs);
    expect(localStorage.getItem("sbr.session")).toBeNull();
    expect(sessionStorage.getItem("sbr.session")).toBeNull();
    expect(await prefs.keys()).toEqual(["sbr.settings"]);
    expect(go).toHaveBeenCalledExactlyOnceWith(BACK);
  });

  it("works for someone not signed in, and a bad return goes home", async () => {
    const go = vi.fn();
    await ssoLogout(
      searchFor("https://www.faithnet.me.evil.test/logout"),
      go,
      () => memoryStores().prefs
    );
    expect(go).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("a stuck or broken device store never strands the person", async () => {
    vi.useFakeTimers();
    localStorage.setItem("sbr.session", KEPT);
    const go = vi.fn();
    const stuck = memoryStores().prefs;
    stuck.keys = () => new Promise(() => undefined);
    const pending = ssoLogout(searchFor(BACK), go, () => stuck);
    expect(localStorage.getItem("sbr.session")).toBeNull();
    await vi.advanceTimersByTimeAsync(FORGET_WAIT_MS);
    await pending;
    expect(go).toHaveBeenCalledExactlyOnceWith(BACK);
    vi.useRealTimers();

    const broken = vi.fn();
    await ssoLogout(searchFor(BACK), broken, () => {
      throw new Error("no IndexedDB");
    });
    expect(broken).toHaveBeenCalledExactlyOnceWith(BACK);
  });
});

describe("a tab already open", () => {
  const removed = (key: string | null, newValue: string | null = null) =>
    new StorageEvent("storage", { key, newValue });

  it("is signed out when another tab removes the session, and only then", async () => {
    const { state } = await createTestReaderState();
    const stop = await state.start();
    window.dispatchEvent(removed("sbr.settings"));
    window.dispatchEvent(removed("sbr.session", KEPT));
    expect(state.session.value).not.toBeNull();
    window.dispatchEvent(removed("sbr.session"));
    expect(state.session.value).toBeNull();
    stop();
  });
});
