// YOUR HOME PROFILE IN THE READER: read from your Home (name and photo, nothing else), and a change proposed to your
// Home — whose window saves it — then watched until the Home has it. A reader that has no read grant yet is told to
// sign in again. Mocked at the boundary only: reader-a2a's replies.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHomeProfile,
  fullName,
  WATCH_EVERY_MS,
  WATCH_MS,
} from "../../../apps/reader-web/src/state/social/homeProfile";

const PHOTO = "data:image/jpeg;base64,AAAA";

type Held = {
  firstName: string;
  lastName: string;
  about?: string;
  photo: string | null;
};
function home(initial: Held | "no_grant", opts: { blocked?: boolean } = {}) {
  let held = initial;
  const posted: unknown[] = [];
  const opened: string[] = [];
  /** What happened, in order — the window must open before the reader waits on the network. */
  const order: string[] = [];
  const win = {
    location: {
      set href(u: string) {
        opened.push(u);
      },
      get href() {
        return opened[opened.length - 1] ?? "";
      },
    },
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/home-profile/propose")) {
      order.push("propose");
      posted.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, token: "t".repeat(40) });
    }
    if (u.endsWith("/api/home-profile"))
      return held === "no_grant"
        ? Response.json({ ok: false, code: "no_grant" }, { status: 409 })
        : Response.json({ ok: true, about: "", ...held });
    throw new Error(`unexpected ${u}`);
  }) as typeof fetch;
  const hp = createHomeProfile({
    base: "https://reader-a2a.test",
    bearer: () => "id-token",
    homeOrigin: "https://home.test",
    fetchImpl,
    openWindow: () => {
      order.push("window");
      return opts.blocked ? null : win;
    },
  });
  return {
    hp,
    posted,
    opened,
    order,
    win,
    set: (v: typeof held) => (held = v),
  };
}

afterEach(() => vi.useRealTimers());

describe("your Home profile in the reader", () => {
  it("shows the Home's name and photo", async () => {
    const { hp } = home({
      firstName: "Ruth",
      lastName: "Miller",
      photo: PHOTO,
    });
    await hp.load();
    expect(hp.status.value).toBe("ok");
    expect(hp.value.value).toEqual({
      firstName: "Ruth",
      lastName: "Miller",
      about: "",
      photo: PHOTO,
    });
    expect(fullName(hp.value.value)).toBe("Ruth Miller");
  });

  it("without a read grant, says to sign in again", async () => {
    const { hp } = home("no_grant");
    await hp.load();
    expect(hp.status.value).toBe("no_grant");
  });

  it("a change is proposed to the Home, its window opened, and seen once the Home has saved it", async () => {
    vi.useFakeTimers();
    const { hp, posted, opened, set } = home({
      firstName: "Ruth",
      lastName: "",
      photo: null,
    });
    await hp.load();
    await hp.propose({ lastName: "Miller", photo: PHOTO });
    expect(posted).toEqual([{ lastName: "Miller", photo: PHOTO }]);
    expect(opened).toEqual([
      `https://home.test/profile-update?p=${"t".repeat(40)}&from=seed-reader`,
    ]);
    expect(hp.change.value).toEqual({ state: "waiting" });
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(hp.change.value).toEqual({ state: "waiting" }); // not saved at the Home yet
    set({
      firstName: "Ruth",
      lastName: "Miller",
      about: "A line",
      photo: PHOTO,
    }); // the person tapped Save there
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(hp.change.value).toEqual({ state: "saved" });
    expect(fullName(hp.value.value)).toBe("Ruth Miller");
  });

  it("a window closed without saving is said so, in time", async () => {
    vi.useFakeTimers();
    let now = 0;
    const { hp } = home({ firstName: "Ruth", lastName: "", photo: null });
    await hp.propose({ lastName: "Miller" });
    now = Date.now() + WATCH_MS + 1;
    vi.setSystemTime(now);
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(hp.change.value).toEqual({ state: "not-saved" });
  });
});

describe("when the browser blocks the Home's window", () => {
  it("says so, plainly, and proposes nothing that waits", async () => {
    const { hp } = home(
      { firstName: "Ruth", lastName: "", photo: null },
      { blocked: true }
    );
    const r = await hp.propose({ lastName: "Miller" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/blocked your Home's window/);
    expect(hp.change.value).toBeNull();
  });
});
