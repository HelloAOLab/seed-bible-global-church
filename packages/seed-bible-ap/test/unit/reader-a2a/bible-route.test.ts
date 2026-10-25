// THE BIBLE ASKED OVER A2A: every path the reader asks maps to the scripture agent's skill and arguments; the agent is
// asked with a standard SendMessage carrying a data part { skill, args }; its data part comes back with links under
// /bible/; a refusal (a translation it does not hold) is a 404 with its words; a path the API does not have is a 404
// without asking anyone.
import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  bibleRoutes,
  skillForPath,
  type BibleEnv,
} from "../../../apps/reader-a2a/src/routes/bible";

describe("which skill a path asks for", () => {
  const q = new URLSearchParams();
  it("maps the Free Use Bible API's paths", () => {
    expect(
      skillForPath("/bible/api/available_translations.json", q)
    ).toMatchObject({ skill: "list-translations" });
    expect(skillForPath("/bible/api/BSB/books.json", q)).toMatchObject({
      skill: "list-books",
      args: { translationId: "BSB" },
    });
    expect(skillForPath("/bible/api/BSB/verification.json", q)).toMatchObject({
      skill: "translation-attestation",
    });
    expect(skillForPath("/bible/api/BSB/JHN/3.json", q)).toMatchObject({
      skill: "read-chapter",
      args: {
        translationId: "BSB",
        book: "JHN",
        chapter: 3,
        includeProofs: true,
      },
    });
    expect(
      skillForPath("/bible/api/BSB/JHN/3.david.audioTimings.json", q)
    ).toMatchObject({
      skill: "audio-timings",
      args: { reader: "david", chapter: 3 },
    });
  });
  it("maps the interpretation records and the writings around a chapter (2026-10-25)", () => {
    expect(
      skillForPath("/bible/api/rbs/interpretations.json", q)
    ).toMatchObject({
      skill: "interpretation-index",
      args: { edition: "rbs" },
    });
    expect(
      skillForPath("/bible/api/rbs/GEN/1/interpretations.json", q)
    ).toMatchObject({
      skill: "chapter-interpretations",
      args: { edition: "rbs", book: "GEN", chapter: 1 },
    });
    // the chapter route must still win for a plain chapter
    expect(skillForPath("/bible/api/rbs/GEN/1.json", q)).toMatchObject({
      skill: "read-chapter",
    });
    expect(skillForPath("/bible/api/writings/GEN/6.json", q)).toMatchObject({
      skill: "passage-writings",
      args: { book: "GEN", chapter: 6 },
    });
    const withVerse = skillForPath(
      "/bible/api/writings/GEN/6.json",
      new URLSearchParams("verse=2")
    );
    expect(withVerse).toMatchObject({
      args: { book: "GEN", chapter: 6, verse: 2 },
    });
    expect(
      skillForPath(
        "/bible/api/writings/GEN/6.json",
        new URLSearchParams("verse=x")
      )?.args
    ).not.toHaveProperty("verse");
    expect(
      skillForPath("/bible/api/d/theographic/people/nicodemus_2204.json", q)
    ).toMatchObject({
      skill: "read-dataset",
      args: { dataset: "theographic", path: "people/nicodemus_2204" },
    });
    expect(
      skillForPath(
        "/bible/api/search/eng",
        new URLSearchParams({ q: "shepherd", translation: "BSB", page: "2" })
      )
    ).toMatchObject({
      skill: "search-verses",
      args: { language: "eng", translationId: "BSB", q: "shepherd", page: 2 },
    });
  });
  it("asks nothing for a path the API does not have", () => {
    expect(skillForPath("/bible/api/BSB/JHN/x.json", q)).toBeNull();
    expect(skillForPath("/bible/api/d/theographic/../../x.json", q)).toBeNull();
    expect(skillForPath("/bible/api/search/eng", q)).toBeNull();
  });
});

describe("asking the scripture agent", () => {
  function app(
    answer: (body: {
      method: string;
      params: { message: { parts: Array<{ data?: unknown }> } };
    }) => unknown
  ) {
    const asked: unknown[] = [];
    const env: BibleEnv = {
      SCRIPTURE: {
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body));
          asked.push(body.params.message.parts[0].data);
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: answer(body),
          });
        },
      },
    };
    const a = new Hono<{ Bindings: BibleEnv }>();
    a.route("/", bibleRoutes);
    const get = (path: string) =>
      a.fetch(new Request(`https://reader.test${path}`), env, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as never);
    return { get, asked };
  }

  it("sends SendMessage with the skill as a data part, and moves the reply's links under /bible/", async () => {
    const { get, asked } = app(() => ({
      message: {
        messageId: "m",
        role: "ROLE_AGENT",
        parts: [
          {
            data: {
              chapter: { number: 3 },
              nextChapterApiLink: "/api/BSB/JHN/4.json",
            },
          },
        ],
      },
    }));
    const res = await get("/bible/api/BSB/JHN/3.json");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      chapter: { number: 3 },
      nextChapterApiLink: "/bible/api/BSB/JHN/4.json",
    });
    expect(asked).toEqual([
      {
        skill: "read-chapter",
        args: {
          translationId: "BSB",
          book: "JHN",
          chapter: 3,
          includeProofs: true,
        },
      },
    ]);
  });

  it("a refusal is a 404 with the agent's words; an unknown path asks nobody", async () => {
    const { get, asked } = app(() => ({
      task: {
        id: "t",
        status: {
          state: "TASK_STATE_REJECTED",
          message: {
            messageId: "m",
            role: "ROLE_AGENT",
            parts: [{ text: "translation NOPE is not held" }],
          },
        },
      },
    }));
    const res = await get("/bible/api/NOPE/books.json");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "translation NOPE is not held" });
    const none = await get("/bible/api/BSB/JHN/x.json");
    expect(none.status).toBe(404);
    expect(asked).toHaveLength(1);
  });
});

describe("a scripture agent that does not answer", () => {
  it("is given up on and asked again: a call that hangs does not hang the reader", async () => {
    let calls = 0;
    const env: BibleEnv = {
      SCRIPTURE_ASK_TIMEOUT_MS: 50,
      SCRIPTURE: {
        fetch: async (_input, init) => {
          calls++;
          if (calls === 1)
            // The first ask never answers; only the timeout ends it.
            return new Promise<Response>((_, reject) =>
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("timed out", "TimeoutError"))
              )
            );
          const body = JSON.parse(String(init?.body));
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              message: {
                messageId: "m",
                role: "ROLE_AGENT",
                parts: [{ data: { books: [] } }],
              },
            },
          });
        },
      },
    };
    const a = new Hono<{ Bindings: BibleEnv }>();
    a.route("/", bibleRoutes);
    const res = await a.fetch(
      new Request("https://reader.test/bible/api/BSB/books.json"),
      env,
      { waitUntil: () => {}, passThroughOnException: () => {} } as never
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ books: [] });
    expect(calls).toBe(2);
  });

  it("asks at most three times, then says the agent did not answer", async () => {
    let calls = 0;
    const env: BibleEnv = {
      SCRIPTURE_ASK_TIMEOUT_MS: 20,
      SCRIPTURE: {
        fetch: async (_input, init) => {
          calls++;
          return new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("timed out", "TimeoutError"))
            )
          );
        },
      },
    };
    const a = new Hono<{ Bindings: BibleEnv }>();
    a.route("/", bibleRoutes);
    const res = await a.fetch(
      new Request("https://reader.test/bible/api/BSB/JHN/3.json"),
      env,
      { waitUntil: () => {}, passThroughOnException: () => {} } as never
    );
    expect(res.status).toBe(502);
    expect(calls).toBe(3);
  });
});

describe("the edge cache", () => {
  const g = globalThis as { caches?: unknown };
  const before = g.caches;
  afterEach(() => {
    g.caches = before;
  });

  it("gives a cached answer back its own lifetime, not the zone's four hours", async () => {
    // Cloudflare's Cache API hands a hit back with the zone's browser lifetime in place of the stored one.
    const stored = new Map<string, Response>();
    g.caches = {
      default: {
        match: async (req: Request) => {
          const hit = stored.get(req.url);
          if (!hit) return undefined;
          const out = new Response(hit.clone().body, hit);
          out.headers.set("cache-control", "public, max-age=14400");
          return out;
        },
        put: async (req: Request, res: Response) => {
          stored.set(req.url, res);
        },
      },
    };
    let asked = 0;
    const env: BibleEnv = {
      SCRIPTURE: {
        fetch: async (_input, init) => {
          asked++;
          const body = JSON.parse(String(init?.body));
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              message: {
                messageId: "m",
                role: "ROLE_AGENT",
                parts: [{ data: { translations: [{ id: "BSB" }] } }],
              },
            },
          });
        },
      },
    };
    const a = new Hono<{ Bindings: BibleEnv }>();
    a.route("/", bibleRoutes);
    const pending: Promise<unknown>[] = [];
    const get = () =>
      a.fetch(
        new Request(
          "https://reader.test/bible/api/available_translations.json"
        ),
        env,
        {
          waitUntil: (p: Promise<unknown>) => pending.push(p),
          passThroughOnException: () => {},
        } as never
      );
    const first = await get();
    await Promise.all(pending);
    const second = await get();
    expect(asked).toBe(1);
    expect(first.headers.get("cache-control")).toBe("public, max-age=300");
    expect(second.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await second.json()).toEqual({ translations: [{ id: "BSB" }] });
  });
});
