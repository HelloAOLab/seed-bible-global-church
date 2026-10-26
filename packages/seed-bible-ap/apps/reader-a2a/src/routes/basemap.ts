// THE PLACES MAP'S BASE MAP — the Bible lands map published on the publishing gateway: a signed map work whose manifest
// names one vector tile file by its SHA-256, which the gateway serves only after hashing it. This origin relays it, so the
// page talks to the reader's agent only.
import { Hono } from "hono";
import { publishingFetch, type PublishingEnv } from "../clients/publishing";

export const BASE_MAP = {
  handle: "demo-admin-1",
  slug: "bible-lands-base-map",
} as const;

const mapPath = (env: PublishingEnv) =>
  `/public/${env.MAP_HANDLE ?? BASE_MAP.handle}/${env.MAP_SLUG ?? BASE_MAP.slug}`;

/** What the gateway's `/map` answers — the signed manifest, the file check and the work. */
export interface PublishedMap {
  file: { sha256: string; check: { status: string } };
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  schema: string;
  attribution: string;
  license: string;
  work: {
    title: string;
    url: string;
    version: number;
    signatureStatus: string;
  };
}

/** What the page needs to draw the map and credit it. */
export function tilesInfo(map: PublishedMap) {
  return {
    ok: true,
    format: "mvt" as const,
    schema: map.schema,
    minZoom: map.minZoom,
    maxZoom: map.maxZoom,
    bounds: map.bounds,
    attribution: map.attribution,
    license: map.license,
    fileVerified: map.file.check.status === "verified",
    sha256: map.file.sha256,
    work: {
      title: map.work.title,
      url: map.work.url,
      version: map.work.version,
      signatureStatus: map.work.signatureStatus,
    },
  };
}

export const baseMapRoutes = new Hono<{ Bindings: PublishingEnv }>();

baseMapRoutes.get("/api/tiles/:z/:x/:y", async (c) => {
  const y = c.req.param("y").replace(/\.(mvt|pbf)$/i, "");
  const res = await publishingFetch(
    c.env,
    `${mapPath(c.env)}/tiles/${c.req.param("z")}/${c.req.param("x")}/${y}.mvt`
  );
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type":
        res.headers.get("content-type") ?? "application/vnd.mapbox-vector-tile",
      "cache-control": res.ok ? "public, max-age=86400" : "no-store",
    },
  });
});

baseMapRoutes.get("/api/tiles-info", async (c) => {
  const res = await publishingFetch(c.env, `${mapPath(c.env)}/map`);
  const body = (await res.json().catch(() => null)) as {
    map?: PublishedMap;
    error?: string;
  } | null;
  if (!res.ok || !body?.map)
    return c.json(
      {
        ok: false,
        error: body?.error ?? `the publishing gateway answered ${res.status}`,
      },
      502
    );
  return c.json(tilesInfo(body.map), 200, {
    "cache-control": "public, max-age=3600",
  });
});
