// THEOGRAPHIC: a chapter's people, places and events become Discover items (only the selected verses' when some are
// selected), years read BC/AD, a record becomes a card with its relations, and a path outside the dataset is never
// fetched.
import { describe, expect, it } from "vitest";
import {
  chapterEntities,
  entityOf,
  itemsForChapter,
  readTheographic,
  yearText,
} from "../../../apps/reader-web/src/extensions/theographic/data";

const chapter = {
  chapter: {
    number: 12,
    people: [
      {
        id: "abraham_58",
        name: "Abraham",
        birthYear: -1997,
        deathYear: -1821,
        apiLink: "/api/d/theographic/people/abraham_58.json",
        verses: [1, 4, 5, 6],
      },
      {
        id: "sarai_1",
        name: "Sarai",
        apiLink: "/api/d/theographic/people/sarai_1.json",
        verses: [11],
      },
    ],
    places: [
      {
        id: "haran_527",
        name: "Haran",
        featureType: "City",
        apiLink: "/api/d/theographic/places/haran_527.json",
        verses: [4, 5],
      },
    ],
    events: [
      {
        id: "enters_71",
        name: "Abraham enters Canaan",
        startDate: "-1920",
        apiLink: "/api/d/theographic/events/enters_71.json",
        verses: [1, 2],
      },
    ],
  },
};

describe("theographic", () => {
  it("lists the chapter's people, places and events", () => {
    const items = itemsForChapter(chapterEntities(chapter), []);
    expect(items.map((i) => `${i.icon}:${i.title}`)).toEqual([
      "person:Abraham",
      "person:Sarai",
      "location_on:Haran",
      "event:Abraham enters Canaan",
    ]);
    expect(items[0]!.description).toBe("1997 BC – 1821 BC · vv. 1, 4, 5…");
    expect(items[3]!.description).toBe("1920 BC · v. 1, 2");
  });

  it("keeps only what is in the selected verses", () => {
    expect(
      itemsForChapter(chapterEntities(chapter), [11]).map((i) => i.title)
    ).toEqual(["Sarai"]);
  });

  it("reads years as readers write them", () => {
    expect(yearText(-4)).toBe("4 BC");
    expect(yearText("30")).toBe("AD 30");
    expect(yearText(undefined)).toBe("");
  });

  it("makes a card from an event record with its relations", () => {
    const e = entityOf({
      event: {
        id: "enters_71",
        name: "Abraham enters Canaan",
        startDate: "-1920",
        participants: [
          {
            id: "abraham_58",
            type: "people",
            name: "Abraham",
            apiLink: "/api/d/theographic/people/abraham_58.json",
          },
        ],
        partOf: {
          id: "sojourn_74",
          type: "events",
          name: "Sojourn",
          apiLink: "/api/d/theographic/events/sojourn_74.json",
        },
        references: [
          { book: "GEN", chapter: 12, verse: 1, endVerse: 9 },
          { nonsense: true },
        ],
      },
    });
    expect(e?.kind).toBe("event");
    expect(
      e?.relations.map((r) => `${r.label}:${r.items.map((x) => x.name)}`)
    ).toEqual(["Who:Abraham", "Part of:Sojourn"]);
    expect(e?.references).toEqual([
      { book: "GEN", chapter: 12, verse: 1, endVerse: 9 },
    ]);
    expect(entityOf({ something: {} })).toBeNull();
  });

  it("fetches only dataset paths, once", async () => {
    const asked: string[] = [];
    const store = new Map<string, unknown>();
    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, v),
    };
    const fake = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(chapter));
    }) as unknown as typeof fetch;
    expect(
      await readTheographic("/api/d/other/x.json", cache, fake)
    ).toBeNull();
    expect(
      await readTheographic("/api/d/theographic/../../secret.json", cache, fake)
    ).toBeNull();
    await readTheographic("/api/d/theographic/GEN/12.json", cache, fake);
    await readTheographic("/api/d/theographic/GEN/12.json", cache, fake);
    expect(asked).toEqual([
      "https://bible.helloao.org/api/d/theographic/GEN/12.json",
    ]);
  });
});
