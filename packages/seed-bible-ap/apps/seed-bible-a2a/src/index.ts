// seed-bible-a2a — `seed-bible.svc`, the serving plane (overview.md). The Seed registry: a rebuildable D1 index built
// by crawling the public shelves of Seed Bible agents through their public doors, verified release by release, and
// queried by passage. It holds no identity but its own, no reader's record, and nothing that cannot be rebuilt.
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Address } from "@agenticprimitives/types";
import { createSvcHost, SvcRunDO } from "./host";
import { crawlAll, crawlImages, refillImages } from "./registry/crawl";
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
  /** The map tiles: a URL template with {z}/{x}/{y} (and {key}); OSM when unset. */
  TILE_SOURCE?: string;
  TILE_KEY?: string;
  TILE_ATTRIBUTION?: string;
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

export async function reindex(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  only?: (s: { name: string }) => boolean
) {
  const shelves = (await shelvesOf(env)).filter((s) => !only || only(s));
  const crawls = await crawlAll(
    (u, i) => fetchImpl(u, i),
    shelves,
    env.SHELF_FOLDER ?? "seed-bible/public"
  );
  const report = [];
  for (const c of crawls) {
    const r = await applyCrawl(env.DB, c);
    // The pictures a shelf publishes: the bucket's copy re-put from the shelf where it is missing.
    const shelf = shelves.find((s) => s.name === c.shelf);
    let files: Record<string, unknown> = {};
    if (shelf && env.FILES) {
      const { images, error } = await crawlImages(
        (u, i) => fetchImpl(u, i),
        shelf
      );
      const refill = await refillImages(
        (u, i) => fetchImpl(u, i),
        env.FILES,
        shelf,
        images
      );
      files = {
        images: images.length,
        ...refill,
        ...(error ? { imagesError: error } : {}),
      };
    }
    report.push({
      shelf: c.shelf,
      owner: c.owner,
      ok: c.ok,
      ...(c.error ? { error: c.error } : {}),
      listed: c.listed,
      ...r,
      files,
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
// A PUBLISHER'S NUDGE: right after a release (or a withdrawal) the reader's workspace asks for that owner's shelves to
// be crawled now instead of at the next quarter-hour. It reads only what is already public — exactly what the cron
// reads — so it needs no grant; it is throttled per owner, and an owner the index has not seen yet re-crawls all
// registered shelves (at most once a minute).
const lastCrawl = new Map<string, number>();
app.post("/registry/crawl", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { owner?: unknown };
  const owner = String(body.owner ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(owner))
    return c.json(
      { ok: false, error: "owner (an agent address) required" },
      400
    );
  const known = await c.env.DB.prepare(
    "SELECT DISTINCT shelf FROM offerings WHERE lower(owner) = ?"
  )
    .bind(owner)
    .all<{ shelf: string }>();
  const names = new Set((known.results ?? []).map((r) => r.shelf));
  const key = names.size ? owner : "*";
  const now = Date.now();
  if (now - (lastCrawl.get(key) ?? 0) < (names.size ? 5_000 : 60_000))
    return c.json({ ok: true, throttled: true });
  lastCrawl.set(key, now);
  const shelves = await reindex(
    c.env,
    fetch,
    names.size ? (s) => names.has(s.name) : undefined
  );
  return c.json({
    ok: true,
    shelves: shelves.map((s) => ({ shelf: s.shelf, ok: s.ok })),
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

// ── Transcription: one chunk of audio (a WAV the device made) through Workers AI's speech model, read-only ────────
export const TRANSCRIBE_MODEL = "@cf/openai/whisper";
export const TRANSCRIBE_MAX_BYTES = 4_000_000;
app.post("/transcribe", async (c) => {
  if (
    !c.env.UPLOAD_TOKEN ||
    c.req.header("x-sb-upload-token") !== c.env.UPLOAD_TOKEN
  )
    return c.json({ ok: false, error: "not allowed" }, 403);
  if (!c.env.AI)
    return c.json({ ok: false, error: "transcription is not configured" }, 503);
  const type = c.req.header("content-type") ?? "";
  if (!/^audio\//.test(type))
    return c.json({ ok: false, error: "send audio bytes (audio/wav)" }, 400);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > TRANSCRIBE_MAX_BYTES)
    return c.json(
      {
        ok: false,
        error: `a chunk is 1 byte to ${TRANSCRIBE_MAX_BYTES} bytes`,
      },
      413
    );
  try {
    const out = (await c.env.AI.run(TRANSCRIBE_MODEL, {
      audio: [...bytes],
    })) as {
      text?: string;
      words?: Array<{ word: string; start: number; end: number }>;
    };
    return c.json({
      ok: true,
      model: TRANSCRIBE_MODEL,
      text: out.text ?? "",
      words: out.words ?? [],
    });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      502
    );
  }
});

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
  const cache = (globalThis as unknown as { caches?: { default: Cache } })
    .caches?.default;
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

// ── The places map: map tiles and place geometry, proxied and cached, so a page never calls a third party ─────
/**
 * The tile source is configuration: OSM's public tiles by default (light use, cached, a real User-Agent), or a keyed
 * provider for real traffic — `TILE_SOURCE` a template with `{z}/{x}/{y}` and optionally `{key}`, `TILE_KEY` the
 * secret it substitutes, `TILE_ATTRIBUTION` the credit the map shows. The key never leaves this Worker.
 */
const DEFAULT_TILE_SOURCE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_MAX_ZOOM = 12;
export function tileUrl(
  env: { TILE_SOURCE?: string; TILE_KEY?: string },
  z: number,
  x: number,
  y: number
): string {
  const template = env.TILE_SOURCE?.trim() || DEFAULT_TILE_SOURCE;
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{key}", encodeURIComponent(env.TILE_KEY ?? ""));
}
/** OSM's tile policy asks for a real User-Agent and caching; one Worker, a week in the cache, zoom capped. */
const TILE_UA =
  "seed-bible.svc/1.0 (https://seed-reader.faithnet.io; a Bible reader's places map)";
export const tileOk = (z: number, x: number, y: number) =>
  Number.isInteger(z) &&
  z >= 0 &&
  z <= TILE_MAX_ZOOM &&
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  y >= 0 &&
  x < 2 ** z &&
  y < 2 ** z;
app.get("/tiles/:z/:x/:y", async (c) => {
  const z = Number(c.req.param("z"));
  const x = Number(c.req.param("x"));
  const y = Number(c.req.param("y").replace(/\.png$/i, ""));
  if (!tileOk(z, x, y)) return c.text("not a tile", 400);
  const cache = (globalThis as unknown as { caches?: { default: Cache } })
    .caches?.default;
  const key = new Request(
    `https://tiles.seed-bible.svc/${encodeURIComponent((c.env.TILE_SOURCE ?? "osm").slice(0, 40))}/${z}/${x}/${y}.png`
  );
  const hit = await cache?.match(key);
  if (hit) return hit;
  const up = await fetch(tileUrl(c.env, z, x, y), {
    headers: { "user-agent": TILE_UA, accept: "image/png" },
  });
  if (!up.ok) return c.text(`tile source answered ${up.status}`, 502);
  const res = new Response(up.body, {
    headers: {
      "content-type": up.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=604800, immutable",
      "access-control-allow-origin": "*",
    },
  });
  if (cache) executionCtxOf(c)?.waitUntil(cache.put(key, res.clone()));
  return res;
});

/** What the map should credit, and how far it may zoom — the page asks once. */
app.get("/tiles/info", (c) =>
  c.json({
    ok: true,
    attribution: c.env.TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION,
    maxZoom: TILE_MAX_ZOOM,
    source: (c.env.TILE_SOURCE?.trim() || DEFAULT_TILE_SOURCE).replace(
      /[?&]key=\{key\}/,
      ""
    ),
  })
);

/** Where a biblical place's geometry comes from: the open geocoding data the old locations extension read. */
const PLACE_SOURCES = (name: string) => [
  `https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/geometry/${name}.geojson`,
  `https://raw.githubusercontent.com/Bored-Wizard/isreal_geojson/main/${name}.geojson`,
];
export const placeNameOk = (name: string) =>
  /^[A-Za-z][A-Za-z0-9 '_.-]{0,60}$/.test(name);
app.get("/places/:name", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  if (!placeNameOk(name))
    return c.json({ ok: false, error: "not a place name" }, 400);
  const cache = (globalThis as unknown as { caches?: { default: Cache } })
    .caches?.default;
  const key = new Request(
    `https://places.seed-bible.svc/${encodeURIComponent(name)}`
  );
  const hit = await cache?.match(key);
  if (hit) return hit;
  for (const url of PLACE_SOURCES(name)) {
    const up = await fetch(url, {
      headers: {
        "user-agent": TILE_UA,
        accept: "application/geo+json, application/json",
      },
    }).catch(() => null);
    if (!up?.ok) continue;
    const text = await up.text();
    try {
      JSON.parse(text);
    } catch {
      continue;
    }
    const res = new Response(text, {
      headers: {
        "content-type": "application/geo+json",
        "cache-control": "public, max-age=604800",
        "access-control-allow-origin": "*",
      },
    });
    if (cache) executionCtxOf(c)?.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  const miss = c.json({ ok: false, error: "no geometry for this place" }, 404);
  miss.headers.set("cache-control", "public, max-age=86400");
  if (cache) executionCtxOf(c)?.waitUntil(cache.put(key, miss.clone()));
  return miss;
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
