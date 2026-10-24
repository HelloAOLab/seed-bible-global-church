// A LIVE SESSION'S CALL: a signed-in reader the session knows (its host, or someone it let in under the share code)
// is named to the Home under the paired secret — the host as steward, anyone else as a party — with the session as
// the scope; a stranger, a signed-out caller and a session that has ended are refused without asking the Home.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("agents", () => import("../../helpers/fakeAgentsSdk"));

import { Hono } from "hono";
import { ReadingSession } from "../../../apps/reader-a2a/src/rooms/ReadingSession";
import {
  huddleRoutes,
  type HuddleEnv,
} from "../../../apps/reader-a2a/src/routes/huddle";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { installFakeNetwork } from "../../helpers/fakeNetwork";

afterEach(() => vi.unstubAllGlobals());

const MARKER = "internal-marker";
const SESSION = "11111111-2222-3333-4444-555555555555";
const HOST = "0x" + "aa".repeat(20);
const FRIEND = "0x" + "bb".repeat(20);
const STRANGER = "0x" + "cc".repeat(20);
const WORKSPACE = "0x" + "dd".repeat(20);
const SECRET = "reader-huddle-secret";

async function setup() {
  const room = new ReadingSession({} as never, { A2A_INTERNAL_MARKER: MARKER });
  await room.onStart();
  const internal = (path: string, body: unknown) =>
    room.onRequest(
      new Request(`https://room/agents/reading-session/${SESSION}${path}`, {
        method: "POST",
        headers: { "x-ap-internal": MARKER },
        body: JSON.stringify(body),
      })
    );
  await internal("/create", {
    id: SESSION,
    host: { agent: HOST, name: "Ruth" },
    passage: { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
    code: "ABCD",
  });
  await internal("/invite", { agent: FRIEND, name: "Naomi", code: "ABCD" });

  const home = fakeHomeJwks();
  const asked: Array<{ path: string; auth: string | null; body: unknown }> = [];
  const runtime = new Hono();
  runtime.post("/huddles/:op", async (c) => {
    asked.push({
      path: c.req.path,
      auth: c.req.header("authorization") ?? null,
      body: await c.req.json(),
    });
    return c.json({ ok: true, authToken: "rtk-token", run: { roster: [] } });
  });
  installFakeNetwork({
    "www.faithnet.me": home.app,
    "a2a.faithnet.io": runtime,
  });

  const env: HuddleEnv = {
    ESTATE_IDS: "faithnet",
    A2A_URL: "https://a2a.faithnet.io",
    A2A_AGENT_SA: WORKSPACE,
    READER_HUDDLE_SECRET: SECRET,
    A2A_INTERNAL_MARKER: MARKER,
    ReadingSession: {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: (url: string, init?: RequestInit) =>
          room.onRequest(new Request(url, init)),
      }),
    } as never,
  };
  const app = new Hono<{ Bindings: HuddleEnv }>().route("/", huddleRoutes);
  const call = async (op: string, who: string | null, name = "Someone") =>
    app.request(
      `/api/session/${SESSION}/huddle/${op}`,
      {
        method: "POST",
        headers: who
          ? {
              authorization: `Bearer ${await home.issueIdToken({ sub: who, name })}`,
            }
          : {},
      },
      env
    );
  return { call, asked, internal };
}

describe("a live session's call", () => {
  it("names the host to the Home as the session's steward, under the paired secret", async () => {
    const { call, asked } = await setup();
    const res = await call("start", HOST, "Ruth");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authToken: "rtk-token" });
    expect(asked).toEqual([
      {
        path: "/huddles/start",
        auth: `Bearer ${SECRET}`,
        body: {
          actor: HOST,
          standing: "steward",
          scope: {
            kind: "conversation",
            principal: WORKSPACE,
            id: `reading-session:${SESSION}`,
          },
          displayName: "Ruth",
        },
      },
    ]);
  });

  it("names someone the session let in as a party", async () => {
    const { call, asked } = await setup();
    expect((await call("join", FRIEND, "Naomi")).status).toBe(200);
    expect(asked[0]?.body).toMatchObject({ actor: FRIEND, standing: "party" });
  });

  it("refuses a stranger, a signed-out caller and an ended session without asking the Home", async () => {
    const { call, asked, internal } = await setup();
    expect((await call("join", STRANGER)).status).toBe(404);
    expect((await call("join", null)).status).toBe(401);
    await internal("/wipe", {});
    expect((await call("join", HOST)).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it("asks nothing for an operation the session does not offer", async () => {
    const { call, asked } = await setup();
    expect((await call("removeParticipant", HOST)).status).toBe(404);
    expect(asked).toEqual([]);
  });
});
