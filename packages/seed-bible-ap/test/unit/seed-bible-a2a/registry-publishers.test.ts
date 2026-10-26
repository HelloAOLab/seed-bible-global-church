// THE REGISTRY FOLLOWS PUBLISHERS BY publisher.changes: a crawl reads from the cursor the last one ended on, page by
// page, keeps the latest change per work, and moves the cursor only when it succeeded; the store keeps one row per
// work (a withdrawal replaces the published row, never a silent delete) and lists what is published, newest first.
// Run against the real migrations on SQLite (D1 is SQLite); the gateway is a stub answering the contract.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPublisherCrawl,
  crawlPublisher,
  listWorks,
  publisherCursor,
  putPublisher,
  type Fetch,
  type WorkChange,
} from "../../../apps/seed-bible-a2a/src/registry/publishers";
import { d1WithMigrations } from "../../helpers/d1";

const MIGRATIONS = join(__dirname, "../../../apps/seed-bible-a2a/migrations");
const publisher = {
  name: "publishing.test",
  endpoint: "https://publishing.test/api/",
  kind: "content",
};
const change = (
  work: string,
  at: number,
  kind = "text",
  c: WorkChange["change"] = "published",
  version = 1
): WorkChange => ({
  work,
  title: work.split("/")[1]!,
  kind,
  version,
  change: c,
  at,
});

/** A gateway whose history is `all`, answered in pages of `limit` from `since`, as the contract says. */
function gateway(all: WorkChange[], opts: { down?: boolean } = {}) {
  const asked: Array<{ since: number; limit: number }> = [];
  const f: Fetch = async (input, init) => {
    expect(String(input)).toBe("https://publishing.test/api/publisher/changes");
    if (opts.down) return new Response("down", { status: 503 });
    const { since, limit } = JSON.parse(String(init?.body)) as {
      since: number;
      limit: number;
    };
    asked.push({ since, limit });
    const rows = all
      .filter((c) => c.at > since)
      .sort((a, b) => a.at - b.at)
      .slice(0, limit);
    return Response.json({
      ok: true,
      changes: rows,
      cursor: String(rows.length ? rows[rows.length - 1]!.at : since),
    });
  };
  return { f, asked };
}

describe("the registry follows publishers", () => {
  it("reads every change since the cursor, pages until a short page, keeps the latest per work, and moves the cursor", async () => {
    const history = [
      ...Array.from({ length: 200 }, (_, i) => change(`demo/w${i}`, 1000 + i)),
      change("demo/w3", 2000, "text", "withdrawn"),
      change("demo/map", 2100, "map"),
    ];
    const g = gateway(history);
    const c = await crawlPublisher(g.f, publisher, "0");
    expect(c.ok).toBe(true);
    expect(g.asked).toEqual([
      { since: 0, limit: 200 },
      { since: 1199, limit: 200 },
    ]);
    expect(c.pages).toBe(2);
    expect(c.changes).toHaveLength(201);
    expect(c.changes.find((x) => x.work === "demo/w3")).toMatchObject({
      change: "withdrawn",
      at: 2000,
    });
    expect(c.cursor).toBe("2100");
    // The next crawl starts where this one ended and reads nothing new.
    const again = await crawlPublisher(g.f, publisher, c.cursor);
    expect(again.changes).toEqual([]);
    expect(again.cursor).toBe("2100");
  });

  it("a publisher that is down fails in words and leaves the cursor where it was", async () => {
    const c = await crawlPublisher(
      gateway([], { down: true }).f,
      publisher,
      "1500"
    );
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/503/);
    expect(c.cursor).toBe("1500");
    expect(c.changes).toEqual([]);
  });

  it("keeps one row per work, replaces a published row by its withdrawal, and lists what is published newest first", async () => {
    const db = d1WithMigrations(MIGRATIONS);
    await putPublisher(db, publisher);
    expect(await publisherCursor(db, publisher.name)).toBe("0");
    const first = await crawlPublisher(
      gateway([change("demo/scrolls", 1000), change("demo/map", 1100, "map")])
        .f,
      publisher,
      "0"
    );
    expect(await applyPublisherCrawl(db, first)).toEqual({ indexed: 2 });
    expect(await publisherCursor(db, publisher.name)).toBe("1100");
    expect((await listWorks(db)).map((w) => `${w.kind} ${w.work}`)).toEqual([
      "map demo/map",
      "text demo/scrolls",
    ]);
    const second = await crawlPublisher(
      gateway([
        change("demo/map", 1200, "map", "withdrawn", 1),
        change("demo/scrolls", 1300, "text", "published", 2),
      ]).f,
      publisher,
      "1100"
    );
    await applyPublisherCrawl(db, second);
    expect(await listWorks(db)).toMatchObject([
      { work: "demo/scrolls", version: 2 },
    ]);
    expect(
      (await listWorks(db, { withdrawn: true })).map(
        (w) => `${w.work} ${w.change}`
      )
    ).toEqual(["demo/scrolls published", "demo/map withdrawn"]);
    expect(await listWorks(db, { kind: "map" })).toEqual([]);
    // A failed crawl is remembered on the publisher and changes nothing else.
    const failed = await crawlPublisher(
      gateway([], { down: true }).f,
      publisher,
      "1300"
    );
    expect(await applyPublisherCrawl(db, failed)).toEqual({ indexed: 0 });
    expect(await publisherCursor(db, publisher.name)).toBe("1300");
    const row = await db
      .prepare("SELECT last_error FROM publishers WHERE name = ?")
      .bind(publisher.name)
      .first<{ last_error: string }>();
    expect(row?.last_error).toMatch(/503/);
  });
});
