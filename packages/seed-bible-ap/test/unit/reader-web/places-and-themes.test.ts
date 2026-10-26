// The Places map's data path and the readable theme link: a chapter's places come from the publishers through the
// workspace, with how sure each site is (an uncertain site is marked, never dropped); a customization is found by its
// title slug, its descriptor id or its work id.
import { describe, expect, it } from "vitest";
import {
  loadChapterPlaces,
  siteUncertain,
} from "../../../apps/reader-web/src/extensions/locations";
import {
  createCustomizations,
  slugify,
} from "../../../apps/reader-web/src/state/chrome/customizations";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createPublishing } from "../../../apps/reader-web/src/state/social/publishing";
import type { Customization } from "@seed/seed-schema";

const RUTH = { agent: "0x" + "11".repeat(20), name: "Ruth", wire: true };

describe("the places map", () => {
  const bethany = {
    id: "openbible:a6e060d",
    name: "Bethany (Beyond the Jordan)",
    site: "Al Maghtas",
    geometry: { type: "Point", coordinates: [35.550301, 31.837109] },
    verses: [28],
    identification: {
      confidence: 0.32,
      method: "scholar-identification",
      basis: "OpenBible.info scores Al Maghtas 320",
    },
    source: "scripture",
    publisher: "scripture-resolver.svc",
    work: "scripture-resolver.svc/bible-places",
    license: "CC-BY-4.0",
    attribution: "OpenBible.info (CC BY 4.0)",
  };

  it("reads a chapter's places through the workspace, once per chapter, and marks an uncertain site", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      return Response.json({
        ok: true,
        chapter: "John.1",
        places: [bethany],
        sources: [],
      });
    }) as typeof fetch;
    const first = await loadChapterPlaces("JHN.1", fetchImpl);
    await loadChapterPlaces("JHN.1", fetchImpl);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/\/api\/places\/chapter\/JHN\.1$/);
    expect(first.map((p) => p.name)).toEqual(["Bethany (Beyond the Jordan)"]);
    expect(siteUncertain(first[0]!)).toBe(true);
    expect(
      siteUncertain({
        identification: { confidence: 1, method: "scholar-identification" },
      })
    ).toBe(false);
  });

  it("answers nothing when the workspace cannot, and asks again next time", async () => {
    let calls = 0;
    const down = (async () => {
      calls++;
      return new Response("down", { status: 502 });
    }) as typeof fetch;
    expect(await loadChapterPlaces("GEN.12", down)).toEqual([]);
    expect(await loadChapterPlaces("GEN.12", down)).toEqual([]);
    expect(calls).toBe(2);
  });
});

describe("a church theme by link", () => {
  it("slugs a title, and finds a published customization by slug, descriptor id or work id", async () => {
    expect(slugify("Grace Church · Blue (2026)")).toBe(
      "grace-church-blue-2026"
    );
    const backend = createDevBackend(RUTH);
    const stores = memoryStores();
    const work: Customization = {
      "@id": "urn:seed:customization:abc123",
      "@type": "seed:Customization",
      publishedBy: RUTH.agent,
      label: "Grace Church Blue",
      hasVariant: [
        {
          "@type": "seed:ThemeVariant",
          "@id": "urn:seed:variant:light",
          label: "Light",
          scheme: "light",
          variables: { background: "#fff" },
        },
      ],
    };
    await createPublishing(backend, stores).publishWork(work);
    const c = createCustomizations(backend, stores, () => RUTH);
    await c.refresh();
    expect(c.available.value).toHaveLength(1);
    const entry = c.available.value[0]!;
    expect(c.refOf(entry)).toBe("grace-church-blue");
    expect(c.findByRef("grace-church-blue")?.customization.label).toBe(
      "Grace Church Blue"
    );
    expect(c.findByRef("Grace Church Blue")?.customization.label).toBe(
      "Grace Church Blue"
    );
    expect(c.findByRef(entry.offering.descriptorId)).toBe(entry);
    expect(c.findByRef("urn:seed:customization:abc123")).toBe(entry);
    expect(c.findByRef("nothing-like-it")).toBeNull();
  });
});
