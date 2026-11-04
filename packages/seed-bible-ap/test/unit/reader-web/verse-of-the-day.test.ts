// THE VERSE OF THE DAY — read from the Bible API's open verse-of-the-day dataset (not the scripture agent, which has
// none) and picked by seedbible.org's own rule, copied unchanged: the same date gives the same verse on both apps, and
// a holiday gets its holiday verse. The dataset is a fixture saved from bible.helloao.org on 2026-11-04.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FreeUseBibleAPI } from "../../../apps/reader-web/src/backend/bible";

const DATASET = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../fixtures/verse-of-the-day.json", import.meta.url)
    ),
    "utf8"
  )
);
const AGENT = "https://agent.test/bible/";
const API = "https://api.test/";

afterEach(() => vi.unstubAllGlobals());

function serve() {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return url === `${API}api/d/verse-of-the-day/verses.json`
        ? new Response(JSON.stringify(DATASET), { status: 200 })
        : new Response("missing", { status: 404 });
    })
  );
  return asked;
}

describe("the verse of the day", () => {
  it("is read from the Bible API and is the same verse for the same date", async () => {
    const asked = serve();
    const api = new FreeUseBibleAPI(AGENT, API);
    const a = await api.getVerseOfTheDay("2026-11-04");
    const b = await new FreeUseBibleAPI(AGENT, API).getVerseOfTheDay(
      "2026-11-04"
    );
    expect(a).toEqual(b);
    expect(a).toMatchObject({ book: "PSA", chapter: 51, verse: 10 });
    expect(asked.every((u) => u.startsWith(API))).toBe(true);
  });

  it("gives a holiday its own verse", async () => {
    serve();
    const xmas = await new FreeUseBibleAPI(AGENT, API).getVerseOfTheDay(
      "2026-12-25"
    );
    expect(xmas?.categories).toContain("christmas");
  });

  it("changes from one day to the next", async () => {
    serve();
    const api = new FreeUseBibleAPI(AGENT, API);
    const days = await Promise.all(
      ["2026-11-04", "2026-11-05", "2026-11-06"].map((d) =>
        api.getVerseOfTheDay(d)
      )
    );
    expect(
      new Set(days.map((v) => `${v?.book} ${v?.chapter}:${v?.verse}`)).size
    ).toBe(3);
  });
});
