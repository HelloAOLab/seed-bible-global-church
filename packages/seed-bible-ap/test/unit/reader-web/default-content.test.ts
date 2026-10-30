// VIDEOS AND ARTICLES FROM THE PUBLISHING APP: what is published about a book, a passage or a verse is asked through the
// reader's agent (`/api/about/<ref>?scope=`), kept on the device for a while, kept when the agent cannot answer, and shown
// in Discover as a card that names its maker and the passage it is about and opens at the maker.
import { describe, expect, it, vi } from "vitest";
import {
  loadPublished,
  type PublishedMedia,
} from "../../../apps/reader-web/src/state/published";
import { discoverItemOf } from "../../../apps/reader-web/src/extensions/defaultContent";

const upperRoom: PublishedMedia = {
  item: {
    kind: "media",
    medium: "video",
    id: "demo-admin-1/videos-and-articles-about-the-bible#curated:upper-room",
    title: "The Last Supper and Pentecost...HERE!",
    provider: "Expedition Bible",
    url: "https://www.youtube.com/watch?v=1e5paRyGr0A",
    embedUrl: "https://www.youtube-nocookie.com/embed/1e5paRyGr0A",
  },
  references: [{ osis: "Matt.26.20-30", scope: "verse", relation: "depicts" }],
  publisher: { handle: "demo-admin-1" },
  release: {
    work: "demo-admin-1/videos-and-articles-about-the-bible",
    title: "Videos and articles about the Bible",
    url: "https://publishing.faithnet.io/@demo-admin-1/videos-and-articles-about-the-bible",
    signatureStatus: "verified",
  },
  license: "CC-BY-4.0",
  attribution: "Seed Bible's index",
};
const cache = () => {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (k: string) => m.get(k),
    set: async (k: string, v: unknown) => void m.set(k, v),
  };
};
const answering = (body: unknown, status = 200) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("what is published about a place in the Bible", () => {
  it("asks the reader's agent with the scope, keeps the answer, and asks again only once it is old", async () => {
    const c = cache();
    const f = answering({ ok: true, items: [upperRoom] });
    let t = 0;
    const now = () => t;
    expect(
      (await loadPublished("MAT.26.26", "section", c, {
        fetchImpl: f,
        now,
        edition: "BSB",
      }))!.map((m) => m.item.title)
    ).toEqual([upperRoom.item.title]);
    expect(String(f.mock.calls[0]![0])).toMatch(
      /\/api\/about\/MAT\.26\.26\?scope=section&edition=BSB$/
    );
    await loadPublished("MAT.26.26", "section", c, {
      fetchImpl: f,
      now,
      edition: "BSB",
    });
    expect(f).toHaveBeenCalledTimes(1);
    t = 7 * 60 * 60_000;
    await loadPublished("MAT.26.26", "section", c, {
      fetchImpl: f,
      now,
      edition: "BSB",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("answers an empty list when nothing is published, and null when the agent cannot be asked", async () => {
    expect(
      await loadPublished("OBA.1", "section", cache(), {
        fetchImpl: answering({ ok: true, items: [] }),
      })
    ).toEqual([]);
    expect(
      await loadPublished("GEN", "book", cache(), {
        fetchImpl: answering({ ok: false, error: "down" }, 502),
      })
    ).toBeNull();
  });
  it("keeps what it had when the agent later fails, and ignores items that are not media", async () => {
    const c = cache();
    let t = 0;
    await loadPublished("GEN", "book", c, {
      fetchImpl: answering({
        ok: true,
        items: [upperRoom, { item: { kind: "feature" } }],
      }),
      now: () => t,
    });
    t = 7 * 60 * 60_000;
    const kept = await loadPublished("GEN", "book", c, {
      fetchImpl: answering({ ok: false }, 502),
      now: () => t,
    });
    expect(kept!.map((m) => m.item.kind)).toEqual(["media"]);
  });
});

describe("a published video in Discover", () => {
  it("names its maker and the passage, plays in place where it can, and opens at the maker", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const card = discoverItemOf(upperRoom);
    expect(card.description).toBe("Expedition Bible · Matt.26.20-30");
    expect(card.embedUrl).toBe(upperRoom.item.embedUrl);
    card.onOpen!();
    expect(open).toHaveBeenCalledWith(
      upperRoom.item.url,
      "_blank",
      "noopener,noreferrer"
    );
    vi.unstubAllGlobals();
  });
});
