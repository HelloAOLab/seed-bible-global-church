// INVITING BY EMAIL FROM THE READER: an `/invite/<token>` link is recognised (and nothing else is); sending asks the
// Home with the reader's own sign-in and the list of what was sent follows; a failed send says why and leaves the
// list alone; cancel takes it off at once; signed out, nothing is asked; the find-me-by-email switch goes back when
// the Home refuses it. The Home is the boundary, faked at fetch.
import { describe, expect, it } from "vitest";
import {
  createInvites,
  isEmail,
  parseInviteLink,
} from "../../../apps/reader-web/src/state/social/invites";

const HOME = "https://reader-a2a.test";
const TOKEN = "a".repeat(40);

function fakeHome(opts: { failSend?: string; refuseFindable?: boolean } = {}) {
  const sent: Array<{
    token: string;
    email: string;
    createdAt: number;
    expiresAt: number;
  }> = [];
  let findable = true;
  const calls: Array<{ path: string; auth: string | null; body: unknown }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const auth = new Headers(init?.headers).get("authorization");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path: u.pathname + u.search, auth, body });
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status });
    if (u.pathname === "/api/findable") {
      if (init?.method === "POST") {
        if (opts.refuseFindable) return json({ error: "no" }, 500);
        findable = body.email;
      }
      return json({ ok: true, email: findable });
    }
    if (u.pathname === "/api/friends/invites/lookup")
      return u.searchParams.get("token") === TOKEN
        ? json({
            ok: true,
            from: "0xRUTH",
            fromName: "Ruth",
            note: "Read with me",
            accepted: false,
          })
        : json({ error: "this invitation has expired or was cancelled" }, 404);
    if (init?.method !== "POST") return json({ ok: true, sent });
    if (body.cancel) {
      sent.splice(
        sent.findIndex((s) => s.token === body.token),
        1
      );
      return json({ ok: true });
    }
    if (body.claim) return json({ ok: true, claimed: body.token === TOKEN });
    if (opts.failSend) return json({ error: opts.failSend }, 502);
    const again = sent.find((s) => s.email === body.email.toLowerCase());
    if (again) return json({ ok: true, token: again.token, again: true });
    const token = String(sent.length).padStart(40, "0");
    sent.push({
      token,
      email: body.email.toLowerCase(),
      createdAt: 1,
      expiresAt: 2,
    });
    return json({ ok: true, token });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("invitation links", () => {
  it("knows an invitation link from any other path, and an email from a name", () => {
    expect(parseInviteLink(`/invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteLink(`/invite/${TOKEN}/`)).toBe(TOKEN);
    expect(parseInviteLink("/invite/not-a-token")).toBeNull();
    expect(parseInviteLink(`/friend/${TOKEN}`)).toBeNull();
    expect(isEmail(" boaz@example.org ")).toBe(true);
    expect(isEmail("ruth.me")).toBe(false);
  });
});

describe("createInvites", () => {
  it("sends with the reader's sign-in, lists what was sent, and the same address again is the same invitation", async () => {
    const home = fakeHome();
    const inv = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: home.fetchImpl,
    });
    expect(await inv.send("Boaz@Example.org", "Ruth")).toEqual({ ok: true });
    expect(inv.sent.value.map((s) => s.email)).toEqual(["boaz@example.org"]);
    expect(await inv.send("boaz@example.org")).toEqual({
      ok: true,
      again: true,
    });
    expect(inv.sent.value).toHaveLength(1);
    expect(home.calls.every((c) => c.auth === "Bearer id-token")).toBe(true);
    expect(home.calls[0]!.body).toMatchObject({
      email: "Boaz@Example.org",
      fromName: "Ruth",
    });
  });

  it("sending opens the Home's window on the tap, then points it at signing the sender's half for that invitation", async () => {
    const home = fakeHome();
    const order: string[] = [];
    const win = {
      location: { href: "" },
      closed: false,
      close() {
        this.closed = true;
      },
    };
    const fetchImpl = (async (...a: Parameters<typeof fetch>) => {
      order.push("network");
      return home.fetchImpl(...a);
    }) as typeof fetch;
    const inv = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl,
      homeOrigin: "https://home.test",
      openWindow: (u) => {
        order.push(`window ${u}`);
        return win;
      },
    });
    expect(await inv.send("boaz@example.org", "Ruth")).toEqual({
      ok: true,
      window: "opened",
    });
    expect(order[0]).toBe("window about:blank");
    expect(win.location.href).toBe(
      `https://home.test/friend-invitation?t=${"0".repeat(40)}&from=seed-reader`
    );
  });

  it("a blocked window is said; a refused send closes the window it opened", async () => {
    const blocked = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome().fetchImpl,
      homeOrigin: "https://home.test",
      openWindow: () => null,
    });
    expect(await blocked.send("boaz@example.org")).toEqual({
      ok: true,
      window: "blocked",
    });
    const win = {
      location: { href: "" },
      closed: false,
      close() {
        this.closed = true;
      },
    };
    const refused = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome({ failSend: "rail down" }).fetchImpl,
      homeOrigin: "https://home.test",
      openWindow: () => win,
    });
    expect((await refused.send("boaz@example.org")).ok).toBe(false);
    expect(win.closed).toBe(true);
  });

  it("a send the Home refuses says why and adds nothing", async () => {
    const inv = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome({
        failSend: "could not send the invitation: rail down",
      }).fetchImpl,
    });
    expect(await inv.send("boaz@example.org")).toEqual({
      ok: false,
      error: "could not send the invitation: rail down",
    });
    expect(inv.sent.value).toEqual([]);
  });

  it("cancel takes the invitation off the list", async () => {
    const inv = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome().fetchImpl,
    });
    await inv.send("boaz@example.org");
    expect(await inv.cancel(inv.sent.value[0]!.token)).toBe(true);
    expect(inv.sent.value).toEqual([]);
  });

  it("signed out, the list is empty and the Home is not asked", async () => {
    const home = fakeHome();
    const inv = createInvites({
      base: HOME,
      bearer: () => null,
      fetchImpl: home.fetchImpl,
    });
    await inv.refresh();
    await inv.loadFindable();
    expect(inv.sent.value).toEqual([]);
    expect(inv.findable.value).toBeNull();
    expect(home.calls).toEqual([]);
  });

  it("an opened invitation names who sent it; a dead one says why; taking it reports back", async () => {
    const inv = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome().fetchImpl,
    });
    expect(await inv.lookup(TOKEN)).toMatchObject({
      from: "0xRUTH",
      fromName: "Ruth",
      note: "Read with me",
    });
    expect(await inv.lookup("b".repeat(40))).toEqual({
      error: "this invitation has expired or was cancelled",
    });
    expect(await inv.claim(TOKEN)).toBe(true);
  });

  it("the find-me-by-email switch follows the Home, and goes back when the Home refuses", async () => {
    const ok = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome().fetchImpl,
    });
    await ok.loadFindable();
    expect(ok.findable.value).toBe(true);
    await ok.setFindable(false);
    expect(ok.findable.value).toBe(false);

    const refused = createInvites({
      base: HOME,
      bearer: () => "id-token",
      fetchImpl: fakeHome({ refuseFindable: true }).fetchImpl,
    });
    await refused.loadFindable();
    await refused.setFindable(false);
    expect(refused.findable.value).toBe(true);
  });
});

// AN ACCEPTED INVITATION IS CLEARED ONCE IT HAS DONE ITS WORK (2026-10-26: a friend removed reappeared under "Joined from
// your invitation" with Finish adding): clearing a person's accepted invitations takes them off the sent list at the
// Home, and leaves the others alone.
describe("clearing a person's accepted invitations", () => {
  it("takes only theirs off the list", async () => {
    const { fetchImpl, calls } = fakeHome();
    const invites = createInvites({
      base: HOME,
      bearer: () => "tok",
      fetchImpl,
    });
    invites.sent.value = [
      {
        token: "t1".padEnd(40, "0"),
        email: "ruth@example.org",
        createdAt: 1,
        expiresAt: 2,
        acceptedBy: "0xRUTH",
      },
      {
        token: "t2".padEnd(40, "0"),
        email: "boaz@example.org",
        createdAt: 1,
        expiresAt: 2,
        acceptedBy: "0xBOAZ",
      },
      {
        token: "t3".padEnd(40, "0"),
        email: "naomi@example.org",
        createdAt: 1,
        expiresAt: 2,
      },
    ];
    await invites.clearAccepted("0xruth");
    const cancels = calls.filter(
      (c) => (c.body as { cancel?: boolean } | null)?.cancel
    );
    expect(cancels.map((c) => (c.body as { token: string }).token)).toEqual([
      "t1".padEnd(40, "0"),
    ]);
  });
});
