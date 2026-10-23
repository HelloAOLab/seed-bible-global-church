// THE BIBLE ASKED OVER A2A: every path the reader asks maps to the scripture agent's skill and arguments; the agent is
// asked with a standard SendMessage carrying a data part { skill, args }; its data part comes back with links under
// /bible/; a refusal (a translation it does not hold) is a 404 with its words; a path the API does not have is a 404
// without asking anyone.
import { describe, expect, it } from "vitest";
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
