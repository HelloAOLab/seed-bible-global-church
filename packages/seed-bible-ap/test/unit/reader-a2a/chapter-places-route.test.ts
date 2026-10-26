// THE PLACES OF A CHAPTER: the workspace asks the scripture publisher and the publishing gateway for the chapter at once,
// over the publisher contract; each place keeps its verses in this chapter, its identification (a disputed site stays
// on the map with its doubt) and its publisher; a publisher that fails is named and the other still answers.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { chapterPlacesRoutes } from "../../../apps/reader-a2a/src/routes/chapter-places";

const feature = (
  id: string,
  name: string,
  verses: string[],
  identification: Record<string, unknown> | undefined,
  publisher: Record<string, unknown>
) => ({
  item: { kind: "feature", id, name, site: name },
  references: verses.map((to) => ({
    to,
    relation: "locates",
    confidence: 1,
    method: "scholar-identification",
  })),
  location: {
    geometry: { type: "Point", coordinates: [35.5, 31.8] },
    ...(identification ? { identification } : {}),
  },
  publisher,
  release: {
    work: "scripture-resolver.svc/bible-places",
    signatureStatus: "unsigned",
  },
  license: "CC-BY-4.0",
  attribution: "OpenBible.info (CC BY 4.0)",
});

const SCRIPTURE_ITEMS = [
  feature(
    "openbible:a6e060d",
    "Bethany (Beyond the Jordan)",
    ["John.1.28"],
    {
      confidence: 0.32,
      method: "scholar-identification",
      basis: "Al Maghtas 320",
    },
    { name: "scripture-resolver.svc" }
  ),
  feature(
    "openbible:a15257a",
    "Jerusalem",
    ["John.1.19"],
    { confidence: 1, method: "scholar-identification" },
    { name: "scripture-resolver.svc" }
  ),
];
const GATEWAY_ITEMS = [
  feature(
    "demo/jordan-sites#baptism-site",
    "Baptism site (a ministry's map)",
    ["John.1.28", "John.1.31"],
    undefined,
    { handle: "demo" }
  ),
];

function app(opts: { gatewayDown?: boolean } = {}) {
  const asked: Array<{ to: string; args: unknown }> = [];
  const env = {
    SCRIPTURE_ASK_TIMEOUT_MS: 200,
    SCRIPTURE: {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const { skill, args } = body.params.message.parts[0].data;
        asked.push({ to: `scripture ${skill}`, args });
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            message: {
              messageId: "m",
              role: "ROLE_AGENT",
              parts: [{ data: { span: "John.1", items: SCRIPTURE_ITEMS } }],
            },
          },
        });
      },
    },
    PUBLISHING: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        asked.push({
          to: `publishing ${new URL(String(input)).pathname}`,
          args: JSON.parse(String(init?.body)),
        });
        if (opts.gatewayDown) return new Response("down", { status: 503 });
        return Response.json({
          ok: true,
          span: "John.1",
          items: GATEWAY_ITEMS,
        });
      },
    },
  };
  const h = new Hono().route("/", chapterPlacesRoutes);
  return { asked, get: (path: string) => h.request(path, {}, env) };
}

describe("the places of a chapter", () => {
  it("asks both publishers for the chapter and merges what they hold, in verse order", async () => {
    const a = app();
    const res = await a.get("/api/places/chapter/JHN.1");
    const body = (await res.json()) as {
      chapter: string;
      places: Array<{
        name: string;
        verses: number[];
        source: string;
        identification: { confidence: number; basis?: string };
      }>;
      sources: unknown[];
    };
    expect(a.asked).toEqual([
      {
        to: "scripture publisher.at-verse",
        args: { span: "John.1", relation: "locates", kind: "feature" },
      },
      {
        to: "publishing /publisher/at-verse",
        args: { span: "John.1", relation: "locates", kind: "feature" },
      },
    ]);
    expect(body.chapter).toBe("John.1");
    expect(
      body.places.map((p) => `${p.name} ${p.verses.join(",")} ${p.source}`)
    ).toEqual([
      "Jerusalem 19 scripture",
      "Bethany (Beyond the Jordan) 28 scripture",
      "Baptism site (a ministry's map) 28,31 publishing",
    ]);
    expect(body.places[1]!.identification).toEqual({
      confidence: 0.32,
      method: "scholar-identification",
      basis: "Al Maghtas 320",
    });
    expect(body.sources).toEqual([
      { source: "scripture", ok: true, count: 2 },
      { source: "publishing", ok: true, count: 1 },
    ]);
  });

  it("still draws what one publisher holds when the other fails, names the failure, and is not cached", async () => {
    const res = await app({ gatewayDown: true }).get(
      "/api/places/chapter/John.1"
    );
    const body = (await res.json()) as {
      places: unknown[];
      sources: Array<{ source: string; ok: boolean; error?: string }>;
    };
    expect(body.places).toHaveLength(2);
    expect(body.sources[1]).toMatchObject({
      source: "publishing",
      ok: false,
      error: expect.stringMatching(/503/),
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses what is not a chapter", async () => {
    expect((await app().get("/api/places/chapter/JHN.1.28")).status).toBe(400);
    expect((await app().get("/api/places/chapter/nowhere")).status).toBe(400);
  });
});
