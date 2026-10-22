// THE WORKSPACE IN-PROCESS — reader-a2a's door for a test without a Worker: the same `readerFromToken` (the fake
// Home's JWKS over the fake network), the same wire store (`keepWire` into a D1 stand-in) and the same skill
// invokers (skills/index.ts), so a harness ask from the browser's backend runs the real vault code against the
// fake person agent. No service host, no Durable Object run store: one step per ask, answered in the host's
// reply shape. `fetch` maps the browser's `${A2A_BASE}/…` to this app, so `createA2aBackend` needs no network.
import { Hono } from "hono";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "@agenticprimitives/types";
import type { AdmittedPrincipal } from "@agenticprimitives/service-host";
import { bearerOf, readerFromToken } from "../../apps/reader-a2a/src/session";
import { keepWire, type DelegationWire } from "../../apps/reader-a2a/src/wires";
import { invokers, type SkillDeps } from "../../apps/reader-a2a/src/skills";
import { A2A_BASE } from "../../apps/reader-web/src/api";
import type { ReaderSession } from "../../apps/reader-web/src/session";
import { fakeWireDb, TEST_ASK_KEY } from "./wires";
import type { FakeLibrary } from "./fakeLibrary";

export const A2A_URL = "https://a2a.faithnet.io";

export interface FakeWorkspaceOptions {
  /** The Library the public read (`/api/public/read`) answers from, when a test has one. */
  library?: FakeLibrary;
  askKey?: string;
}

export interface FakeWorkspace {
  app: Hono;
  env: SkillDeps["env"] & { ESTATE_IDS: string };
  /** The workspace's asking key address — the wire's delegate. */
  askKey: string;
  /** Keep a reader's wire, as sign-in would (checked the way the Worker checks it). */
  connect(reader: string, wire: DelegationWire): Promise<void>;
  /** The browser session a verified id_token gives, as the web app keeps it. */
  sessionFor(token: string): Promise<ReaderSession | null>;
  /** A `fetch` for `createA2aBackend`: `${A2A_BASE}/…` lands on this app. */
  fetch: typeof fetch;
  /** Every harness ask the door admitted, in order. */
  asks: Array<{
    reader: string;
    toolId: string;
    args: Record<string, unknown>;
  }>;
}

export function fakeWorkspace(opts: FakeWorkspaceOptions = {}): FakeWorkspace {
  const env = {
    READER_ASK_PRIVATE_KEY: opts.askKey ?? TEST_ASK_KEY,
    A2A_URL,
    DB: fakeWireDb(),
    ESTATE_IDS: "faithnet",
    PLATFORM_URL: "https://seed-bible-a2a.faithnet.io",
  } as FakeWorkspace["env"];
  const askKey = privateKeyToAccount(
    env.READER_ASK_PRIVATE_KEY as `0x${string}`
  ).address.toLowerCase();
  const asks: FakeWorkspace["asks"] = [];
  const app = new Hono();
  const deps: SkillDeps = {
    env,
    hello: async (name) => ({
      greeting: `Hello, ${name ?? "reader"}!`,
      workspace: "seed-reader.workspace (test)",
    }),
  };

  app.post("/harness/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      session?: string;
      message?: string;
      plan?: {
        steps?: Array<{
          id?: string;
          toolId: string;
          args?: Record<string, unknown>;
        }>;
      };
    };
    const reader = await readerFromToken(
      env,
      body.session ?? bearerOf(c.req.raw)
    );
    if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
    const step = body.plan?.steps?.[0];
    if (!step)
      return c.json({ ok: false, error: "a supplied plan is required" }, 400);
    const asker: AdmittedPrincipal = {
      agent: reader.agent as Address,
      credential: { kind: "home-session", token: body.session ?? "" },
    };
    asks.push({
      reader: reader.agent,
      toolId: step.toolId,
      args: step.args ?? {},
    });
    const inv = invokers({ ...deps, askerName: reader.name }, asker)[
      step.toolId
    ];
    if (!inv)
      return c.json({
        ok: true,
        reply: {
          kind: "refused",
          error: `this workspace does not offer ${step.toolId}`,
        },
      });
    const runRef = `ws-${asks.length}`;
    try {
      const result = await inv(step.toolId, step.args ?? {}, {
        operationId: runRef,
      } as never);
      return c.json({
        ok: true,
        runRef,
        reply: { kind: "answer", results: [{ toolId: step.toolId, result }] },
      });
    } catch (e) {
      // The host's envelope for a step that threw (service-host run.ts): ok false, the words in `error`, HTTP 200.
      const error = e instanceof Error ? e.message : String(e);
      return c.json({
        ok: false,
        runRef,
        error,
        reply: {
          kind: "refused",
          runRef,
          text: error,
          results: [],
          receipts: [],
        },
      });
    }
  });

  app.get("/me", async (c) => {
    const reader = await readerFromToken(env, bearerOf(c.req.raw));
    if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
    return c.json({ ok: true, reader });
  });

  app.post("/hello", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      id_token?: string;
      name?: string;
    };
    const reader = await readerFromToken(
      env,
      body.id_token ?? bearerOf(c.req.raw)
    );
    const out = await deps.hello(reader?.name ?? body.name);
    return c.json({ ok: true, ...out, reader });
  });

  app.post("/api/presence/beat", async (c) => {
    const reader = await readerFromToken(env, bearerOf(c.req.raw));
    if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
    return c.json({ ok: true });
  });
  app.get("/api/presence/friends", async (c) => {
    const reader = await readerFromToken(env, bearerOf(c.req.raw));
    if (!reader) return c.json({ ok: false, error: "no reader session" }, 401);
    return c.json({ ok: true, friends: [] });
  });

  app.get("/api/public/read", async (c) => {
    const shelf = c.req.query("shelf") ?? "";
    const path = c.req.query("path") ?? "";
    const at = path.lastIndexOf("/");
    const folder = at >= 0 ? path.slice(0, at) : "";
    const name = at >= 0 ? path.slice(at + 1) : path;
    const r = opts.library
      ? await opts.library.run(shelf, "library.public.read", { folder, name })
      : { read: false, refused: "no Library in this test" };
    if (!r.read)
      return c.json(
        { ok: false, error: String(r.refused ?? "not public") },
        404
      );
    return c.json({ ok: true, text: String(r.text ?? "") });
  });

  const wsFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const path = url.startsWith(A2A_BASE) ? url.slice(A2A_BASE.length) : url;
    return app.request(path, init);
  };

  return {
    app,
    env,
    askKey,
    asks,
    fetch: wsFetch,
    connect: (reader, wire) => keepWire(env, reader, wire),
    async sessionFor(token) {
      const reader = await readerFromToken(env, token);
      if (!reader) return null;
      return {
        token,
        estate: reader.estate,
        name: reader.name,
        sub: reader.agent,
        via: "home",
        wire: true,
      };
    },
  };
}
