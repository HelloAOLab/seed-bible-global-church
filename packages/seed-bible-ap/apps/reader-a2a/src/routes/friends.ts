// /api/friends/* — adding and removing a friend as the reader, with no Home window, once they allowed it (act-as-me,
// wires/act.ts). The step is the reader's own agent's (`person.contact.invite` / `person.contact.remove`), asked as
// them over their ask-as-me wire; when it parks for their authority, their standing wire for that act stands in for
// the signature. Without a standing wire (never allowed, lapsed, revoked) the answer is `needs-signature`, and the
// reader opens the Home's window as before.
//
//   POST   /api/connect/act      { delegations }      keep the standing wires the Home returned
//   GET    /api/friends/act                            { allowed, until, acts }
//   DELETE /api/friends/act                            forget them here (revoking is at the Home)
//   POST   /api/friends/add      { contact }          a name (ruth.me) or an address
//   POST   /api/friends/remove   { contact }
import { Hono } from "hono";
import { decodeJwt } from "jose";
import {
  bearerOf,
  readerFromToken,
  type Reader,
  type SessionEnv,
} from "../session";
import { PersonAgent, type PersonAgentEnv } from "../clients/person-agent";
import { wireFor, WireRefusal, type WireEnv } from "../wires";
import {
  actWiresFor,
  deriveForParked,
  dropActWires,
  keepActWires,
  wireUntil,
  type ActEnv,
} from "../wires/act";

export type FriendsEnv = SessionEnv & WireEnv & ActEnv & PersonAgentEnv;

export const friendRoutes = new Hono<{ Bindings: FriendsEnv }>();

const CLIENT = "seed-bible-reader";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

async function signedIn(c: {
  env: FriendsEnv;
  req: { raw: Request };
}): Promise<{ reader: Reader; bearer: string } | null> {
  const bearer = bearerOf(c.req.raw);
  const reader = await readerFromToken(c.env, bearer);
  return reader && bearer && reader.via !== "dev-stub"
    ? { reader, bearer }
    : null;
}

const refusal = (e: unknown) =>
  e instanceof WireRefusal
    ? Response.json(
        {
          ok: false,
          error: e.message,
          ...(/^needs-signature/.test(e.message)
            ? { needsSignature: true }
            : {}),
        },
        { status: e.status }
      )
    : Response.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );

friendRoutes.post("/api/connect/act", async (c) => {
  const who = await signedIn(c);
  if (!who) return c.json({ ok: false, error: "no reader session" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as {
    delegations?: unknown;
  };
  try {
    const kept = await keepActWires(c.env, who.reader.agent, body.delegations);
    return c.json({ ok: true, acts: kept.map((w) => w.capability) });
  } catch (e) {
    return refusal(e);
  }
});

friendRoutes.get("/api/friends/act", async (c) => {
  const who = await signedIn(c);
  if (!who) return c.json({ ok: true, allowed: false });
  const wires = await actWiresFor(c.env, who.reader.agent);
  const untils = wires.map(wireUntil).filter((u) => u > 0);
  return c.json({
    ok: true,
    allowed: wires.length > 0,
    acts: wires.map((w) => w.capability),
    ...(untils.length ? { until: Math.min(...untils) } : {}),
  });
});

friendRoutes.delete("/api/friends/act", async (c) => {
  const who = await signedIn(c);
  if (!who) return c.json({ ok: false, error: "no reader session" }, 401);
  await dropActWires(c.env, who.reader.agent);
  return c.json({ ok: true, allowed: false });
});

/** A name the reader typed (ruth.me) as the address their agent's step needs — asked of their own Home. */
async function addressOf(bearer: string, contact: string): Promise<string> {
  if (ADDRESS.test(contact)) return contact.toLowerCase();
  const home = String(decodeJwt(bearer).iss ?? "").replace(/\/+$/, "");
  const res = await fetch(
    `${home}/connect/name-info?name=${encodeURIComponent(contact.toLowerCase())}`
  ).catch(() => null);
  const out = (await res?.json().catch(() => null)) as {
    exists?: boolean;
    agent?: string;
  } | null;
  if (!out?.exists || !out.agent || !ADDRESS.test(out.agent))
    throw new WireRefusal(404, `no one is named ${contact}`);
  return out.agent.toLowerCase();
}

async function act(
  c: { env: FriendsEnv; req: { raw: Request; json: () => Promise<unknown> } },
  toolId: "person.contact.invite" | "person.contact.remove"
): Promise<Response> {
  const who = await signedIn(c);
  if (!who)
    return Response.json(
      { ok: false, error: "no reader session" },
      { status: 401 }
    );
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as {
    contact?: string;
  };
  const typed = String(body.contact ?? "").trim();
  if (!typed)
    return Response.json(
      { ok: false, error: "contact required" },
      { status: 400 }
    );
  try {
    const standing = await actWiresFor(c.env, who.reader.agent);
    if (!standing.some((w) => w.capability === toolId))
      throw new WireRefusal(409, "needs-signature: not allowed here yet");
    const wire = await wireFor(c.env, who.reader.agent);
    if (!wire)
      throw new WireRefusal(
        409,
        "needs-signature: this workspace holds no permission to ask your agent — sign in again"
      );
    const contact = await addressOf(who.bearer, typed);
    const agent = new PersonAgent(c.env, who.reader.agent, wire);
    const args =
      toolId === "person.contact.invite"
        ? { contact, role: "friend" }
        : { contact };
    const out = await agent.runActing<Record<string, unknown>>(
      [{ toolId, args }],
      toolId === "person.contact.invite"
        ? `add ${typed} as a friend`
        : `remove ${typed} from my contacts`,
      (reply) => deriveForParked(c.env, standing, reply),
      { client: CLIENT, template: "act-as-me" }
    );
    return Response.json({ ok: true, contact, runRef: out.runRef });
  } catch (e) {
    return refusal(e);
  }
}

friendRoutes.post("/api/friends/add", (c) => act(c, "person.contact.invite"));
friendRoutes.post("/api/friends/remove", (c) =>
  act(c, "person.contact.remove")
);
