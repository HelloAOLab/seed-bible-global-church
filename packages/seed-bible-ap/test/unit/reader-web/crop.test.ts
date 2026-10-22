// CROPPING A PICTURE: at zoom 1 a photo fills the window with no gap; a drag cannot pull an edge into view; the
// stored file is the editor's view scaled up; a logo zoomed out sits whole inside the window.
import { describe, expect, it } from "vitest";
import {
  COVER_IMAGE,
  LOGO,
  PROFILE_PICTURE,
  clampPan,
  placement,
} from "../../../apps/reader-web/src/state/library/crop";

const wide = { width: 2000, height: 1000 };

describe("placing a picture in the crop window", () => {
  it("fills a square window with a wide photo, centred", () => {
    expect(placement(wide, PROFILE_PICTURE, 1, { x: 0, y: 0 })).toEqual({
      dx: -128,
      dy: 0,
      dw: 512,
      dh: 256,
    });
  });

  it("stops a drag before an edge of the photo comes into view", () => {
    expect(clampPan(wide, PROFILE_PICTURE, 1, { x: 500, y: 40 })).toEqual({
      x: 128,
      y: 0,
    });
    const p = placement(wide, PROFILE_PICTURE, 1, { x: 500, y: 0 });
    expect(p.dx).toBe(0);
    expect(p.dx + p.dw).toBeGreaterThanOrEqual(PROFILE_PICTURE.previewWidth);
  });

  it("draws the stored cover at its own size from the same view", () => {
    const k = COVER_IMAGE.width / COVER_IMAGE.previewWidth;
    const view = placement(wide, COVER_IMAGE, 1.5, { x: 30, y: -10 });
    const stored = placement(wide, COVER_IMAGE, 1.5, { x: 30, y: -10 }, k);
    expect(stored.dw).toBeCloseTo(view.dw * k);
    expect(stored.dx).toBeCloseTo(view.dx * k);
    expect(stored.dy).toBeCloseTo(view.dy * k);
  });

  it("keeps a zoomed-out logo whole inside the window", () => {
    const p = placement({ width: 400, height: 100 }, LOGO, 0.25, {
      x: 999,
      y: -999,
    });
    expect(p.dx).toBeGreaterThanOrEqual(0);
    expect(p.dy).toBeGreaterThanOrEqual(0);
    expect(p.dx + p.dw).toBeLessThanOrEqual(LOGO.previewWidth + 1e-9);
    expect(p.dy + p.dh).toBeLessThanOrEqual(LOGO.previewHeight + 1e-9);
  });
});
