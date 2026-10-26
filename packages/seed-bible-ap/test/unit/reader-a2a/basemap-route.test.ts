// THE PLACES MAP'S BASE MAP comes from the publishing gateway's signed map work, relayed by this origin: a tile is asked of
// the gateway at the map's address and comes back as a vector tile; the map's details tell the page what to credit, how
// far to zoom and whether the file was found to be the signed one; a gateway that cannot answer is said plainly.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  BASE_MAP,
  baseMapRoutes,
} from "../../../apps/reader-a2a/src/routes/basemap";
import type { PublishingEnv } from "../../../apps/reader-a2a/src/clients/publishing";

const MAP = {
  "@type": "openbook:MapManifest",
  file: {
    sha256: "c2d1ff9b4c2f1bdb092690dc7ec9f95d54ed7ba2a00bb26685745f86c3a38b15",
    bytes: 153186949,
    format: "pmtiles",
    tileType: "mvt",
    check: { status: "verified", checkedAt: 1 },
  },
  bounds: [9, 22, 56, 43],
  minZoom: 0,
  maxZoom: 10,
  schema: "protomaps-basemap@4",
  attribution: "&copy; OpenStreetMap contributors",
  license: "ODbL-1.0",
  tiles: "https://publishing.faithnet.io/api/public/x/y/tiles/{z}/{x}/{y}.mvt",
  work: {
    title: "Bible lands base map",
    url: "https://publishing.faithnet.io/@demo-admin-1/bible-lands-base-map",
    version: 1,
    signatureStatus: "verified",
  },
};

function gateway(answer: (path: string) => Response) {
  const asked: string[] = [];
  const env: PublishingEnv = {
    PUBLISHING: {
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        asked.push(path);
        return answer(path);
      },
    },
  };
  const app = new Hono<{ Bindings: PublishingEnv }>().route("/", baseMapRoutes);
  return { asked, get: (path: string) => app.request(path, {}, env) };
}

describe("the base map", () => {
  it("relays a tile from the published map's address", async () => {
    const tile = new Uint8Array([0x1a, 0x02, 0x08, 0x01]);
    const g = gateway(
      () =>
        new Response(tile, {
          headers: { "content-type": "application/vnd.mapbox-vector-tile" },
        })
    );
    const res = await g.get("/api/tiles/7/76/52.mvt");
    expect(g.asked).toEqual([
      `/public/${BASE_MAP.handle}/${BASE_MAP.slug}/tiles/7/76/52.mvt`,
    ]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.mapbox-vector-tile"
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(tile);
  });

  it("passes on the gateway's refusal of a tile, and does not let it be cached", async () => {
    const g = gateway(() =>
      Response.json(
        { ok: false, error: "no tile 11/0/0 in this map" },
        { status: 400 }
      )
    );
    const res = await g.get("/api/tiles/11/0/0.mvt");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("tells the page what to credit, how far to zoom, and that the file is the signed one", async () => {
    const g = gateway(() => Response.json({ ok: true, map: MAP }));
    const res = await g.get("/api/tiles-info");
    expect(g.asked).toEqual([
      `/public/${BASE_MAP.handle}/${BASE_MAP.slug}/map`,
    ]);
    expect(await res.json()).toEqual({
      ok: true,
      format: "mvt",
      schema: "protomaps-basemap@4",
      minZoom: 0,
      maxZoom: 10,
      bounds: [9, 22, 56, 43],
      attribution: "&copy; OpenStreetMap contributors",
      license: "ODbL-1.0",
      fileVerified: true,
      sha256: MAP.file.sha256,
      work: MAP.work,
    });
  });

  it("says when the gateway holds a file that is not the signed one", async () => {
    const g = gateway(() =>
      Response.json({
        ok: true,
        map: { ...MAP, file: { ...MAP.file, check: { status: "mismatch" } } },
      })
    );
    expect(await (await g.get("/api/tiles-info")).json()).toMatchObject({
      fileVerified: false,
    });
  });

  it("says plainly when the gateway cannot answer", async () => {
    const g = gateway(() =>
      Response.json(
        { ok: false, error: "this gateway holds no map files" },
        { status: 503 }
      )
    );
    const res = await g.get("/api/tiles-info");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      ok: false,
      error: "this gateway holds no map files",
    });
  });
});
