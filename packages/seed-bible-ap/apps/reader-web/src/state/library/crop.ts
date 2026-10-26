// CROPPING A PICTURE — the old PhotoCropModal / LogoCropModal without their editor library: the picture is placed
// in a window of the target's shape, zoomed and dragged, and drawn at the target's stored size. Zoom 1 fills the
// window (a photo); a logo may zoom out until the whole picture fits, leaving the rest transparent.

export interface CropTarget {
  /** Stored size, in pixels. */
  width: number;
  height: number;
  /** The editor window, the same shape as the stored size. */
  previewWidth: number;
  previewHeight: number;
  /** A round mask in the editor (the stored file stays square; a round avatar is CSS's job). */
  round: boolean;
  /** How far out a picture may zoom: 1 always fills the window; less lets the whole picture fit. */
  minZoom: number;
  mimeType: "image/png" | "image/jpeg";
  quality?: number;
  fileName: string;
}

export const PROFILE_PICTURE: CropTarget = {
  width: 256,
  height: 256,
  previewWidth: 256,
  previewHeight: 256,
  round: true,
  minZoom: 1,
  mimeType: "image/png",
  fileName: "profile-picture.png",
};

export const COVER_IMAGE: CropTarget = {
  width: 1024,
  height: 768,
  previewWidth: 288,
  previewHeight: 216,
  round: false,
  minZoom: 1,
  mimeType: "image/jpeg",
  quality: 0.85,
  fileName: "cover-image.jpg",
};

export const LOGO: CropTarget = {
  width: 256,
  height: 256,
  previewWidth: 256,
  previewHeight: 256,
  round: false,
  minZoom: 0.25,
  mimeType: "image/png",
  fileName: "logo.png",
};

export const MAX_ZOOM = 4;

export interface Placement {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** The picture's scale at a zoom: 1 is the smallest scale that still fills the window. */
const scaleOf = (
  img: { width: number; height: number },
  t: CropTarget,
  zoom: number
) => Math.max(t.previewWidth / img.width, t.previewHeight / img.height) * zoom;

/**
 * A drag kept in bounds: a picture larger than the window always covers it; one smaller than the window
 * (a logo zoomed out) stays inside it.
 */
export function clampPan(
  img: { width: number; height: number },
  t: CropTarget,
  zoom: number,
  pan: { x: number; y: number }
): { x: number; y: number } {
  const s = scaleOf(img, t, zoom);
  const room = (size: number, win: number) => Math.abs(size * s - win) / 2;
  const clamp = (v: number, r: number) => Math.max(-r, Math.min(r, v));
  return {
    x: clamp(pan.x, room(img.width, t.previewWidth)),
    y: clamp(pan.y, room(img.height, t.previewHeight)),
  };
}

/**
 * Where the picture is drawn, in a canvas `k` times the editor window (1 for the editor, width/previewWidth for
 * the stored file). The pan is in editor pixels from centred.
 */
export function placement(
  img: { width: number; height: number },
  t: CropTarget,
  zoom: number,
  pan: { x: number; y: number },
  k = 1
): Placement {
  const s = scaleOf(img, t, zoom);
  const p = clampPan(img, t, zoom, pan);
  const dw = img.width * s * k;
  const dh = img.height * s * k;
  return {
    dx: ((t.previewWidth - img.width * s) / 2 + p.x) * k,
    dy: ((t.previewHeight - img.height * s) / 2 + p.y) * k,
    dw,
    dh,
  };
}
