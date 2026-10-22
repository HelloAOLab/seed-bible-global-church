// The Places map's data path and the readable theme link: geometry comes through the workspace (null when the
// serving plane has none); a customization is found by its title slug, its descriptor id or its work id.
import { describe, expect, it } from "vitest";
import {
  loadPlaceGeometry,
  normalizeGeometry,
} from "../../../apps/reader-web/src/extensions/locations/PlacesMapPane";
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
  it("reads a place's geometry through the workspace and says null when there is none", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      return url.endsWith("/api/places/Bethlehem")
        ? new Response(
            JSON.stringify({
              type: "Feature",
              geometry: { type: "Point", coordinates: [35.2, 31.7] },
            }),
            { status: 200 }
          )
        : new Response("nope", { status: 404 });
    }) as typeof fetch;
    const geo = await loadPlaceGeometry(
      { place: "Bethlehem", geojson: "Bethlehem" },
      fetchImpl
    );
    // OpenBible's export: strings in [lat, lon]; the map gets numbers in [lon, lat].
    expect(geo).toMatchObject({
      type: "Feature",
      geometry: { type: "Point", coordinates: [35.206, 31.704] },
    });
    expect(
      normalizeGeometry({
        type: "Polygon",
        coordinates: [
          [
            ["1", "2"],
            [3, 4],
          ],
        ],
      })
    ).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [2, 1],
          [3, 4],
        ],
      ],
    });
    expect(
      await loadPlaceGeometry(
        { place: "Nowhere", geojson: "Nowhere" },
        fetchImpl
      )
    ).toBeNull();
    expect(seen[0]).toMatch(/\/api\/places\/Bethlehem$/);
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
