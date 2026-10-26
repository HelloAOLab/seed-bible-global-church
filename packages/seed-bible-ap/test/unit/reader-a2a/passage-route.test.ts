// ONE ANSWER FOR A PASSAGE: `/api/passage/<locus>` gathers the scripture agent's datasets and writings, the registry's
// publications and the signed-in reader's own marks, each anchored by canonical locus id; a verse narrows every source to
// what touches it; a failing source is reported and the rest still answer. Mocked at the boundaries only: the scripture
// agent's A2A replies and the registry's HTTP replies.
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  passageRoutes,
  type PersonMarks,
} from "../../../apps/reader-a2a/src/routes/passage";
import { parseLocus } from "../../../lib/locus";
import type { BibleEnv } from "../../../apps/reader-a2a/src/routes/bible";
import type { PlatformEnv } from "../../../apps/reader-a2a/src/clients/platform";

const JOHN_3 = {
  "read-dataset:open-cross-ref": {
    chapter: {
      content: [
        {
          verse: 3,
          references: [{ book: "JHN", chapter: 1, verse: 13, score: 50 }],
        },
        {
          verse: 16,
          references: [
            { book: "ROM", chapter: 5, verse: 8, score: 935 },
            { book: "1JN", chapter: 4, verse: 9, endVerse: 10, score: 663 },
          ],
        },
      ],
    },
  },
  "read-dataset:theographic": {
    chapter: {
      people: [{ id: "nicodemus_2204", name: "Nicodemus", verses: [1, 4, 9] }],
      places: [
        { id: "judea_657", name: "Judea", verses: [22], latitude: 31.7 },
      ],
      events: [
        {
          id: "jesus-and-nicodemus_274",
          name: "Jesus and Nicodemus",
          verses: [1, 2, 16, 21],
        },
      ],
    },
  },
  "passage-writings": {
    writings: {
      witnesses: { ofBook: [{ id: "p52", title: "Rylands Papyrus P52" }] },
      period: [],
      later: [
        {
          id: "epistula",
          title: "Epistle of the Apostles",
          scope: "book",
          verses: null,
          why: "uses John",
        },
      ],
      commentary: [
        { id: "chrys-3-5", title: "Chrysostom on John 3:5", verses: [5] },
      ],
    },
  },
} as Record<string, unknown>;

function env(
  opts: { scriptureDown?: boolean; offerings?: unknown[] } = {}
): BibleEnv & PlatformEnv {
  return {
    SCRIPTURE_ASK_TIMEOUT_MS: 200,
    SCRIPTURE: {
      fetch: async (_input, init) => {
        if (opts.scriptureDown) throw new Error("connection refused");
        const body = JSON.parse(String(init?.body));
        const { skill, args } = body.params.message.parts[0].data;
        const key =
          skill === "read-dataset" ? `${skill}:${args.dataset}` : skill;
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            message: {
              messageId: "m",
              role: "ROLE_AGENT",
              parts: [{ data: JOHN_3[key] }],
            },
          },
        });
      },
    },
    PLATFORM: {
      fetch: async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/registry/offerings?passage=JHN.3");
        return Response.json({
          ok: true,
          offerings: opts.offerings ?? [
            {
              owner: "0xabc",
              shelf: "ruth",
              entryId: "e1",
              passage: "JHN.3.16",
              kind: "note",
              title: "For God so loved",
            },
            {
              owner: "0xabc",
              shelf: "ruth",
              entryId: "e2",
              passage: "JHN.3.1-JHN.3.8",
              kind: "study",
              title: "Born again",
            },
          ],
        });
      },
    },
  } as BibleEnv & PlatformEnv;
}

const app = (e: BibleEnv & PlatformEnv, person: PersonMarks | null = null) => {
  const a = new Hono<{ Bindings: BibleEnv & PlatformEnv }>();
  a.route(
    "/",
    passageRoutes(async () => person)
  );
  return {
    get: (ref: string) =>
      a.request(`/api/passage/${encodeURIComponent(ref)}`, {}, e),
  };
};

interface Answer {
  ok: boolean;
  locus: { id: string; alias: string; ref: string };
  items: Array<{
    source: string;
    kind: string;
    title: string;
    locus: { id: string; alias: string };
  }>;
  sources: Record<string, { ok: boolean; count: number; error?: string }>;
}

describe("/api/passage/<locus>", () => {
  it("answers a verse with what touches it, from every source, keyed by canonical id", async () => {
    const res = await app(env()).get("John 3:16");
    expect(res.status).toBe(200);
    const out = (await res.json()) as Answer;
    expect(out.locus).toMatchObject({
      id: parseLocus("John.3.16")!.id,
      alias: "John.3.16",
      ref: "JHN.3.16",
    });
    const titles = (kind: string) =>
      out.items.filter((i) => i.kind === kind).map((i) => i.title);
    expect(titles("cross-reference")).toEqual([
      "Rom.5.8",
      "1John.4.9-1John.4.10",
    ]);
    // Nicodemus is at verses 1, 4, 9 — not 16; the event includes 16.
    expect(titles("person")).toEqual([]);
    expect(titles("event")).toEqual(["Jesus and Nicodemus"]);
    expect(titles("place")).toEqual([]);
    // Writings about the whole book reach every verse; Chrysostom on 3:5 does not reach 3:16.
    expect(titles("witness")).toEqual(["Rylands Papyrus P52"]);
    expect(titles("writing")).toEqual(["Epistle of the Apostles"]);
    expect(titles("commentary")).toEqual([]);
    expect(titles("offering")).toEqual(["For God so loved"]);
    const xref = out.items.find((i) => i.kind === "cross-reference")!;
    expect(xref.locus.id).toBe(parseLocus("JHN.3.16")!.id);
    expect(out.sources).toMatchObject({
      scripture: { ok: true },
      content: { ok: true },
      registry: { ok: true, count: 1 },
    });
    expect(out.sources.person).toBeUndefined();
  });

  it("answers a chapter with all of it", async () => {
    const out = (await (await app(env()).get("JHN.3")).json()) as Answer;
    expect(out.items.filter((i) => i.kind === "cross-reference")).toHaveLength(
      3
    );
    expect(
      out.items
        .filter((i) => i.source === "scripture" && i.kind !== "cross-reference")
        .map((i) => i.title)
    ).toEqual(["Nicodemus", "Judea", "Jesus and Nicodemus"]);
    expect(out.items.filter((i) => i.kind === "offering")).toHaveLength(2);
    expect(
      out.items.find((i) => i.title === "Chrysostom on John 3:5")?.locus.alias
    ).toBe("John.3.5");
  });

  it("adds the signed-in reader's own marks, and only theirs at the passage", async () => {
    const asked: string[] = [];
    const person: PersonMarks = async (chapterRef) => {
      asked.push(chapterRef);
      return [
        {
          "@type": "seed:Highlight",
          "@id": "h1",
          aboutPassage: "JHN.3.16",
          highlightColor: "seed:highlightcolor-yellow",
        },
        {
          "@type": "seed:Annotation",
          "@id": "n1",
          aboutPassage: "JHN.3.16",
          note: "the whole gospel",
        },
        {
          "@type": "seed:Annotation",
          "@id": "n2",
          aboutPassage: "JHN.3.2",
          note: "by night",
        },
        {
          "@type": "seed:Annotation",
          "@id": "n3",
          aboutPassage: "JHN.3.16",
          note: "gone",
          deleted: true,
        },
      ];
    };
    const res = await app(env(), person).get("John.3.16");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const out = (await res.json()) as Answer;
    expect(asked).toEqual(["JHN.3"]);
    const mine = out.items.filter((i) => i.source === "person");
    expect(mine.map((i) => [i.kind, i.title])).toEqual([
      ["highlight", "John.3.16"],
      ["note", "the whole gospel"],
    ]);
    expect(out.sources.person).toEqual({ ok: true, count: 2 });
  });

  it("reports a source that fails and still answers from the rest", async () => {
    const person: PersonMarks = async () => {
      throw new Error("this workspace holds no permission to ask your agent");
    };
    const out = (await (
      await app(env({ scriptureDown: true }), person).get("JHN.3.16")
    ).json()) as Answer;
    expect(out.ok).toBe(true);
    expect(out.sources.scripture).toMatchObject({ ok: false, count: 0 });
    expect(out.sources.content).toMatchObject({ ok: false });
    expect(out.sources.person).toMatchObject({
      ok: false,
      error: expect.stringContaining("no permission"),
    });
    expect(out.items.map((i) => i.title)).toEqual(["For God so loved"]);
  });

  it("refuses what is not one place in the Bible, and a whole book", async () => {
    expect((await app(env()).get("Hezekiah 3:16")).status).toBe(400);
    expect((await app(env()).get("John 22:1")).status).toBe(400);
    const book = await app(env()).get("John");
    expect(book.status).toBe(400);
    expect(((await book.json()) as { error: string }).error).toMatch(
      /whole book/
    );
  });

  it("answers a range across chapters from each chapter it covers", async () => {
    const out = (await (
      await app(env()).get("John 3:21-4:2")
    ).json()) as Answer;
    expect(out.locus.alias).toBe("John.3.21-John.4.2");
    // Chapter 4 is answered with the same fixture; only its verses 1–2 count.
    expect(
      out.items.filter((i) => i.kind === "event").map((i) => i.locus.alias)
    ).toEqual(["John.3.1-John.3.21", "John.4.1-John.4.21"]);
  });
});

// THE DEAD SEA SCROLLS AT A VERSE: the writings name the scroll lines in the chapter; for the lines the publishing
// gateway carries, it is asked by canonical verse id and each line comes back with its Hebrew, its English draft, its
// licence and a citation; a line not published yet is named without text.
describe("/api/passage/<locus> — the publishing gateway", () => {
  const GEN_1 = {
    writings: {
      witnesses: {
        ofBook: [],
        atVerse: [
          {
            manuscript: "4Q7",
            line: "4Q7 f1:1",
            verses: [1, 2],
            published: "@demo-admin-1/dead-sea-scrolls",
          },
          { manuscript: "4Q2", line: "4Q2 f1:9", verses: [9], published: null },
        ],
      },
    },
  };
  const reading = {
    handle: "demo-admin-1",
    slug: "dead-sea-scrolls",
    version: 3,
    work: "Dead Sea Scrolls",
    partTitle: "4Q7 — 4Q Genesis",
    block: 3,
    sourceLabel: "4Q7 f1:1",
    relation: "witness",
    text: "[[4Q7 f1:1 | Gen.1.1-2]] he: ב ר#אש#[ ית ברא ]אלהים en: In the beginning, God created the heavens and the earth. ¶ status: first-draft · human-pending ¶ source: Open Dead Sea 804f6a70 · CC BY-NC 4.0",
    commitment: { value: "0xa4e2" },
    licence: "CC-BY-NC-4.0",
    attribution: "Transcriptions: ETCBC/dss. CC BY-NC 4.0.",
    commercialUse: false,
    url: "https://publishing.faithnet.io/@demo-admin-1/dead-sea-scrolls/3#b3",
  };
  function gen1Env(asked: string[], gatewayDown = false) {
    const e = env({ offerings: [] });
    return {
      ...e,
      SCRIPTURE: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          const { skill } = body.params.message.parts[0].data;
          const data = skill === "passage-writings" ? GEN_1 : { chapter: {} };
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              message: {
                messageId: "m",
                role: "ROLE_AGENT",
                parts: [{ data }],
              },
            },
          });
        },
      },
      PLATFORM: {
        fetch: async () => Response.json({ ok: true, offerings: [] }),
      },
      PUBLISHING: {
        fetch: async (input: RequestInfo | URL) => {
          asked.push(new URL(String(input)).searchParams.get("verseId")!);
          if (gatewayDown) return new Response("down", { status: 503 });
          return Response.json({ ok: true, readings: [reading] });
        },
      },
    } as BibleEnv & PlatformEnv;
  }

  it("a verse with a published line: the gateway is asked by its canonical id and the line comes with text, licence and citation", async () => {
    const asked: string[] = [];
    const res = await app(gen1Env(asked)).get("Genesis 1:2");
    const out = (await res.json()) as Answer & {
      items: Array<{
        data?: Record<string, unknown>;
        detail?: string;
        link?: string;
      }>;
    };
    expect(asked).toEqual([parseLocus("Gen.1.2")!.id]);
    const lines = out.items.filter((i) => i.kind === "scroll-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      source: "publishing",
      title: "4Q7 f1:1",
      detail: "In the beginning, God created the heavens and the earth.",
      link: reading.url,
      locus: { alias: "Gen.1.1-Gen.1.2" },
      data: {
        manuscript: "4Q7 — 4Q Genesis",
        hebrew: "ב ר#אש#[ ית ברא ]אלהים",
        status: "first-draft · human-pending",
        licence: "CC-BY-NC-4.0",
        commercialUse: false,
        citation: {
          locus: parseLocus("Gen.1.1-2")!.id,
          work: "@demo-admin-1/dead-sea-scrolls@3",
          block: 3,
          commitment: "0xa4e2",
        },
      },
    });
    expect(out.sources.publishing).toEqual({ ok: true, count: 1 });
  });

  it("a chapter names its scroll lines without reading their text (the verse is asked for that), and names an unpublished line too", async () => {
    const asked: string[] = [];
    const out = (await (
      await app(gen1Env(asked)).get("GEN.1")
    ).json()) as Answer & {
      items: Array<{ detail?: string; data?: Record<string, unknown> }>;
    };
    expect(asked).toEqual([]);
    const lines = out.items.filter((i) => i.kind === "scroll-line");
    expect(lines.map((i) => [i.source, i.title])).toEqual([
      ["content", "4Q2 f1:9"],
      ["publishing", "4Q7 f1:1"],
    ]);
    expect((lines[0] as { detail?: string }).detail).toMatch(
      /not published yet/
    );
    expect((lines[1] as { detail?: string }).detail).toBeUndefined();
    expect((lines[1] as { data?: unknown }).data).toMatchObject({
      manuscript: "4Q7",
      textAt: "GEN.1.1",
    });
  });

  it("a verse no scroll line touches does not ask the gateway; a gateway that is down is reported", async () => {
    const asked: string[] = [];
    const quiet = (await (
      await app(gen1Env(asked)).get("Gen.1.5")
    ).json()) as Answer;
    expect(asked).toEqual([]);
    expect(quiet.items.filter((i) => i.kind === "scroll-line")).toEqual([]);
    const down = (await (
      await app(gen1Env([], true)).get("Gen.1.2")
    ).json()) as Answer;
    expect(down.ok).toBe(true);
    expect(down.sources.publishing).toMatchObject({ ok: false });
  });
});

// ELSEWHERE AT A VERSE (the Scripture Agent's verse-associations): Isaiah 40:3's parallels in the Gospels and its
// Septuagint text come as items at the verse; the Community Rule line that quotes it is read from the gateway by its own
// reference and anchored at the verse it quotes.
describe("/api/passage/<locus> — elsewhere at a verse", () => {
  const ISA_40 = {
    verses: [
      {
        verse: 3,
        quotedIn: [
          {
            line: "1QS 8:14",
            manuscript: "1QS",
            composition: "Community Rule",
          },
        ],
        parallels: [
          { osis: "Matt.3.3", kind: "ot-in-nt" },
          { osis: "John.1.23", kind: "ot-in-nt" },
        ],
        septuagint: {
          text: "Φωνὴ βοῶντος ἐν τῇ ἐρήμῳ",
          edition: "lxx-swete-1909",
          label: "Swete, public domain",
        },
      },
      {
        verse: 9,
        parallels: [{ osis: "Isa.52.7", kind: "ot-parallel" }],
        septuagint: null,
      },
    ],
    sources: { parallels: "UBS parallel passages, CC BY-SA 4.0" },
  };
  const quote = {
    handle: "demo-admin-1",
    slug: "dead-sea-scrolls-non-biblical",
    version: 4,
    work: "Dead Sea Scrolls, non-biblical",
    partTitle: "1QS — 1Q Community Rule",
    block: 198,
    sourceLabel: "1QS 8:14",
    text: "[[1QS 8:14 | ]] he: כ אשר כתוב ב מדבר פנו דרך en: As written in the desert, make clear the way of Yahweh. ¶ status: first-draft · human-pending",
    licence: "CC-BY-NC-4.0",
    commercialUse: false,
    url: "https://publishing.faithnet.io/@demo-admin-1/x/4#b198",
  };
  function isaEnv(asked: string[]) {
    return {
      SCRIPTURE_ASK_TIMEOUT_MS: 200,
      SCRIPTURE: {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          const { skill } = body.params.message.parts[0].data;
          const data =
            skill === "verse-associations"
              ? ISA_40
              : skill === "passage-writings"
                ? { writings: null }
                : { chapter: {} };
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              message: {
                messageId: "m",
                role: "ROLE_AGENT",
                parts: [{ data }],
              },
            },
          });
        },
      },
      PLATFORM: {
        fetch: async () => Response.json({ ok: true, offerings: [] }),
      },
      PUBLISHING: {
        fetch: async (input: RequestInfo | URL) => {
          asked.push(new URL(String(input)).search);
          return Response.json({ ok: true, readings: [quote] });
        },
      },
    } as BibleEnv & PlatformEnv;
  }

  it("a verse: its parallels, its Greek, and the scroll line that quotes it, read by the line's own reference", async () => {
    const asked: string[] = [];
    const out = (await (
      await app(isaEnv(asked)).get("Isaiah 40:3")
    ).json()) as Answer & {
      items: Array<{ detail?: string; data?: Record<string, unknown> }>;
    };
    const kind = (k: string) => out.items.filter((i) => i.kind === k);
    expect(kind("parallel").map((i) => i.title)).toEqual([
      "Matt.3.3",
      "John.1.23",
    ]);
    expect((kind("parallel")[0] as { data?: unknown }).data).toMatchObject({
      relation: "ot-in-nt",
    });
    expect(kind("septuagint")[0]).toMatchObject({
      detail: "Φωνὴ βοῶντος ἐν τῇ ἐρήμῳ",
    });
    expect(asked).toEqual(["?source=1QS+8%3A14"]);
    expect(kind("scroll-quote")[0]).toMatchObject({
      source: "publishing",
      title: "1QS 8:14",
      detail: "As written in the desert, make clear the way of Yahweh.",
      locus: { id: parseLocus("Isa.40.3")!.id },
      data: {
        composition: "Community Rule",
        hebrew: "כ אשר כתוב ב מדבר פנו דרך",
        commercialUse: false,
      },
    });
    // verse 9's parallel is not at verse 3
    expect(kind("parallel").some((i) => i.title === "Isa.52.7")).toBe(false);
  });
});

// Blocks are numbered within a work's PART: two scrolls in one work (4Q2 and 4Q7 in dead-sea-scrolls-genesis) both have
// a block 3, and both are lines at Genesis 1:2 — neither may hide the other (seen live 2026-10-26).
describe("scroll lines of one work", () => {
  it("keeps lines with the same block number in different parts", async () => {
    const { scrollItems } =
      await import("../../../apps/reader-a2a/src/routes/passage");
    const line = (part: number, label: string) => ({
      handle: "demo-admin-1",
      slug: "dead-sea-scrolls-genesis",
      version: 2,
      work: "Dead Sea Scrolls: Genesis",
      part,
      block: 3,
      sourceLabel: label,
      text: `[[${label} | Gen.1.1-2]] he: ב en: In the beginning`,
    });
    const items = scrollItems(parseLocus("Gen.1.2")!, [
      line(4, "4Q2 f1i:1"),
      line(9, "4Q7 f1:1"),
    ]);
    expect(items.map((i) => i.title)).toEqual(["4Q2 f1i:1", "4Q7 f1:1"]);
    expect(items[1]!.data).toMatchObject({ citation: { part: 9, block: 3 } });
  });
});
