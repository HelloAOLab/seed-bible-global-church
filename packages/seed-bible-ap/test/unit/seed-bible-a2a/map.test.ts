// The map's tile proxy takes only what a map asks for: a tile inside the zoom cap and the grid. (A place's geometry is
// the scripture agent's, asked over A2A.)
import { describe, expect, it } from "vitest";
import { tileOk } from "../../../apps/seed-bible-a2a/src/index";

describe("the map tile proxy", () => {
  it("accept a tile in the grid up to the zoom cap and nothing else", () => {
    expect(tileOk(0, 0, 0)).toBe(true);
    expect(tileOk(7, 77, 51)).toBe(true);
    expect(tileOk(12, 4095, 4095)).toBe(true);
    expect(tileOk(13, 0, 0)).toBe(false);
    expect(tileOk(7, 128, 0)).toBe(false);
    expect(tileOk(7, -1, 0)).toBe(false);
    expect(tileOk(1.5, 0, 0)).toBe(false);
  });
});
