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
