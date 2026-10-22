// The map proxies take only what a map asks for: a tile inside the zoom cap and the grid, a plain place name.
import { describe, expect, it } from "vitest";
import { placeNameOk, tileOk } from "../../../apps/seed-bible-a2a/src/index";

describe("the map proxies", () => {
  it("accept a tile in the grid up to the zoom cap and nothing else", () => {
    expect(tileOk(0, 0, 0)).toBe(true);
    expect(tileOk(7, 77, 51)).toBe(true);
    expect(tileOk(12, 4095, 4095)).toBe(true);
    expect(tileOk(13, 0, 0)).toBe(false);
    expect(tileOk(7, 128, 0)).toBe(false);
    expect(tileOk(7, -1, 0)).toBe(false);
    expect(tileOk(1.5, 0, 0)).toBe(false);
  });
  it("accept a place name and refuse a path", () => {
    expect(placeNameOk("Bethlehem")).toBe(true);
    expect(placeNameOk("Beth Shean")).toBe(true);
    expect(placeNameOk("../etc")).toBe(false);
    expect(placeNameOk("")).toBe(false);
  });
});
