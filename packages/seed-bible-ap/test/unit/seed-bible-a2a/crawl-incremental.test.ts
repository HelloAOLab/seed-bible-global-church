// A CRAWL READS ONLY WHAT CHANGED. The index already holds most of a shelf; a document listed at the same version under
// the same signed release is the same document (the release signs its content), so it is carried over without a read —
// which is what lets a publisher's nudge re-crawl a full shelf in moments. A new version is read; an empty index (the
// rebuild) reads everything.
import { describe, expect, it } from "vitest";
import {
  crawlShelf,
  type IndexedOffering,
} from "../../../apps/seed-bible-a2a/src/registry/crawl";
import { conceptIri, SEED_CONTEXT } from "../../../lib/seed-schema";

const OWNER = "0x" + "22".repeat(20);
const shelf = {
  name: "ruth.me",
  endpoint: "https://edge.test/api/a2a/ruth.me",
  kind: "person" as const,
};

const descriptor = (slug: string) => ({
  "@context": SEED_CONTEXT,
  "@id": `urn:seed:offering:${OWNER}:note:${slug}`,
  "@type": "seed:Offering",
  label: slug,
  publishedBy: OWNER,
  offeredForPassage: "JHN.3",
  offeringKind: conceptIri("offeringkind", "note"),
  visibility: conceptIri("visibility", "world"),
});

function shelfFetch(version: number) {
  const reads: string[] = [];
  const f = (async (_u: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      params?: {
        message?: { parts?: Array<{ data?: Record<string, unknown> }> };
      };
    };
    const data = body.params?.message?.parts?.[0]?.data ?? {};
    const answer = (d: unknown) =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { parts: [{ kind: "data", data: d }] },
      });
    if (data.skill === "library.public.list")
      return answer({
        owner: OWNER,
        count: 2,
        files: ["a", "b"].map((slug) => ({
          id: slug,
          name: `${slug}.jsonld`,
          folder: "seed-bible/public/note",
          version: slug === "b" ? version : 1,
          release: {
            releaseId: `rel-${slug}-${slug === "b" ? version : 1}`,
            signed: true,
          },
        })),
      });
    if (data.skill === "library.public.read") {
      reads.push(String(data.id));
      return answer({
        read: true,
        owner: OWNER,
        text: JSON.stringify(descriptor(String(data.id))),
      });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, reads };
}

describe("an incremental crawl", () => {
  it("reads every document when the index holds none", async () => {
    const { f, reads } = shelfFetch(1);
    const c = await crawlShelf(f, shelf, "seed-bible/public");
    expect(reads.sort()).toEqual(["a", "b"]);
    expect(c.offerings.map((o) => o.entryId).sort()).toEqual(["a", "b"]);
  });

  it("carries over an unchanged release and reads only the new version", async () => {
    const first = await crawlShelf(shelfFetch(1).f, shelf, "seed-bible/public");
    const known = new Map<string, IndexedOffering>(
      first.offerings.map((o) => [o.entryId, o])
    );
    const { f, reads } = shelfFetch(2);
    const c = await crawlShelf(f, shelf, "seed-bible/public", known);
    expect(reads).toEqual(["b"]);
    expect(c.offerings.map((o) => `${o.entryId}@${o.version}`).sort()).toEqual([
      "a@1",
      "b@2",
    ]);
  });
});
