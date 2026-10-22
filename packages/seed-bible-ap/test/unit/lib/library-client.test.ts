import { describe, expect, it } from "vitest";
import {
  applyPut,
  bucketFolder,
  bucketFull,
  bucketKey,
  bucketName,
  emptyBucket,
  emptyManifest,
  mergeBuckets,
  noteBucketSaved,
  parseBucket,
  serialize,
} from "@seed/library-client";
import type { Annotation, Highlight } from "@seed/seed-schema";

const READER = "0xdbb41f779194d605e636f9bab64b105fd025b3db";
const hl = (over: Partial<Highlight> = {}): Highlight => ({
  "@id": "hl-1",
  "@type": "seed:Highlight",
  heldBy: READER,
  aboutPassage: "JHN.3.16",
  ofEdition: "BSB",
  highlightColor: "seed:highlightcolor-yellow",
  opId: "op-1",
  updatedAt: "2026-10-21T21:04:00Z",
  ...over,
});
const note = (over: Partial<Annotation> = {}): Annotation => ({
  "@id": "an-1",
  "@type": "seed:Annotation",
  heldBy: READER,
  aboutPassage: "JHN.3.16",
  note: "the whole gospel in one sentence",
  opId: "op-n1",
  updatedAt: "2026-10-21T21:06:00Z",
  ...over,
});

describe("bucket paths", () => {
  it("buckets highlights and annotations by chapter, bookmarks and saves in one document", () => {
    expect(bucketFolder("highlights", "JHN.3.16")).toBe(
      "seed-bible/highlights/JHN"
    );
    expect(bucketName("highlights", "JHN.3.16")).toBe("3.jsonld");
    expect(bucketKey("annotations", "JHN.3.16-JHN.3.18")).toBe("JHN.3");
    expect(bucketFolder("bookmarks")).toBe("seed-bible/bookmarks");
    expect(bucketName("bookmarks")).toBe("bookmarks.jsonld");
    expect(bucketKey("saves")).toBe("saves");
    expect(() => bucketFolder("highlights")).toThrow(/chapter is required/);
  });
});

describe("applyPut", () => {
  it("appends a new item, replaces the same id, and is a no-op for a replayed opId", () => {
    const b0 = emptyBucket("highlights", "JHN.3");
    const b1 = applyPut(b0, hl());
    expect(b1.changed).toBe(true);
    expect(b1.bucket["@graph"]).toHaveLength(1);
    const again = applyPut(b1.bucket, hl());
    expect(again.changed).toBe(false);
    expect(again.bucket).toBe(b1.bucket);
    const recolor = applyPut(
      b1.bucket,
      hl({ opId: "op-2", highlightColor: "seed:highlightcolor-green" })
    );
    expect(recolor.replaced).toBe(true);
    expect(recolor.bucket["@graph"]).toHaveLength(1);
    expect(recolor.bucket["@graph"][0]).toMatchObject({
      highlightColor: "seed:highlightcolor-green",
    });
  });

  it("round-trips through the Library's text and refuses a non-bucket", () => {
    const b = applyPut(emptyBucket("highlights", "JHN.3"), hl()).bucket;
    const back = parseBucket(serialize(b), "highlights", "JHN.3");
    expect(back["@graph"]).toEqual(b["@graph"]);
    expect(back.chapterRef).toBe("JHN.3");
    expect(() => parseBucket('{"hello":1}', "highlights", "JHN.3")).toThrow(
      /no @graph/
    );
    expect(() =>
      parseBucket(
        JSON.stringify({
          "@graph": [{ "@type": "seed:Highlight", "@id": "x" }],
        }),
        "highlights",
        "JHN.3"
      )
    ).toThrow();
  });

  it("knows when a bucket is near the Library's cap", () => {
    let b = emptyBucket("annotations", "JHN.3");
    expect(bucketFull(b)).toBe(false);
    for (let i = 0; i < 40; i++)
      b = applyPut(
        b,
        note({ "@id": `an-${i}`, opId: `op-${i}`, note: "x".repeat(300) })
      ).bucket;
    expect(bucketFull(b)).toBe(true);
  });
});

describe("mergeBuckets (skill:seed/bucket-merge)", () => {
  it("adds, keeps a replay, and lets the later update win for idempotent marks", () => {
    const current = applyPut(emptyBucket("highlights", "JHN.3"), hl()).bucket;
    const incoming = {
      ...emptyBucket("highlights", "JHN.3"),
      "@graph": [
        hl(), // the same opId — a replay
        hl({ "@id": "hl-2", opId: "op-9", aboutPassage: "JHN.3.17" }), // new
      ],
    };
    const { bucket, report } = mergeBuckets(current, incoming);
    expect(report).toMatchObject({
      added: ["hl-2"],
      kept: ["hl-1"],
      replaced: [],
      conflicts: [],
    });
    expect(bucket["@graph"]).toHaveLength(2);

    const older = mergeBuckets(bucket, {
      ...incoming,
      "@graph": [
        hl({
          opId: "op-old",
          highlightColor: "seed:highlightcolor-pink",
          updatedAt: "2026-10-01T00:00:00Z",
        }),
      ],
    });
    expect(older.report.kept).toEqual(["hl-1"]);
    const newer = mergeBuckets(bucket, {
      ...incoming,
      "@graph": [
        hl({
          opId: "op-new",
          highlightColor: "seed:highlightcolor-pink",
          updatedAt: "2026-10-22T00:00:00Z",
        }),
      ],
    });
    expect(newer.report.replaced).toEqual(["hl-1"]);
    expect(
      newer.bucket["@graph"].find((i) => i["@id"] === "hl-1")
    ).toMatchObject({ highlightColor: "seed:highlightcolor-pink" });
  });

  it("keeps both bodies of a note edited on two devices and flags the conflict", () => {
    const current = applyPut(
      emptyBucket("annotations", "JHN.3"),
      note()
    ).bucket;
    const incoming = {
      ...emptyBucket("annotations", "JHN.3"),
      "@graph": [
        note({
          opId: "op-n2",
          note: "edited on the phone",
          updatedAt: "2026-10-21T22:00:00Z",
        }),
      ],
    };
    const { bucket, report } = mergeBuckets(current, incoming);
    expect(report.conflicts).toHaveLength(1);
    expect(bucket["@graph"]).toHaveLength(2);
    const kept = bucket["@graph"].find(
      (i) => i["@id"] === report.conflicts[0]!.keptAs
    );
    expect(kept).toMatchObject({
      "@type": "seed:Annotation",
      conflictOf: "an-1",
      note: "edited on the phone",
    });
    expect(bucket["@graph"].find((i) => i["@id"] === "an-1")).toMatchObject({
      note: "the whole gospel in one sentence",
    });
  });

  it("applies a later tombstone and ignores an older one", () => {
    const current = applyPut(emptyBucket("highlights", "JHN.3"), hl()).bucket;
    const del = mergeBuckets(current, {
      ...current,
      "@graph": [
        hl({
          opId: "op-del",
          deleted: true,
          updatedAt: "2026-10-22T00:00:00Z",
        }),
      ],
    });
    expect(del.bucket["@graph"][0]).toMatchObject({ deleted: true });
    const stale = mergeBuckets(current, {
      ...current,
      "@graph": [
        hl({
          opId: "op-stale",
          deleted: true,
          updatedAt: "2026-10-01T00:00:00Z",
        }),
      ],
    });
    expect(stale.bucket["@graph"][0]?.deleted).toBeUndefined();
  });
});

describe("manifest", () => {
  it("records a saved bucket's version and count", () => {
    const m = noteBucketSaved(
      emptyManifest("highlights", "2026-10-21T21:00:00Z"),
      "JHN.3",
      applyPut(emptyBucket("highlights", "JHN.3"), hl()).bucket,
      "3.jsonld",
      2,
      "2026-10-21T21:05:00Z"
    );
    expect(m.buckets["JHN.3"]).toEqual({
      bucket: "3.jsonld",
      version: 2,
      count: 1,
      updatedAt: "2026-10-21T21:05:00Z",
    });
    expect(m.updatedAt).toBe("2026-10-21T21:05:00Z");
  });
});
