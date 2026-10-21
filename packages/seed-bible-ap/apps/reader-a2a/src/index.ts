// reader-a2a — the Seed Bible reader workspace agent (hello world). Browser → A2A → MCP, the same triad shape as
// verifiable-content-demo's scripture agent. The service host answers the card, `/api/a2a` and `/harness/*`;
// the routes below are the app's own: a plain `/hello`, `/me` (who the token says you are), and the dev-reader list.

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Address } from "@agenticprimitives/types";
import { createReaderHost, ReaderRunDO } from "./host";
import {
  bearerOf,
  devReaders,
  readerFromToken,
  type SessionEnv,
} from "./session";
import { servedEstates, TOWN } from "../../../estate/faithnet";
export { ReaderRunDO };

export interface Env extends SessionEnv {
  /** reader-mcp by URL (dev) or by service binding (deployed — same-account workers.dev fetches 1042). */
  MCP_URL?: string;
  MCP?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  /** This agent's Smart Agent address — its on-chain identity (estate/seed-reader.faithnet.json). Unset in dev. */
  A2A_AGENT_SA?: string;
  A2A_CHAIN_ID?: string;
  AGENT_NAME?: string;
  A2A_PUBLIC_ORIGIN?: string;
  /** The agent's own run object and the in-Worker marker its store requires (a secret, never a custody key). */
  RUNS: DurableObjectNamespace;
  A2A_INTERNAL_MARKER?: string;
}

/** A dev agent address for a worker that has no chartered Smart Agent yet — never used to sign anything. */
const DEV_AGENT: Address = "0x0000000000000000000000000000000000000001";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

const mcpUrl = (env: Env) =>
  (env.MCP_URL ?? "http://127.0.0.1:8890").replace(/\/$/, "");
const mcpFetch = (env: Env, path: string, init?: RequestInit) =>
  env.MCP
    ? env.MCP.fetch(`https://mcp${path}`, init)
    : fetch(`${mcpUrl(env)}${path}`, init);

async function mcpHello(
  env: Env,
  name: string | undefined
): Promise<{ greeting: string; workspace: string }> {
  const res = await mcpFetch(env, "/tools/hello", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const out = (await res.json()) as {
    ok?: boolean;
    greeting?: string;
    workspace?: string;
    error?: string;
  };
  if (!res.ok || !out.ok || !out.greeting)
    throw new Error(out.error ?? `reader-mcp answered ${res.status}`);
  return { greeting: out.greeting, workspace: out.workspace ?? "" };
}

const publicOrigin = (c: { env: Env; req: { url: string } }) =>
  (c.env.A2A_PUBLIC_ORIGIN ?? new URL(c.req.url).origin).replace(/\/$/, "");
const agentSa = (env: Env): Address =>
  (env.A2A_AGENT_SA as Address | undefined) ?? DEV_AGENT;
/** The one thing the host needs from the platform context; typed loosely because Hono's and workers-types' contexts differ. */
type WaitUntil = { waitUntil(p: Promise<unknown>): void };
/** Hono's `executionCtx` getter THROWS when there is none (an in-process `app.request`, the smoke). */
const executionCtxOf = (c: {
  executionCtx?: WaitUntil;
}): WaitUntil | undefined => {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
};

const readerHost = (c: {
  env: Env;
  req: { url: string };
  executionCtx?: WaitUntil;
}) => {
  const ctx = executionCtxOf(c);
  return createReaderHost({
    agentSa: agentSa(c.env),
    origin: publicOrigin(c),
    internalHeaders: () => ({
      "x-ap-internal": String(c.env.A2A_INTERNAL_MARKER ?? ""),
    }),
    runs: c.env.RUNS,
    bearer: (token) => readerFromToken(c.env, token),
    hello: (name) => mcpHello(c.env, name),
    ...(ctx ? { waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p) } : {}),
    log: (line) => console.log(line),
  });
};

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "seed-bible-reader-a2a",
    agent: c.env.AGENT_NAME ?? "seed-reader.workspace",
    agentSa: c.env.A2A_AGENT_SA ?? null,
    town: TOWN.label,
    chainId: Number(c.env.A2A_CHAIN_ID ?? TOWN.chainId),
    estates: servedEstates(c.env).map((e) => ({ id: e.id, home: e.home })),
    devStubSessions: c.env.DEV_STUB_SESSIONS === "1",
  })
);

// The standard A2A surface and the harness: card · /api/a2a · /harness/* — the host's, mounted before the app's routes.
app.get(
  "/.well-known/agent-card.json",
  async (c) =>
    (await readerHost(c).fetch(c.req.raw)) ?? c.json({ ok: false }, 404)
);
app.post(
  "/api/a2a",
  async (c) =>
    (await readerHost(c).fetch(c.req.raw)) ?? c.json({ ok: false }, 404)
);
app.all(
  "/harness/*",
  async (c) =>
    (await readerHost(c).fetch(c.req.raw)) ??
    c.json({ ok: false, error: "no such route" }, 404)
);

/** The plain lane: hello for anyone; the reader's own name when a session token is presented. */
app.post("/hello", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    id_token?: string;
    name?: string;
  };
  const reader = await readerFromToken(
    c.env,
    body.id_token ?? bearerOf(c.req.raw)
  );
  try {
    const out = await mcpHello(c.env, reader?.name ?? body.name);
    return c.json({
      ok: true,
      ...out,
      reader: reader
        ? {
            agent: reader.agent,
            name: reader.name,
            estate: reader.estate,
            via: reader.via,
          }
        : null,
    });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      502
    );
  }
});

/** Who the presented token is — verified against their Home, never trusted from the browser. */
app.get("/me", async (c) => {
  const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
  if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
  return c.json({ ok: true, reader });
});

/** Local dev only: the seed demo reader(s) the web app may sign in as. Empty unless DEV_STUB_SESSIONS = "1". */
app.get("/dev/readers", (c) =>
  c.json({
    ok: true,
    readers: Object.entries(devReaders(c.env)).map(([handle, r]) => ({
      handle,
      name: r.name,
      sa: r.sa,
    })),
  })
);

export default app;
