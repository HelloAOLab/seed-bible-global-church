// FRIENDS FROM THE READER: a friend link names who invited you (and nothing else); adding someone opens the Home's
// add-a-contact page for exactly that person (the signature is theirs to make there) and the reader watches until the
// friends view shows it — a request sent, or a friendship when you accepted theirs; "Not now" puts a request aside on
// this device and survives a reload; a watch that never lands gives up.
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import type { FriendsView } from "../../../apps/reader-web/src/backend/ReaderBackend";
import {
  WATCH_EVERY_MS,
  WATCH_MS,
  createFriendship,
  friendLink,
  parseFriendLink,
  standingOf,
} from "../../../apps/reader-web/src/state/social/friendship";

const RUTH = "0x" + "ab".repeat(20);
const EZRA = "0x" + "cd".repeat(20);
const view = (v: Partial<FriendsView>): FriendsView => ({
  friends: [],
  requests: [],
  requested: [],
  ...v,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

function setup(start: FriendsView) {
  let current = start;
  const opened: string[] = [];
  const stores = memoryStores();
  const f = createFriendship({
    prefs: stores.prefs,
    friendsView: () => current,
    refresh: async () => {},
    homeOrigin: "https://www.faithnet.me",
    openWindow: (u) => opened.push(u),
  });
  return { f, opened, stores, set: (v: FriendsView) => (current = v) };
}

describe("friend links", () => {
  it("round-trips who invited you, and ignores anything that is not a friend link", () => {
    const link = friendLink(
      "https://seed-reader.faithnet.io",
      RUTH.toUpperCase().replace("0X", "0x"),
      " Ruth B "
    );
    expect(link).toBe(
      `https://seed-reader.faithnet.io/friend/${RUTH}?name=Ruth%20B`
    );
    const u = new URL(link);
    expect(parseFriendLink(u.pathname, u.search)).toEqual({
      agent: RUTH,
      name: "Ruth B",
    });
    expect(parseFriendLink(`/friend/${RUTH}`, "")).toEqual({
      agent: RUTH,
      name: null,
    });
    expect(parseFriendLink("/friend/ruth.me", "")).toBeNull();
    expect(parseFriendLink("/read/BSB/JHN/3", "")).toBeNull();
  });
});

describe("adding a friend", () => {
  it("opens the Home for that person and reports the request once it lands", async () => {
    vi.useFakeTimers();
    const { f, opened, set } = setup(view({}));
    f.add("ruth.me");
    expect(opened).toEqual(["https://www.faithnet.me/contacts?add=ruth.me"]);
    expect(f.waiting.value?.was).toBe("none");
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.waiting.value?.was).toBe("none");
    set(
      view({
        requested: [{ agent: RUTH, name: "ruth.me", since: "2026-10-23" }],
      })
    );
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.waiting.value).toMatchObject({ was: "you-asked", landed: true });
  });

  it("asking someone already asked is not reported as done", async () => {
    vi.useFakeTimers();
    const ruth = { agent: RUTH, name: "ruth.me", since: "2026-10-22" };
    const { f } = setup(view({ requested: [ruth] }));
    f.add("ruth");
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS * 3);
    expect(f.waiting.value).toMatchObject({ was: "you-asked", landed: false });
  });

  it("recognises the one just added however they were typed", async () => {
    vi.useFakeTimers();
    const sr = { agent: EZRA, name: "seedreader.me", since: "2026-10-22" };
    const { f, set } = setup(view({ requested: [sr] }));
    f.add("ruth");
    set(
      view({
        requested: [sr, { agent: RUTH, name: "ruth.me", since: "2026-10-23" }],
      })
    );
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.waiting.value).toMatchObject({
      label: "ruth.me",
      was: "you-asked",
    });
  });

  it("accepting a request ends with the two of you friends", async () => {
    vi.useFakeTimers();
    const asked = { agent: EZRA, name: "ezra.me", since: "2026-10-23" };
    const { f, set } = setup(view({ requests: [asked] }));
    expect(standingOf(view({ requests: [asked] }), "ezra.me")).toBe(
      "asked-you"
    );
    f.add(EZRA, "ezra.me");
    set(view({ friends: [asked] }));
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.waiting.value).toMatchObject({
      label: "ezra.me",
      was: "friend",
      landed: true,
    });
  });

  it("stops watching when nothing lands", async () => {
    vi.useFakeTimers();
    const { f } = setup(view({}));
    f.add("nobody.me");
    await vi.advanceTimersByTimeAsync(WATCH_MS + 2 * WATCH_EVERY_MS);
    expect(f.waiting.value).toBeNull();
  });
});

describe("removing a friend, or taking back a request", () => {
  it("opens the Home to remove exactly that person and reports it once they are gone", async () => {
    vi.useFakeTimers();
    const ruth = { agent: RUTH, name: "ruth.me", since: "2026-10-22" };
    const { f, opened, set } = setup(view({ friends: [ruth] }));
    f.remove(RUTH, "ruth.me");
    expect(opened).toEqual([`https://www.faithnet.me/contacts?remove=${RUTH}`]);
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.removing.value).toMatchObject({ label: "ruth.me", done: false });
    set(view({}));
    await vi.advanceTimersByTimeAsync(WATCH_EVERY_MS);
    expect(f.removing.value).toMatchObject({ done: true });
  });

  it("gives up when they never go", async () => {
    vi.useFakeTimers();
    const ezra = { agent: EZRA, name: null, since: "2026-10-22" };
    const { f } = setup(view({ requested: [ezra] }));
    f.remove(EZRA);
    await vi.advanceTimersByTimeAsync(WATCH_MS + 2 * WATCH_EVERY_MS);
    expect(f.removing.value).toBeNull();
  });
});

describe("Not now", () => {
  it("puts a request aside on this device, and it stays aside after a reload", async () => {
    const asked = { agent: EZRA, name: "ezra.me", since: "2026-10-23" };
    const { f, stores } = setup(view({ requests: [asked] }));
    await tick();
    expect(f.requests.value.map((r) => r.agent)).toEqual([EZRA]);
    await f.putAside(EZRA.toUpperCase().replace("0X", "0x"));
    expect(f.requests.value).toEqual([]);
    const again = createFriendship({
      prefs: stores.prefs,
      friendsView: () => view({ requests: [asked] }),
      refresh: async () => {},
      homeOrigin: "https://www.faithnet.me",
      openWindow: () => {},
    });
    await tick();
    expect(again.requests.value).toEqual([]);
  });
});
