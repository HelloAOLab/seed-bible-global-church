// BIBLES THE SCRIPTURE AGENT DOES NOT SERVE COME STRAIGHT FROM THE BIBLE API — the agent's editions stay the agent's
// (checked), every other edition the Free Use Bible API carries is listed after them and read from that API, links it
// gives (the next chapter) included. An agent that cannot answer keeps everything on the agent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FreeUseBibleAPI } from "../../../apps/reader-web/src/backend/bible";

const AGENT = "https://agent.test/bible/";
const API = "https://api.test/";
const t = (id: string) => ({ id, name: id, englishName: id, language: "eng" });

function serve(routes: Record<string, unknown>, agentDown = false) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      if (agentDown && url.startsWith(AGENT))
        return new Response("down", { status: 503 });
      const body = routes[url];
      return body === undefined
        ? new Response("missing", { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    })
  );
  return asked;
}

const ROUTES = {
  [`${AGENT}api/available_translations.json`]: {
    translations: [t("BSB"), t("KJAV")],
  },
  [`${API}api/available_translations.json`]: {
    translations: [t("BSB"), t("AAB"), t("fra_ncl")],
  },
  [`${AGENT}api/BSB/GEN/1.json`]: {
    translation: t("BSB"),
    chapter: { number: 1 },
  },
  [`${API}api/AAB/GEN/1.json`]: {
    translation: t("AAB"),
    chapter: { number: 1 },
    nextChapterApiLink: "/api/AAB/GEN/2.json",
  },
  [`${API}api/AAB/GEN/2.json`]: {
    translation: t("AAB"),
    chapter: { number: 2 },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("direct Bibles", () => {
  it("lists the agent's editions first, then the API's others, marked", async () => {
    serve(ROUTES);
    const api = new FreeUseBibleAPI(AGENT, API);
    const list = await api.getAvailableTranslations();
    expect(list.translations.map((x) => [x.id, x.source ?? "agent"])).toEqual([
      ["BSB", "agent"],
      ["KJAV", "agent"],
      ["AAB", "bible-api"],
      ["fra_ncl", "bible-api"],
    ]);
  });

  it("reads an agent edition from the agent and any other from the API, its links too", async () => {
    const asked = serve(ROUTES);
    const api = new FreeUseBibleAPI(AGENT, API);
    expect(
      (await api.getTranslationBookChapter("BSB", "GEN", 1)).translation.id
    ).toBe("BSB");
    const aab = await api.getTranslationBookChapter("AAB", "GEN", 1);
    expect((await api.getNextChapter(aab))?.chapter.number).toBe(2);
    expect(asked).toContain(`${AGENT}api/BSB/GEN/1.json`);
    expect(asked).toContain(`${API}api/AAB/GEN/1.json`);
    expect(asked).toContain(`${API}api/AAB/GEN/2.json`);
    expect(asked.some((u) => u.startsWith(AGENT) && u.includes("AAB"))).toBe(
      false
    );
  });

  it("keeps everything on the agent when the agent cannot answer, and without a direct API", async () => {
    const asked = serve(ROUTES, true);
    await expect(
      new FreeUseBibleAPI(AGENT, API).getTranslationBookChapter("AAB", "GEN", 1)
    ).rejects.toThrow();
    expect(asked.some((u) => u.startsWith(API) && u.includes("GEN"))).toBe(
      false
    );
    serve(ROUTES);
    await expect(
      new FreeUseBibleAPI(AGENT).getTranslationBookChapter("AAB", "GEN", 1)
    ).rejects.toThrow();
  });
});
