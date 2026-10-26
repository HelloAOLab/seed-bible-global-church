// /api/connect — the reader hands this workspace their ask-as-me wire after sign-in (kept per person), or takes it
// back. Authenticated by the reader's Home id_token; the wire itself must be theirs and name this workspace's key.
import { Hono } from "hono";
import { bearerOf, readerFromToken, type SessionEnv } from "../session";
import {
  dropWire,
  keepWire,
  wireFor,
  WireRefusal,
  type DelegationWire,
  type WireEnv,
} from "../wires";

export type ConnectEnv = SessionEnv & WireEnv;

export const connectRoutes = new Hono<{ Bindings: ConnectEnv }>();

connectRoutes.post("/api/connect", async (c) => {
  const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
  if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
  if (reader.via === "dev-stub")
    return c.json(
      { ok: false, error: "a dev reader has no Home, so no wire" },
      400
    );
  const body = (await c.req.json().catch(() => ({}))) as {
    delegation?: DelegationWire;
  };
  if (!body.delegation)
    return c.json({ ok: false, error: "delegation required" }, 400);
  try {
    await keepWire(c.env, reader.agent, body.delegation);
  } catch (e) {
    if (e instanceof WireRefusal)
      return c.json({ ok: false, error: e.message }, e.status as 400);
    throw e;
  }
  return c.json({ ok: true, reader: reader.agent, wire: true });
});

connectRoutes.delete("/api/connect", async (c) => {
  const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
  if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
  await dropWire(c.env, reader.agent);
  return c.json({ ok: true, wire: false });
});

/** Whether this workspace holds a wire for the reader — for `/me` and the page's "Library connected" state. */
export async function hasWire(env: WireEnv, reader: string): Promise<boolean> {
  if (!env.DB) return false;
  return (await wireFor(env, reader)) !== null;
}
