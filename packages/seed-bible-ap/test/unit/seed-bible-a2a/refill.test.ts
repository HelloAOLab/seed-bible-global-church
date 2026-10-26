// ADR-0004 for pictures: the bucket is a copy. A public picture the shelf lists and the bucket lacks is re-put from
// the shelf's bytes; one the bucket holds costs a head; a shelf document that is not a content-addressed picture is
// left alone.
import { describe, expect, it } from "vitest";
import {
  crawlImages,
  refillImages,
  type FileBucket,
} from "../../../apps/seed-bible-a2a/src/registry/crawl";

const SHA = "a".repeat(64);
const OWNER = "0x" + "11".repeat(20);
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const b64 = btoa(String.fromCharCode(...PNG));

const shelfFetch = (async (_u: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    params?: {
      message?: { parts?: Array<{ data?: Record<string, unknown> }> };
    };
  };
  const data = body.params?.message?.parts?.[0]?.data ?? {};
  const skill = String(data.skill ?? "");
  const answer = (d: unknown) =>
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { parts: [{ kind: "data", data: d }] },
      }),
      { status: 200 }
    );
  if (skill === "library.public.list")
    return answer({
      owner: OWNER,
      count: 3,
      files: [
        {
          id: "f1",
          name: `${SHA}.png`,
          folder: "seed-bible/files",
          contentType: "image/png",
        },
        {
          id: "f2",
          name: "notes.md",
          folder: "seed-bible/files",
          contentType: "text/markdown",
        },
        {
          id: "f3",
          name: "cover.png",
          folder: "seed-bible/files",
          contentType: "image/png",
        },
      ],
    });
  if (skill === "library.public.read")
    return answer(
      data.id === "f1"
        ? { read: true, owner: OWNER, bytesB64: b64, contentType: "image/png" }
        : { read: false, refused: "not on the shelf" }
    );
  return new Response("nope", { status: 404 });
}) as typeof fetch;

function bucket(): FileBucket & {
  objects: Map<string, { bytes: ArrayBuffer; contentType: string }>;
} {
  const objects = new Map<
    string,
    { bytes: ArrayBuffer; contentType: string }
  >();
  return {
    objects,
    head: async (k) => objects.get(k) ?? null,
    put: async (k, bytes, opts) => {
      objects.set(k, { bytes, contentType: opts.httpMetadata.contentType });
    },
  };
}

describe("the bucket is a copy of the shelf's pictures", () => {
  it("lists only content-addressed pictures, and re-puts the missing one", async () => {
    const shelf = {
      name: "seedreader.me",
      endpoint: "https://shelf.test/a2a",
      kind: "person" as const,
    };
    const { images } = await crawlImages(shelfFetch, shelf);
    expect(images).toEqual([
      { owner: OWNER, id: "f1", name: `${SHA}.png`, contentType: "image/png" },
    ]);
    const b = bucket();
    const first = await refillImages(shelfFetch, b, shelf, images);
    expect(first).toEqual({ present: 0, refilled: 1, failed: [] });
    expect(b.objects.get(`${OWNER}/${SHA}.png`)).toMatchObject({
      contentType: "image/png",
    });
    expect(new Uint8Array(b.objects.get(`${OWNER}/${SHA}.png`)!.bytes)).toEqual(
      PNG
    );
    const again = await refillImages(shelfFetch, b, shelf, images);
    expect(again).toEqual({ present: 1, refilled: 0, failed: [] });
  });
  it("says what it could not refill", async () => {
    const shelf = {
      name: "x.me",
      endpoint: "https://shelf.test/a2a",
      kind: "person" as const,
    };
    const out = await refillImages(shelfFetch, bucket(), shelf, [
      {
        owner: OWNER,
        id: "missing",
        name: `${"b".repeat(64)}.png`,
        contentType: "image/png",
      },
    ]);
    expect(out.refilled).toBe(0);
    expect(out.failed[0]).toMatchObject({ reason: "not on the shelf" });
  });
});
