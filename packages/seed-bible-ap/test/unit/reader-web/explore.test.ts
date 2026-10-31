// EXPLORE: the canon wheel gives every book an arc in canon order, sized by its chapters, and the arcs never overlap; the
// speaking network is laid out the same way every time and inside the picture; the churches stand as one forest under their
// planters, a church with no recorded planting on its own, each with the households it was gathered from.
import { describe, expect, it } from "vitest";
import {
  divisionOf,
  layoutNetwork,
  wheelArcs,
  type CanonBook,
} from "../../../apps/reader-web/src/extensions/story/atlas";
import {
  churchForest,
  shortName,
} from "../../../apps/reader-web/src/extensions/story/ExplorePane";

const book = (
  usfm: string,
  chapters: number,
  divisions: string[] = [],
  testament = "OT"
): CanonBook => ({
  usfm,
  osis: usfm,
  name: usfm,
  testament,
  divisions,
  genres: [],
  chapters,
  sections: 1,
});

describe("the canon wheel", () => {
  it("gives each book an arc in canon order, as long as its chapters, without overlap, round the whole circle", () => {
    const arcs = wheelArcs(
      [book("GEN", 50), book("EXO", 40), book("RUT", 4)],
      0
    );
    expect(arcs.map((a) => a.book.usfm)).toEqual(["GEN", "EXO", "RUT"]);
    const len = arcs.map((a) => a.a1 - a.a0);
    expect(len[0]! / len[2]!).toBeCloseTo(50 / 4);
    for (let i = 1; i < arcs.length; i++)
      expect(arcs[i]!.a0).toBeGreaterThanOrEqual(arcs[i - 1]!.a1);
    expect(arcs[2]!.a1 - arcs[0]!.a0).toBeCloseTo(2 * Math.PI);
  });
  it("colours a book by its Christian-canon division, whatever its Tanakh one", () => {
    expect(divisionOf(book("GEN", 50, ["law", "torah"]))).toBe("law");
    expect(
      divisionOf(book("PSA", 150, ["writings", "poetry-and-wisdom"]))
    ).toBe("poetry-and-wisdom");
    expect(divisionOf(book("XYZ", 1, [], "NT"))).toBe("general-letters");
  });
});

describe("the speaking network", () => {
  const ids = ["god", "jonah", "crew", "king"];
  const links = [
    { from: "god", to: "jonah", count: 3 },
    { from: "jonah", to: "crew", count: 2 },
    { from: "king", to: "god", count: 1 },
  ];
  it("lays a book out the same way every time, inside the picture", () => {
    const a = layoutNetwork(ids, links, 720, 520);
    const b = layoutNetwork(ids, links, 720, 520);
    expect([...a]).toEqual([...b]);
    // Far enough from the sides and the bottom that a name centred under a dot is not cut off.
    for (const p of a.values()) {
      expect(p.x).toBeGreaterThanOrEqual(90);
      expect(p.x).toBeLessThanOrEqual(630);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(480);
    }
  });
  it("keeps everyone apart", () => {
    const pos = [...layoutNetwork(ids, links, 720, 520).values()];
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        expect(
          Math.hypot(pos[i]!.x - pos[j]!.x, pos[i]!.y - pos[j]!.y)
        ).toBeGreaterThan(40);
  });
});

describe("the churches as one forest", () => {
  const ref = (id: string, label: string, kind = "community") => ({
    id,
    label,
    kind,
    path: `${kind}/${id}`,
  });
  it("stands each church under who planted it, with its households; one with no recorded planting on its own", () => {
    const root = churchForest(
      {
        churches: [
          {
            ...ref("philippi", "Church at Philippi"),
            type: "Community",
            plantedBy: [ref("paul", "Paul", "person")],
            grewOutOf: [],
            gaveRiseTo: [],
            gatheredFrom: [
              ref("lydia-house", "Lydia's household", "household"),
            ],
            attestedAt: [],
          },
          {
            ...ref("corinth", "Church at Corinth"),
            type: "Community",
            plantedBy: [ref("paul", "Paul", "person")],
            grewOutOf: [],
            gaveRiseTo: [],
            gatheredFrom: [],
            attestedAt: [],
          },
          {
            ...ref("rome", "Church at Rome"),
            type: "Community",
            plantedBy: [],
            grewOutOf: [],
            gaveRiseTo: [],
            gatheredFrom: [],
            attestedAt: [],
          },
        ],
        households: [],
      },
      "The churches"
    );
    expect(
      root.children.map((c) => [c.label, c.children.map((x) => x.label)])
    ).toEqual([
      ["Paul", ["Church at Philippi", "Church at Corinth"]],
      ["Church at Rome", []],
    ]);
    const philippi = root.children[0]!.children[0]!;
    expect(philippi.children.map((h) => [h.label, h.via])).toEqual([
      ["Lydia's household", "gatheredFrom"],
    ]);
  });
});

describe("names in the drawings", () => {
  it("can be reached by the keyboard: an SVG element that acts as a button carries the lower-case tabindex", async () => {
    const { render } = await import("preact-render-to-string");
    const { h } = await import("preact");
    const { GenerationsDiagram } =
      await import("../../../apps/reader-web/src/extensions/story/GenerationsDiagram");
    const html = render(
      h(GenerationsDiagram, {
        root: {
          id: "paul",
          label: "Paul",
          kind: "person",
          path: null,
          children: [
            {
              id: "philippi",
              label: "Church at Philippi",
              kind: "community",
              path: "community-c/philippi",
              via: "plantedBody",
              children: [],
            },
          ],
        },
        onOpen: () => {},
      })
    );
    expect(html).toMatch(/<g[^>]*role="button"[^>]*tabindex="0"/);
    expect(html).not.toMatch(/tabIndex=/);
  });
});

describe("a name under a dot", () => {
  it("drops the gloss and stays short; the whole name is in the tooltip", () => {
    expect(shortName("Lydia (seller of purple goods from Thyatira)")).toBe(
      "Lydia"
    );
    expect(shortName("Saul, later called Paul (Saulos / Paulos)")).toBe("Saul");
    expect(shortName("the kinsman with a prior right")).toBe(
      "the kinsman with…"
    );
    expect(shortName("a_wife_of_Simeon")).toBe("a wife of Simeon");
  });
});

describe("finding someone by any of their names", () => {
  it("finds Peter by Simon and Cephas, and Jacob by Israel", async () => {
    const { findNames } =
      await import("../../../apps/reader-web/src/extensions/story/ExplorePane");
    const peter = {
      label: "Peter",
      kind: "person",
      path: "person-p/peter",
      brief: "",
      aka: ["Simon", "Cephas"],
    };
    const jacob = {
      label: "Jacob",
      kind: "person",
      path: "person-i/israel",
      brief: "",
      aka: ["Israel", "Jeshurun"],
    };
    expect(findNames(peter).some((n) => n.includes("simon"))).toBe(true);
    expect(findNames(peter).some((n) => n.includes("cephas"))).toBe(true);
    expect(findNames(jacob).some((n) => n.includes("israel"))).toBe(true);
    expect(
      findNames({ label: "Ruth", kind: "person", path: "p/ruth", brief: "" })
    ).toEqual(["ruth"]);
  });
});
