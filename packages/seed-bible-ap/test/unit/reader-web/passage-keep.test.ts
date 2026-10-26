// A PASSAGE ANSWER KEPT ON THE DEVICE IS NOT KEPT FOREVER: the sources behind it change (a scroll's lines republished
// 2026-10-26), so within a few hours it is used as is, and after that it is asked again — a reader gets the change
// without clearing anything. Mocked at the boundary: reader-a2a's reply.
import { describe, expect, it } from "vitest";
import {
  KEEP_MS,
  loadPassage,
} from "../../../apps/reader-web/src/state/passage";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";

describe("a passage answer kept on the device", () => {
  it("is used for a few hours, then asked again", async () => {
    const cache = memoryStores().chapters;
    let asked = 0;
    let lines = ["4Q7 f1:2"];
    const fetchImpl = (async () => {
      asked++;
      return Response.json({
        ok: true,
        locus: {
          id: "0x",
          alias: "Gen.1.3",
          type: "verse",
          span: [1001003, 1001003],
          ref: "GEN.1.3",
        },
        items: lines.map((title) => ({
          source: "publishing",
          kind: "scroll-line",
          title,
          locus: {},
        })),
        sources: { publishing: { ok: true, count: lines.length } },
      });
    }) as typeof fetch;
    let t = 1_000_000;
    const now = () => t;
    const first = await loadPassage("GEN.1.3", cache, fetchImpl, now);
    expect(first!.items.map((i) => i.title)).toEqual(["4Q7 f1:2"]);
    lines = ["4Q2 f1i:3"];
    t += KEEP_MS - 1;
    expect(
      (await loadPassage("GEN.1.3", cache, fetchImpl, now))!.items.map(
        (i) => i.title
      )
    ).toEqual(["4Q7 f1:2"]);
    expect(asked).toBe(1);
    t += 2;
    expect(
      (await loadPassage("GEN.1.3", cache, fetchImpl, now))!.items.map(
        (i) => i.title
      )
    ).toEqual(["4Q2 f1i:3"]);
    expect(asked).toBe(2);
  });
});
