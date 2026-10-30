// THE STORY — a section heading's verses, the scenes they overlap, and the views a card opens: which verses sit under
// a heading, which scenes of the story layer a section touches, what the section gathers once, the oikos rings and the
// generations tree's layout; the dataset read through the reader's /bible/ route, kept on the device, and a chapter the
// story layer lacks answered empty. Plus the host's heading tools, added and taken away with their extension.
import { describe, expect, it } from "vitest";
import { sectionUnder } from "../../../apps/reader-web/src/components/reader/chapterContent";
import {
  gatherSection,
  placeOf,
  readChapterScenes,
  readEntity,
  scenesOfSection,
  spanLabel,
  type Scene,
} from "../../../apps/reader-web/src/extensions/story/data";
import { oikosRings } from "../../../apps/reader-web/src/extensions/story/OikosDiagram";
import { layoutGenerations } from "../../../apps/reader-web/src/extensions/story/GenerationsDiagram";
import { createExtensionHost } from "../../../apps/reader-web/src/extensions/host";
import story from "../../../apps/reader-web/src/extensions/story";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import type { ReaderState } from "../../../apps/reader-web/src/state";

const scene = (
  id: string,
  from: string,
  to: string,
  over: Partial<Scene> = {}
): Scene => ({
  id,
  order: Number(id.replace(/\D/g, "")),
  label: id,
  from,
  to,
  setting: null,
  places: [],
  cast: [],
  events: [],
  narrativeModes: {},
  communication: [],
  communities: [],
  previous: null,
  next: null,
  ...over,
});

describe("the verses under a heading", () => {
  const entries = [
    { type: "heading", content: ["The Creation"] },
    { type: "verse", number: 1, content: [] },
    { type: "line_break" },
    { type: "verse", number: 2, content: [] },
    { type: "heading", content: ["The First Day"] },
    { type: "verse", number: 3, content: [] },
    { type: "verse", number: 5, content: [] },
    { type: "heading", content: ["A heading with nothing under it"] },
  ];
  it("run from the first verse after it to the last before the next heading", () => {
    expect(sectionUnder(entries, 0)).toEqual({ start: 1, end: 2 });
    expect(sectionUnder(entries, 4)).toEqual({ start: 3, end: 5 });
  });
  it("are none for a heading with no verse after it", () => {
    expect(sectionUnder(entries, 7)).toBeNull();
  });
});

describe("the scenes of a section", () => {
  const scenes = [
    scene("s1", "Gen.1.1", "Gen.1.2"),
    scene("s2", "Gen.1.3", "Gen.1.5"),
    scene("s3", "Gen.1.6", "Gen.1.8"),
    scene("s9", "Gen.1.31", "Gen.2.3"),
  ];
  it("are those its verses overlap, in story order", () => {
    expect(scenesOfSection(scenes, 1, 3, 5).map((s) => s.id)).toEqual(["s2"]);
    expect(scenesOfSection(scenes, 1, 2, 6).map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });
  it("include a scene that runs on into the next chapter, seen from either chapter", () => {
    expect(scenesOfSection(scenes, 1, 31, 31).map((s) => s.id)).toEqual(["s9"]);
    expect(scenesOfSection(scenes, 2, 1, 3).map((s) => s.id)).toEqual(["s9"]);
  });
  it("are none where the story layer has nothing", () => {
    expect(scenesOfSection([], 1, 1, 5)).toEqual([]);
  });
  it("gather each person, place and community once across scenes", () => {
    const god = { id: "skb:god", label: "God", kind: "divine", path: null };
    const philippi = {
      id: "skb:philippi",
      label: "Philippi",
      kind: "place",
      path: "place-p/x",
    };
    const g = gatherSection([
      scene("s1", "Acts.16.12", "Acts.16.12", {
        cast: [god],
        setting: philippi,
      }),
      scene("s2", "Acts.16.13", "Acts.16.13", {
        cast: [god],
        setting: philippi,
        places: [philippi],
      }),
    ]);
    expect(g.cast.map((c) => c.label)).toEqual(["God"]);
    expect(g.places.map((p) => p.label)).toEqual(["Philippi"]);
  });
});

describe("a verse's place in the reader", () => {
  it("reads OSIS as the reader's USFM book, chapter and verse", () => {
    expect(placeOf("Acts.16.13")).toEqual({
      book: "ACT",
      chapter: 16,
      verse: 13,
    });
    expect(placeOf("1Sam.3.10")).toEqual({
      book: "1SA",
      chapter: 3,
      verse: 10,
    });
    expect(placeOf("Nope.1.1")).toBeNull();
  });
  it("says a span shortly, across a chapter break too", () => {
    expect(spanLabel("Gen.1.3", "Gen.1.5")).toBe("1:3–5");
    expect(spanLabel("Gen.1.3", "Gen.1.3")).toBe("1:3");
    expect(spanLabel("Gen.1.31", "Gen.2.3")).toBe("1:31–2:3");
  });
});

describe("a person's oikos", () => {
  const ref = (n: string, kind = "person") => ({
    id: n,
    label: n,
    kind,
    path: null,
  });
  const none = {
    parents: [],
    partners: [],
    children: [],
    siblings: [],
    companions: [],
    discipled: [],
    discipledBy: [],
    tribe: [],
    planted: [],
  };
  it("puts the household nearest, then who they walked with, then their bodies; empty rings are left out", () => {
    const rings = oikosRings({
      ...none,
      parents: [ref("Jesse")],
      discipled: [ref("Timothy")],
      planted: [ref("Church at Philippi", "community")],
    });
    expect(rings.map((r) => [r.key, r.shown.map((m) => m.label)])).toEqual([
      ["household", ["Jesse"]],
      ["walked-with", ["Timothy"]],
      ["bodies", ["Church at Philippi"]],
    ]);
    expect(oikosRings(none)).toEqual([]);
  });
  it("shows one person once in a ring though they are companion and disciple both, and counts beyond twelve", () => {
    const many = Array.from({ length: 15 }, (_, i) => ref(`p${i}`));
    const rings = oikosRings({
      ...none,
      companions: [ref("Silas"), ...many],
      discipled: [ref("Silas")],
    });
    expect(rings[0]!.shown.filter((m) => m.label === "Silas")).toHaveLength(1);
    expect(rings[0]!.shown).toHaveLength(12);
    expect(rings[0]!.more).toBe(4);
  });
});

describe("the generations tree", () => {
  it("gives each generation a column and sets a parent level with the middle of its children", () => {
    const leaf = (id: string) => ({
      id,
      label: id,
      kind: "community",
      path: null,
      children: [],
    });
    const placed = layoutGenerations({
      id: "paul",
      label: "Paul",
      kind: "person",
      path: null,
      children: [
        { ...leaf("Philippi"), via: "plantedBody" },
        {
          id: "epaphras",
          label: "Epaphras",
          kind: "person",
          path: null,
          via: "discipled",
          children: [{ ...leaf("Colossae"), via: "plantedBody" }],
        },
      ],
    });
    const at = (id: string) => placed.find((p) => p.node.id === id)!;
    expect([
      at("paul").depth,
      at("Philippi").depth,
      at("epaphras").depth,
      at("Colossae").depth,
    ]).toEqual([0, 1, 1, 2]);
    expect(at("Colossae").x).toBeGreaterThan(at("epaphras").x);
    expect(at("paul").y).toBe((at("Philippi").y + at("Colossae").y) / 2);
  });
});

describe("the story dataset", () => {
  const cache = () => {
    const m = new Map<string, unknown>();
    return {
      m,
      get: async (k: string) => m.get(k),
      set: async (k: string, v: unknown) => void m.set(k, v),
    };
  };
  it("reads a chapter's scenes under the /bible/ route and keeps them on the device", async () => {
    const asked: string[] = [];
    const c = cache();
    const fetchImpl = (async (url: string) => {
      asked.push(url);
      return new Response(
        JSON.stringify({ scenes: [scene("s2", "Gen.1.3", "Gen.1.5")] })
      );
    }) as unknown as typeof fetch;
    expect(
      (await readChapterScenes("GEN", 1, c, fetchImpl)).map((s) => s.id)
    ).toEqual(["s2"]);
    expect(asked[0]).toMatch(/\/api\/d\/story\/GEN\/1\.json$/);
    await readChapterScenes("GEN", 1, c, fetchImpl);
    expect(asked).toHaveLength(1);
  });
  it("answers a chapter the story layer lacks as no scenes, and keeps nothing", async () => {
    const c = cache();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "story GEN/99 is not held" }), {
        status: 404,
      })) as unknown as typeof fetch;
    expect(await readChapterScenes("GEN", 99, c, fetchImpl)).toEqual([]);
    expect(c.m.size).toBe(0);
  });
  it("refuses a card path that climbs out of the dataset, without asking", async () => {
    let asked = false;
    const fetchImpl = (async () => (
      (asked = true),
      new Response("{}")
    )) as unknown as typeof fetch;
    expect(await readEntity("../../t/BSB/meta", cache(), fetchImpl)).toBeNull();
    expect(asked).toBe(false);
  });
});

describe("the story's heading tools", () => {
  it("appear with the extension and go with it", async () => {
    const host = createExtensionHost(memoryStores());
    host.register(story);
    await host.bind({
      ui: { pane: { value: "none" } },
    } as unknown as ReaderState);
    expect(host.headingTools.value.map((t) => t.label)).toEqual([
      "Scene",
      "Cast",
      "Setting",
      "Communication",
      "Events",
      "Communities",
    ]);
    await host.setEnabled("story", false);
    expect(host.headingTools.value).toEqual([]);
  });
});
