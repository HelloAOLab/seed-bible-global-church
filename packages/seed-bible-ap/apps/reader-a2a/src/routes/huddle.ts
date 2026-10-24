// A LIVE SESSION'S HUDDLE — the estate's call (Cloudflare RealtimeKit through the Home's `/huddles/:op`), for the
// signed-in people in a reading session. This server is the session's authority: it verifies the reader's token,
// asks the room whether they are its host or someone it let in, and names them to the Home under the paired
// secret, with the session as the scope (a conversation under this workspace's agent, `reading-session:<id>`).
// The Home's answer comes back as it is — for a join, the one-time media token for this browser. Guests have no
// agent to name and stay on the session's own voice (the room's mesh).
import { Hono } from "hono";
import { WireRefusal } from "../wires";
import { bearerOf, readerFromToken, type SessionEnv } from "../session";
import { sessionStanding, type RoomsEnv } from "../skills/session";

export interface HuddleEnv extends SessionEnv, RoomsEnv {
  A2A_URL?: string;
  A2A_AGENT_SA?: string;
  READER_HUDDLE_SECRET?: string;
}

const OPS = new Set(["start", "join", "get", "leave", "end"]);

export const huddleRoutes = new Hono<{ Bindings: HuddleEnv }>();

huddleRoutes.post("/api/session/:id/huddle/:op", async (c) => {
  const op = c.req.param("op");
  const sessionId = c.req.param("id");
  if (!OPS.has(op))
    return c.json({ ok: false, error: "unknown huddle operation" }, 404);
  const bearer = bearerOf(c.req.raw);
  const reader = await readerFromToken(c.env, bearer);
  if (!reader || !bearer || bearer.startsWith("dev:"))
    return c.json({ ok: false, error: "sign in to join the call" }, 401);
  const principal = (c.env.A2A_AGENT_SA ?? "").toLowerCase();
  if (!c.env.A2A_URL || !c.env.READER_HUDDLE_SECRET || !principal)
    return c.json({ ok: false, error: "huddles_not_configured" }, 503);
  let standing: "host" | "reader";
  try {
    standing = await sessionStanding(c.env, sessionId, reader.agent);
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      e instanceof WireRefusal ? (e.status as 404) : 500
    );
  }
  const res = await fetch(
    `${c.env.A2A_URL.replace(/\/+$/, "")}/huddles/${op}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${c.env.READER_HUDDLE_SECRET}`,
      },
      body: JSON.stringify({
        actor: reader.agent,
        standing: standing === "host" ? "steward" : "party",
        scope: {
          kind: "conversation",
          principal,
          id: `reading-session:${sessionId}`,
        },
        displayName: reader.name,
      }),
    }
  ).catch(() => null);
  if (!res)
    return c.json({ ok: false, error: "the call service did not answer" }, 502);
  const out = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return c.json(
    out ?? { ok: false, error: `the call service answered ${res.status}` },
    res.status as 200
  );
});
