// seed-bible-a2a — `seed-bible.svc`, the serving plane (overview.md). The Seed registry: a rebuildable D1 index built
// by crawling the public shelves of Seed Bible agents through their public doors, verified release by release, and
// queried by passage. It holds no identity but its own, no reader's record, and nothing that cannot be rebuilt.
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Address } from "@agenticprimitives/types";
import { createSvcHost, SvcRunDO } from "./host";
import { crawlAll } from "./registry/crawl";
import {
  applyCrawl,
  listShelves,
  putShelf,
  queryByPassage,
  removeShelf,
  snapshot,
  wipe,
} from "./registry/store";
import { edgeEndpointFor } from "../../../lib/a2a-client";
import { isOsisRef, chapterOf } from "../../../lib/seed-protocol";
export { SvcRunDO };

export interface Env {
  DB: D1Database;
  RUNS: DurableObjectNamespace;
  MCP_URL?: string;
  MCP?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  AGENT_NAME?: string;
  A2A_AGENT_SA?: string;
  A2A_CHAIN_ID?: string;
  A2A_PUBLIC_ORIGIN?: string;
  A2A_INTERNAL_MARKER?: string;
  /** The operator's door for reindex / wipe / shelves. Not a grant: it reads shelves anyone can read. */
  ADMIN_TOKEN?: string;
  EDGE_URL?: string;
  SHELF_FOLDER?: string;
}

const DEV_AGENT: Address = "0x0000000000000000000000000000000000000002";
/** The shelves this estate's Seed Bible starts from when the table is empty — configuration, not discovery. */
const DEFAULT_SHELVES = [
  { name: "seedreader.me", kind: "person" as const },
  { name: "seed-reader.org", kind: "organization" as const },
];

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

const publicOrigin = (c: { env: Env; req: { url: string } }) =>
  (c.env.A2A_PUBLIC_ORIGIN ?? new URL(c.req.url).origin).replace(/\/$/, "");
type WaitUntil = { waitUntil(p: Promise<unknown>): void };
const executionCtxOf = (c: {
  executionCtx?: WaitUntil;
}): WaitUntil | undefined => {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
};

async function shelvesOf(env: Env) {
  let shelves = await listShelves(env.DB);
  if (!shelves.length) {
    for (const s of DEFAULT_SHELVES)
      await putShelf(env.DB, {
        ...s,
        endpoint: edgeEndpointFor(s.name, env.EDGE_URL),
      });
    shelves = await listShelves(env.DB);
  }
  return shelves;
}

export async function reindex(env: Env, fetchImpl: typeof fetch = fetch) {
  const shelves = await shelvesOf(env);
  const crawls = await crawlAll(
    (u, i) => fetchImpl(u, i),
    shelves,
    env.SHELF_FOLDER ?? "seed-bible/public"
  );
  const report = [];
  for (const c of crawls) {
    const r = await applyCrawl(env.DB, c);
    report.push({
      shelf: c.shelf,
      owner: c.owner,
      ok: c.ok,
      ...(c.error ? { error: c.error } : {}),
      listed: c.listed,
      ...r,
      skipped: c.skipped,
    });
  }
  return report;
}

const svcHost = (c: {
  env: Env;
  req: { url: string };
  executionCtx?: WaitUntil;
}) => {
  const ctx = executionCtxOf(c);
  return createSvcHost({
    agentSa: (c.env.A2A_AGENT_SA as Address | undefined) ?? DEV_AGENT,
    origin: publicOrigin(c),
    internalHeaders: () => ({
      "x-ap-internal": String(c.env.A2A_INTERNAL_MARKER ?? ""),
    }),
    runs: c.env.RUNS,
    query: (passage, kind) =>
      queryByPassage(c.env.DB, passage, kind ? { kind } : {}),
    reindex: () => reindex(c.env),
    ...(ctx ? { waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p) } : {}),
    log: (line) => console.log(line),
  });
};

app.get("/health", async (c) =>
  c.json({
    ok: true,
    service: "seed-bible-svc-a2a",
    agent: c.env.AGENT_NAME ?? "seed-bible.svc",
    agentSa: c.env.A2A_AGENT_SA ?? null,
    shelves: (await listShelves(c.env.DB)).map((s) => s.name),
    adminDoor: !!c.env.ADMIN_TOKEN,
  })
);
app.get(
  "/.well-known/agent-card.json",
  async (c) => (await svcHost(c).fetch(c.req.raw)) ?? c.json({ ok: false }, 404)
);
app.post(
  "/api/a2a",
  async (c) => (await svcHost(c).fetch(c.req.raw)) ?? c.json({ ok: false }, 404)
);
app.all(
  "/harness/*",
  async (c) =>
    (await svcHost(c).fetch(c.req.raw)) ??
    c.json({ ok: false, error: "no such route" }, 404)
);

/** The registry, by passage: `?passage=JHN.3` (a verse narrows to its chapter), `&kind=note`. Public: it lists what owners released. */
app.get("/registry/offerings", async (c) => {
  const passage = c.req.query("passage") ?? "";
  if (!isOsisRef(passage))
    return c.json(
      { ok: false, error: "passage must be an OSIS reference (JHN.3)" },
      400
    );
  const rows = await queryByPassage(c.env.DB, chapterOf(passage), {
    kind: c.req.query("kind") ?? undefined,
  });
  return c.json({
    ok: true,
    passage: chapterOf(passage),
    count: rows.length,
    offerings: rows.map((r) => ({
      owner: r.owner,
      shelf: r.shelf,
      entryId: r.entry_id,
      version: r.version,
      releaseId: r.release_id,
      passage: r.passage_ref,
      kind: r.kind,
      title: r.title,
      descriptorId: r.descriptor_id,
      descriptor: JSON.parse(r.descriptor_json) as unknown,
      markdownPath: r.markdown_path,
      indexedAt: r.indexed_at,
    })),
  });
});
app.get("/registry/shelves", async (c) =>
  c.json({ ok: true, shelves: await shelvesOf(c.env) })
);

// ── the operator's door ──────────────────────────────────────────────────────────────────────
const admitted = (c: {
  env: Env;
  req: { header: (n: string) => string | undefined };
}) =>
  !!c.env.ADMIN_TOKEN && c.req.header("x-admin-token") === c.env.ADMIN_TOKEN;
app.post("/admin/reindex", async (c) => {
  if (!admitted(c))
    return c.json({ ok: false, error: "admin token required" }, 401);
  return c.json({
    ok: true,
    at: new Date().toISOString(),
    shelves: await reindex(c.env),
  });
});
app.post("/admin/wipe", async (c) => {
  if (!admitted(c))
    return c.json({ ok: false, error: "admin token required" }, 401);
  await wipe(c.env.DB);
  return c.json({ ok: true, wiped: true });
});
app.get("/admin/snapshot", async (c) => {
  if (!admitted(c))
    return c.json({ ok: false, error: "admin token required" }, 401);
  return c.json({ ok: true, rows: await snapshot(c.env.DB) });
});
app.put("/admin/shelves", async (c) => {
  if (!admitted(c))
    return c.json({ ok: false, error: "admin token required" }, 401);
  const b = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    kind?: "person" | "organization";
    endpoint?: string;
    remove?: boolean;
  };
  if (!b.name) return c.json({ ok: false, error: "name required" }, 400);
  if (b.remove) await removeShelf(c.env.DB, b.name);
  else
    await putShelf(c.env.DB, {
      name: b.name,
      kind: b.kind ?? "person",
      endpoint: b.endpoint ?? edgeEndpointFor(b.name, c.env.EDGE_URL),
    });
  return c.json({ ok: true, shelves: await listShelves(c.env.DB) });
});

export default app;
