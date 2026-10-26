import { decodeJwt } from "jose";
import { WireRefusal } from "./wires";
import { joinSessionAsGuest } from "./skills/session";
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
import { estateById, servedEstates, TOWN } from "../../../estate/faithnet";
import { askScripture, bibleRoutes, type BibleEnv } from "./routes/bible";
import { connectRoutes, hasWire } from "./routes/connect";
import { publicRoutes } from "./routes/public";
import { huddleRoutes, type HuddleEnv } from "./routes/huddle";
import { baseMapRoutes } from "./routes/basemap";
import { passageRoutes, type PublishingEnv } from "./routes/passage";
import { agentFor, readBucket } from "./skills/vault";
// The Agents SDK is loaded when a room is asked for, not at import: it reaches for `cloudflare:workers`, which only
// the Worker runtime has, and this app is also imported by the in-process smoke (scripts/smoke.ts). The room class
// itself is exported from worker.ts, the deploy entry.
import { askingKeyAddress, type WireEnv } from "./wires";
import { platformSend, type PlatformEnv } from "./clients/platform";
export { ReaderRunDO };

export interface Env
  extends SessionEnv, WireEnv, PlatformEnv, BibleEnv, HuddleEnv, PublishingEnv {
  /** The estate's agent runtime — a reader's own agent is asked there over their wire. */
  A2A_URL?: string;
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
  /** The live reading rooms (rooms/ReadingSession.ts), bound by class name as the Agents SDK routes them. */
  ReadingSession?: DurableObjectNamespace;
  A2A_INTERNAL_MARKER?: string;
}

/** A dev agent address for a worker that has no chartered Smart Agent yet — never used to sign anything. */
const DEV_AGENT: Address = "0x0000000000000000000000000000000000000001";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());
app.route("/", connectRoutes);
app.route("/", bibleRoutes);
app.route("/", publicRoutes);
app.route("/", huddleRoutes);
app.route("/", baseMapRoutes);
// The passage's own marks come from the signed-in reader's agent (their Library), never from the registry.
app.route(
  "/",
  passageRoutes<Env>(async (c) => {
    const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
    if (!reader) return null;
    return async (chapterRef) => {
      const agent = await agentFor(c.env, reader.agent.toLowerCase());
      const [h, a] = await Promise.all([
        readBucket(agent, "highlights", chapterRef),
        readBucket(agent, "annotations", chapterRef),
      ]);
      return [...h.bucket["@graph"], ...a.bucket["@graph"]] as Array<
        Record<string, unknown>
      >;
    };
  })
);
// The rooms: people's devices join a session on this origin (realtime-collaboration.md rule 2).
app.all("/agents/*", async (c) => {
  const { routeAgentRequest } = await import("agents");
  const r = await routeAgentRequest(
    c.req.raw,
    c.env as unknown as Record<string, unknown>,
    { cors: true }
  );
  return r ?? c.json({ ok: false, error: "no such room" }, 404);
});

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
    env: c.env,
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
    askingKey: askingKeyAddress(c.env),
    wireStore: !!c.env.DB,
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

/** The study companion: a signed-in reader's question, streamed from the serving plane (hard-problems §9). */
app.post("/companion/ask", async (c) => {
  const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
  if (!reader)
    return c.json({ ok: false, error: "sign in to ask the companion" }, 401);
  const body = await c.req.text();
  const res = await platformSend(c.env, "/companion", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sb-upload-token": c.env.PLATFORM_UPLOAD_TOKEN ?? "",
    },
    body,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return c.json(
      {
        ok: false,
        error: j?.error ?? `the serving plane answered ${res.status}`,
      },
      res.status === 403 ? 502 : (res.status as 400)
    );
  }
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      ...(res.headers.get("x-sb-who")
        ? { "x-sb-who": res.headers.get("x-sb-who")! }
        : {}),
    },
  });
});

/**
 * PRESENCE — where the reader is now, for their friends, and where their friends are (the runtime's `/presence/*`
 * under the reader's own token, forwarded: the browser talks to this origin only). A beat is no act and no record;
 * it lapses on its own. The reader's agent is not run for it.
 */
async function presenceForward(
  c: { req: { raw: Request }; env: Env },
  path: string,
  init: RequestInit
): Promise<Response> {
  const bearer = bearerOf(c.req.raw);
  const reader = await readerFromToken(c.env, bearer);
  if (!reader || !bearer || bearer.startsWith("dev:"))
    return Response.json(
      { ok: false, error: "sign in to share where you are reading" },
      { status: 401 }
    );
  if (!c.env.A2A_URL)
    return Response.json(
      { ok: false, error: "A2A_URL is not configured" },
      { status: 503 }
    );
  const res = await fetch(`${c.env.A2A_URL.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${bearer}` },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
app.post("/api/presence/beat", async (c) =>
  presenceForward(c, "/presence/beat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await c.req.text(),
  })
);
app.get("/api/presence/friends", async (c) =>
  presenceForward(c, "/presence/friends", { method: "GET" })
);

/**
 * FRIEND INVITATIONS BY EMAIL and being found by email — the Home's (`/connect/friend-invite/*`, `/connect/findable`),
 * asked under the reader's own token, forwarded: the browser talks to this origin only. The Home is the one that
 * signed the reader in (the token's issuer, already checked); an invitation opened signed out asks the estate's
 * Home. The reader's origin goes along so the Home's email links land back in the reader.
 */
async function homeForward(
  c: { req: { raw: Request }; env: Env },
  path: string,
  init: RequestInit,
  opts: { signedOut?: boolean } = {}
): Promise<Response> {
  const bearer = bearerOf(c.req.raw);
  const reader = await readerFromToken(c.env, bearer);
  const signedIn = !!reader && !!bearer && !bearer.startsWith("dev:");
  if (!signedIn && !opts.signedOut)
    return Response.json(
      { ok: false, error: "sign in to invite a friend" },
      { status: 401 }
    );
  const home = signedIn
    ? String(decodeJwt(bearer!).iss ?? "")
    : (estateById("faithnet")?.home ?? "");
  if (!home)
    return Response.json(
      { ok: false, error: "no Home to ask" },
      { status: 503 }
    );
  const origin = c.req.raw.headers.get("origin");
  const res = await fetch(`${home.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(origin ? { origin } : {}),
      ...(signedIn ? { authorization: `Bearer ${bearer}` } : {}),
    },
  });
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
app.get("/api/friends/invites", async (c) =>
  homeForward(c, "/connect/friend-invite/email", { method: "GET" })
);
app.post("/api/friends/invites", async (c) =>
  homeForward(c, "/connect/friend-invite/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await c.req.text(),
  })
);
app.get("/api/friends/invites/lookup", async (c) =>
  homeForward(
    c,
    `/connect/friend-invite/lookup?token=${encodeURIComponent(c.req.query("token") ?? "")}`,
    { method: "GET" },
    { signedOut: true }
  )
);
// The public name an agent address resolves to (the chain's reverse record, forward-confirmed at the Home), or null —
// what a friend can actually type to find someone. Public: no sign-in needed.
app.get("/api/public-name", async (c) => {
  const address = (c.req.query("address") ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address))
    return c.json({ ok: false, error: "address (0x…40) required" }, 400);
  return homeForward(
    c,
    `/connect/reverse-name?address=${address}`,
    { method: "GET" },
    { signedOut: true }
  );
});
/**
 * THE READER'S HOME PROFILE — the person's first and last name and photo as their Home holds them (the vault's
 * `impact-profile`), read under the reader's own read grant (minted at sign-in; the interactions DO checks it is for
 * this app and covers that record) and handed to the browser as those four fields only (names, the line about them, photo) — the record also holds
 * contact details the reader has no use for. A change is never written from here (an app may not write a vault
 * record): it is proposed to the Home (`/connect/profile-proposal`), which saves it on the person's yes.
 */
app.get("/api/home-profile", async (c) => {
  const bearer = bearerOf(c.req.raw);
  const reader = await readerFromToken(c.env, bearer);
  if (!reader || !bearer || bearer.startsWith("dev:"))
    return c.json(
      { ok: false, error: "sign in to see your Home profile" },
      401
    );
  if (!c.env.A2A_URL)
    return c.json({ ok: false, error: "A2A_URL is not configured" }, 503);
  const res = await fetch(
    `${c.env.A2A_URL.replace(/\/+$/, "")}/interactions/${reader.agent.toLowerCase()}/record.get`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: bearer, recordType: "impact-profile" }),
    }
  );
  const out = (await res.json().catch(() => null)) as {
    ok?: boolean;
    record?: { contact?: Record<string, unknown> } | null;
    error?: string;
    code?: string;
  } | null;
  if (!res.ok || !out?.ok) {
    // No read grant yet (signed in before the reader asked for one): sign in again and the Home mints it.
    const noGrant =
      out?.code === "read_grant_absent" || out?.code === "read_grant_revoked";
    return c.json(
      {
        ok: false,
        code: noGrant ? "no_grant" : "unreadable",
        error: noGrant
          ? "Sign in again to let the reader show your Home profile."
          : (out?.error ??
            `your Home profile could not be read (${res.status})`),
      },
      noGrant ? 409 : 502
    );
  }
  const contact = out.record?.contact ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const photo =
    typeof contact["photo"] === "string" &&
    /^data:image\/(jpeg|png|webp);base64,/.test(contact["photo"] as string)
      ? (contact["photo"] as string)
      : null;
  return c.json(
    {
      ok: true,
      firstName: text(contact["firstName"]),
      lastName: text(contact["lastName"]),
      about: text(contact["about"]),
      photo,
    },
    200,
    { "cache-control": "private, no-store" }
  );
});
app.post("/api/home-profile/propose", async (c) =>
  homeForward(c, "/connect/profile-proposal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await c.req.text(),
  })
);
app.get("/api/findable", async (c) =>
  homeForward(c, "/connect/findable", { method: "GET" })
);
app.post("/api/findable", async (c) =>
  homeForward(c, "/connect/findable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await c.req.text(),
  })
);

/**
 * A GUEST joins a live session: no Home, no sign-in — the share code alone, and a name. The room mints a guest
 * identity good for this session; a guest follows, chats, is on voice, may navigate or decorate when the host
 * says so, and never leads. Nothing of a guest's is kept anywhere: there is no Library to keep it in.
 */
app.post("/api/session/guest", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as {
    sessionId?: string;
    code?: string;
    name?: string;
  };
  const sessionId = String(b.sessionId ?? "");
  const code = String(b.code ?? "")
    .trim()
    .toUpperCase();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !code)
    return c.json(
      { ok: false, error: "a session id and its share code are required" },
      400
    );
  try {
    const out = await joinSessionAsGuest(
      c.env,
      sessionId,
      code,
      String(b.name ?? "")
    );
    return c.json({ ok: true, ...out });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      e instanceof WireRefusal ? (e.status as 404) : 500
    );
  }
});

/** Transcription (read-only): a chunk of the reader's audio to the serving plane's speech model; nothing is kept. */
app.post("/api/transcribe", async (c) => {
  const reader = await readerFromToken(c.env, bearerOf(c.req.raw));
  if (!reader)
    return c.json({ ok: false, error: "sign in to transcribe" }, 401);
  const res = await platformSend(c.env, "/transcribe", {
    method: "POST",
    headers: {
      "content-type": c.req.header("content-type") ?? "audio/wav",
      "x-sb-upload-token": c.env.PLATFORM_UPLOAD_TOKEN ?? "",
    },
    body: await c.req.arrayBuffer(),
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// A place's geometry: asked of the scripture agent over A2A (its place-geometry skill — OpenBible.info's geometry, or a
// Theographic point when exactly one place has the name), handed to the map as GeoJSON with where it came from.
app.get("/api/places/:name", async (c) => {
  const name = c.req.param("name");
  try {
    const answer = (await askScripture(c.env, "place-geometry", { name })) as {
      geometry: unknown;
      source: string | null;
      license: string | null;
      match: { method: string; confidence: number } | null;
    };
    return new Response(JSON.stringify(answer.geometry), {
      headers: {
        "content-type": "application/geo+json",
        "cache-control": "public, max-age=86400",
        "x-place-source": answer.source ?? "",
        "x-place-license": answer.license ?? "",
        "x-place-match": answer.match
          ? `${answer.match.method}; confidence ${answer.match.confidence}`
          : "",
      },
    });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      404
    );
  }
});

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
  return c.json({ ok: true, reader, wire: await hasWire(c.env, reader.agent) });
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
