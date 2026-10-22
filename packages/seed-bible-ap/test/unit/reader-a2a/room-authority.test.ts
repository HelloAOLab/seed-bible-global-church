// WHO MAY DO WHAT IN A ROOM (test-plan A3.2): a stranger gets 404 at every door; a join token admits one device
// once and dies at five minutes; navigation and decoration are the leader's (or a role the host gave); roles are
// the host's; a device's presence is rate-limited, the stale frames dropped. The Agents SDK is faked
// (test/helpers/fakeAgentsSdk.ts); the room's own code runs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("agents", () => import("../../helpers/fakeAgentsSdk"));

import { ReadingSession } from "../../../apps/reader-a2a/src/rooms/ReadingSession";
import { speakingAs, type FakeConnection } from "../../helpers/fakeAgentsSdk";

const MARKER = "internal-marker";
const HOST = { agent: "0x" + "aa".repeat(20), name: "Ruth" };
const PASSAGE = { translationId: "BSB", bookId: "JHN", chapterNumber: 3 };
const CODE = "ABCD";
const ORIGIN = "https://seed-bible-a2a.test/agents/reading-session/s1";

interface Conn {
  agent: string;
  name: string;
}

async function room() {
  const r = new ReadingSession({} as never, { A2A_INTERNAL_MARKER: MARKER });
  await r.onStart();
  const internal = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) =>
    r.onRequest(
      new Request(`${ORIGIN}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "x-ap-internal": MARKER,
          "content-type": "application/json",
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  const create = async () => {
    const res = await internal("/create", {
      id: "s1",
      host: HOST,
      passage: PASSAGE,
      code: CODE,
    });
    expect(res.status).toBe(200);
  };
  const invite = async (b: Record<string, unknown>) =>
    (await (await internal("/invite", b)).json()) as {
      ok: boolean;
      token?: string;
      role?: string;
      agent?: string;
      error?: string;
    };
  let n = 0;
  /** A device presenting `token` on the socket: the protocol gate, then onConnect. */
  const connect = async (token: string) => {
    const c = (
      r as unknown as { addConnection<S>(id: string): FakeConnection<S> }
    ).addConnection<Conn>(`c${++n}`);
    const ctx = {
      request: new Request(`${ORIGIN}?token=${encodeURIComponent(token)}`),
    };
    const ok = r.shouldSendProtocolMessages(c as never, ctx);
    if (ok) await r.onConnect(c as never, ctx);
    return c;
  };
  const as = <T>(c: FakeConnection<Conn>, fn: () => T) =>
    speakingAs(r, c as FakeConnection, fn);
  return { r, internal, create, invite, connect, as };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("room authority", () => {
  it("a stranger gets 404: no internal marker, no session yet, no code, a wrong code", async () => {
    const { r, internal, create, invite } = await room();
    const outside = await r.onRequest(new Request(`${ORIGIN}/snapshot`));
    expect(outside.status).toBe(404);
    expect(
      await invite({ agent: "0x" + "bb".repeat(20), name: "Bob", code: CODE })
    ).toMatchObject({ ok: false, error: "no such session" });
    await create();
    expect(
      await invite({ agent: "0x" + "bb".repeat(20), name: "Bob" })
    ).toMatchObject({ ok: false, error: "no standing in this session" });
    expect(
      await invite({
        agent: "0x" + "bb".repeat(20),
        name: "Bob",
        code: "WRONG",
      })
    ).toMatchObject({ ok: false, error: "no standing in this session" });
    expect(
      (
        await internal("/invite", {
          agent: "0x" + "bb".repeat(20),
          name: "Bob",
          code: "WRONG",
        })
      ).status
    ).toBe(404);
    // A device with no token, or a made-up one, is closed at the protocol gate.
    const c = (
      r as unknown as { addConnection<S>(id: string): FakeConnection<S> }
    ).addConnection<Conn>("x");
    expect(
      r.shouldSendProtocolMessages(c as never, {
        request: new Request(`${ORIGIN}?token=nope`),
      })
    ).toBe(false);
    expect(c.closed).toEqual({ code: 4404, reason: "no standing" });
    expect(r.state.participants).toEqual([]);
  });

  it("a join token admits one device once", async () => {
    const { r, create, invite, connect } = await room();
    await create();
    const inv = await invite({
      agent: "0x" + "bb".repeat(20),
      name: "Bob",
      code: CODE,
    });
    expect(inv).toMatchObject({ ok: true, role: "reader" });
    const first = await connect(inv.token!);
    expect(first.closed).toBeNull();
    expect(first.state).toEqual({ agent: "0x" + "bb".repeat(20), name: "Bob" });
    expect(
      r.state.participants.map((p) => [p.agent, p.role, p.connections])
    ).toEqual([["0x" + "bb".repeat(20), "reader", 1]]);
    const second = await connect(inv.token!);
    expect(second.closed).toEqual({ code: 4404, reason: "no standing" });
    expect(second.state).toBeUndefined();
    expect(r.state.participants[0]!.connections).toBe(1);
  });

  it("a join token expires at five minutes", async () => {
    const { create, invite, connect } = await room();
    await create();
    const inv = await invite({
      agent: "0x" + "bb".repeat(20),
      name: "Bob",
      code: CODE,
    });
    vi.setSystemTime(new Date("2026-10-22T10:04:59Z"));
    const fresh = await invite({
      agent: "0x" + "cc".repeat(20),
      name: "Cal",
      code: CODE,
    });
    vi.setSystemTime(new Date("2026-10-22T10:05:01Z"));
    const late = await connect(inv.token!);
    expect(late.closed).toEqual({ code: 4404, reason: "no standing" });
    const inTime = await connect(fresh.token!);
    expect(inTime.closed).toBeNull();
  });

  it("only the leader (or a navigator / decorator the host named) moves and marks; roles are the host's", async () => {
    const { r, create, invite, connect, as } = await room();
    await create();
    const host = await connect(
      (await invite({ agent: HOST.agent, name: HOST.name })).token!
    );
    expect(host.state?.agent).toBe(HOST.agent);
    const bob = await connect(
      (await invite({ agent: "0x" + "bb".repeat(20), name: "Bob", code: CODE }))
        .token!
    );

    expect(() =>
      as(bob, () => r.follow({ ...PASSAGE, chapterNumber: 4 }))
    ).toThrow("only the leader navigates");
    expect(() =>
      as(bob, () => r.decorate({ start: 16, end: 16, colorId: "yellow" }))
    ).toThrow("only the leader decorates");
    expect(() =>
      as(bob, () => r.setRole("0x" + "bb".repeat(20), "leader"))
    ).toThrow("only the host assigns roles");
    expect(() => as(bob, () => r.end())).toThrow(
      "only the host ends the session"
    );
    expect(r.state.passage).toEqual(PASSAGE);
    expect(r.state.decorations).toEqual([]);

    as(host, () => r.follow({ ...PASSAGE, chapterNumber: 4 }));
    expect(r.state.passage?.chapterNumber).toBe(4);
    const id = as(host, () =>
      r.decorate({ start: 1, end: 2, colorId: "green" })
    );
    expect(r.state.decorations.map((d) => [d.id, d.by, d.chapter])).toEqual([
      [id, HOST.agent, "JHN.4"],
    ]);

    as(host, () => r.setRole("0x" + "bb".repeat(20), "navigator"));
    as(bob, () => r.follow({ ...PASSAGE, chapterNumber: 5 }));
    expect(r.state.passage?.chapterNumber).toBe(5);
    // Moving chapter drops the other chapter's decorations from the synced state.
    expect(r.state.decorations).toEqual([]);
    expect(() =>
      as(bob, () => r.decorate({ start: 1, end: 1, colorId: "pink" }))
    ).toThrow("only the leader decorates");

    // Leadership can pass to a person, never to a guest.
    const guest = await invite({ guest: true, name: "Visitor", code: CODE });
    expect(guest.agent).toMatch(/^guest:/);
    await connect(guest.token!);
    expect(() => as(host, () => r.setRole(guest.agent!, "leader"))).toThrow(
      "a guest cannot lead the session"
    );
    as(host, () => r.setRole("0x" + "bb".repeat(20), "leader"));
    expect(r.state.leader).toBe("0x" + "bb".repeat(20));

    // A connection that was never admitted cannot act at all.
    const nobody = (
      r as unknown as { addConnection<S>(id: string): FakeConnection<S> }
    ).addConnection<Conn>("nobody");
    expect(() => as(nobody, () => r.follow(PASSAGE))).toThrow("not admitted");
  });

  it("drops a device's presence frames faster than ten a second, and never echoes them to the sender", async () => {
    const { r, create, invite, connect, as } = await room();
    await create();
    const host = await connect(
      (await invite({ agent: HOST.agent, name: HOST.name })).token!
    );
    const bob = await connect(
      (await invite({ agent: "0x" + "bb".repeat(20), name: "Bob", code: CODE }))
        .token!
    );
    as(bob, () => r.presence({ verse: 16 }));
    vi.setSystemTime(new Date("2026-10-22T10:00:00.050Z"));
    as(bob, () => r.presence({ verse: 17 }));
    vi.setSystemTime(new Date("2026-10-22T10:00:00.150Z"));
    as(bob, () => r.presence({ verse: 18 }));
    const frames = host.sent.map(
      (f) => JSON.parse(f) as { t: string; verse: number }
    );
    expect(
      frames.filter((f) => f.t === "presence").map((f) => f.verse)
    ).toEqual([16, 18]);
    expect(bob.sent.filter((f) => JSON.parse(f).t === "presence")).toEqual([]);
    expect(r.state.seq).toBe(3); // create + two joins — presence is never an op
  });

  it("wipe closes every device and forgets the room; the record is elsewhere", async () => {
    const { r, internal, create, invite, connect } = await room();
    await create();
    const host = await connect(
      (await invite({ agent: HOST.agent, name: HOST.name })).token!
    );
    expect((await internal("/wipe", {})).status).toBe(200);
    expect(host.closed).toEqual({ code: 4410, reason: "wiped" });
    expect(r.state.startedAt).toBeNull();
    expect(r.state.participants).toEqual([]);
    expect(r.opsAfter(0)).toEqual([]);
  });
});
