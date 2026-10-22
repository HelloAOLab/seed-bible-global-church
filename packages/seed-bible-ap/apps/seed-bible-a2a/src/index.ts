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
  queryByKind,
  queryRecent,
  type OfferingRow,
  removeShelf,
  snapshot,
  wipe,
} from "./registry/store";
import { edgeEndpointFor } from "../../../lib/a2a-client";
import { isOsisRef, chapterOf } from "../../../lib/seed-protocol";
import { fetchPreview } from "./preview";
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
  /** Public file bytes (hero images, photos). The vault holds the catalog; these are re-puttable (ADR-0004). */
  FILES?: R2Bucket;
  /** What a workspace presents to put a file or ask the companion — a shared secret with reader-a2a, not a grant. */
  UPLOAD_TOKEN?: string;
  /** Workers AI: the study companion's model. */
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
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
const rowView = (r: OfferingRow) => ({
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
});

app.get("/registry/offerings", async (c) => {
  const passage = c.req.query("passage") ?? "";
  const kindOnly = c.req.query("kind");
  if (!passage && kindOnly) {
    const rows = await queryByKind(c.env.DB, kindOnly);
    return c.json({
      ok: true,
      kind: kindOnly,
      count: rows.length,
      offerings: rows.map(rowView),
    });
  }
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
    offerings: rows.map(rowView),
  });
});
app.get("/registry/recent", async (c) => {
  const owners = (c.req.query("owners") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const rows = await queryRecent(
    c.env.DB,
    owners,
    Number(c.req.query("max") ?? 50)
  );
  return c.json({ ok: true, count: rows.length, offerings: rows.map(rowView) });
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
// ── Files: a workspace puts bytes under its reader's address; anyone reads them ───────────────────────────
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const fileKeyOk = (owner: string, name: string) =>
  /^0x[0-9a-f]{40}$/.test(owner) && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(name);

app.put("/files/:owner/:name", async (c) => {
  if (!c.env.FILES)
    return c.json({ ok: false, error: "files are not configured" }, 503);
  if (
    !c.env.UPLOAD_TOKEN ||
    c.req.header("x-sb-upload-token") !== c.env.UPLOAD_TOKEN
  )
    return c.json({ ok: false, error: "not allowed" }, 403);
  const owner = c.req.param("owner").toLowerCase();
  const name = c.req.param("name").toLowerCase();
  if (!fileKeyOk(owner, name))
    return c.json(
      {
        ok: false,
        error: "a file is <sha256>.<ext> under its owner's address",
      },
      400
    );
  const contentType =
    c.req.header("content-type") ?? "application/octet-stream";
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES)
    return c.json(
      { ok: false, error: `a file is 1 byte to ${MAX_FILE_BYTES} bytes` },
      413
    );
  const key = `${owner}/${name}`;
  await c.env.FILES.put(key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return c.json({
    ok: true,
    key,
    url: `${publicOrigin(c)}/files/${key}`,
    size: bytes.byteLength,
    contentType,
  });
});

app.get("/files/:owner/:name", async (c) => {
  if (!c.env.FILES) return c.text("files are not configured", 503);
  const key = `${c.req.param("owner").toLowerCase()}/${c.req.param("name").toLowerCase()}`;
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.text("not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  return new Response(obj.body, { headers });
});

// ── The study companion: a question about a chapter, answered by Workers AI and streamed back ─────────────────
export const COMPANION_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
export const COMPANION_WHO = `seed-bible.svc · ${COMPANION_MODEL.replace("@cf/", "")}`;
// Headers are ASCII; the SSE `who` event carries the full name.
const COMPANION_WHO_HEADER = COMPANION_WHO.replace(" · ", " / ");
const COMPANION_SYSTEM =
  "You are a study companion inside a Bible reader. The reader has a chapter open; its text is given. Answer the reader's question about that passage: literary context, meaning of words, what to notice, connections within Scripture. Be concise (under 200 words), plain, and honest about uncertainty; cite verses by number. Do not invent quotations. If the question is not about the passage, say so briefly and offer to help with the passage.";

app.post("/companion", async (c) => {
  if (
    !c.env.UPLOAD_TOKEN ||
    c.req.header("x-sb-upload-token") !== c.env.UPLOAD_TOKEN
  )
    return c.json({ ok: false, error: "not allowed" }, 403);
  if (!c.env.AI)
    return c.json({ ok: false, error: "the companion is not configured" }, 503);
  const b = (await c.req.json().catch(() => ({}))) as {
    passage?: string;
    text?: string;
    question?: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  };
  const question = String(b.question ?? "")
    .trim()
    .slice(0, 2000);
  if (!question) return c.json({ ok: false, error: "question required" }, 400);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: COMPANION_SYSTEM },
    {
      role: "user",
      content: `The chapter on screen: ${String(b.passage ?? "")}\n\n${String(b.text ?? "").slice(0, 12_000)}`,
    },
    {
      role: "assistant",
      content: "I have the passage. What would you like to know?",
    },
    ...(Array.isArray(b.history)
      ? b.history.slice(-6).map((h) => ({
          role: h.role,
          content: String(h.text).slice(0, 2000),
        }))
      : []),
    { role: "user", content: question },
  ];
  const stream = (await c.env.AI.run(COMPANION_MODEL, {
    messages,
    stream: true,
    max_tokens: 600,
  })) as ReadableStream<Uint8Array>;
  const head = new TextEncoder().encode(
    `event: who\ndata: ${COMPANION_WHO}\n\n`
  );
  const out = new ReadableStream<Uint8Array>({
    async start(ctl) {
      ctl.enqueue(head);
      const r = stream.getReader();
      for (;;) {
        const { value, done } = await r.read();
        if (done) break;
        if (value) ctl.enqueue(value);
      }
      ctl.close();
    },
  });
  return new Response(out, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-sb-who": COMPANION_WHO_HEADER,
    },
  });
});

// ── Link previews: the page's head, read here with a cap, cached at the edge for a day ───────────────────────
app.get("/preview", async (c) => {
  const url = c.req.query("url") ?? "";
  if (!/^https?:\/\//.test(url))
    return c.json({ ok: false, error: "url must be http(s)" }, 400);
  const cache = (globalThis as { caches?: { default: Cache } }).caches?.default;
  const cacheKey = new Request(
    `https://preview.seed-bible.svc/?u=${encodeURIComponent(url)}`
  );
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;
  const preview = await fetchPreview(url);
  const res = c.json({ ok: true, ...preview });
  res.headers.set("cache-control", "public, max-age=86400");
  if (cache) executionCtxOf(c)?.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
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
