// FILES — ported in outline from packages/seed-bible UserGalleryManager and `uploadPublicFile`: an image's bytes go
// to the serving plane through the workspace (content-addressed under the reader's address); the catalog entry
// (seed:GalleryImage) is a work in the reader's Library, device-first like the others. Link previews are read by
// the serving plane and remembered on the device.
import { signal } from "@preact/signals";
import { GalleryImage } from "@seed/seed-schema";
import type { LinkPreview, ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "../records/buckets";
import { nowIso } from "../records/marks";
import { createWorks } from "./works";

/** The Library keeps the bytes (the record) and serves a public image inline up to this; a bigger picture is shrunk first. */
export const MAX_UPLOAD_BYTES = 1_400_000;
const SHRINK_EDGE = 1600;

/** A picture larger than the Library takes, re-encoded smaller on the device (a browser only; elsewhere as is). */
export async function shrinkImage(file: {
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<{ type: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.byteLength <= MAX_UPLOAD_BYTES ||
    !file.type.startsWith("image/") ||
    typeof createImageBitmap === "undefined" ||
    typeof OffscreenCanvas === "undefined"
  )
    return { type: file.type, bytes };
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: file.type })
  );
  let scale = Math.min(1, SHRINK_EDGE / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale))
    );
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.82,
    });
    const out = new Uint8Array(await blob.arrayBuffer());
    if (out.byteLength <= MAX_UPLOAD_BYTES)
      return { type: "image/jpeg", bytes: out };
    scale *= 0.7;
  }
  throw new Error("this picture is too large even after shrinking");
}

export function createFiles(
  backend: ReaderBackend,
  stores: ReaderStores,
  identity: () => { agent: string } | null
) {
  const gallery = createWorks<GalleryImage>(
    "seed-bible/files",
    backend,
    stores,
    (raw) => GalleryImage.parse(raw)
  );
  const uploading = signal(false);
  const previews = new Map<string, LinkPreview>();

  async function upload(file: {
    name: string;
    type: string;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }): Promise<GalleryImage> {
    const { type, bytes } = await shrinkImage(file);
    if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
      throw new Error("a file is 1 byte to 1.4 MB");
    uploading.value = true;
    try {
      const put = await backend.uploadFile(
        file.name,
        type || "application/octet-stream",
        bytes
      );
      const image: GalleryImage = {
        "@id": `urn:seed:image:${put.sha256}`,
        "@type": "seed:GalleryImage",
        heldBy: identity()?.agent ?? LOCAL_AGENT,
        label: file.name,
        url: put.url,
        contentType: put.contentType,
        contentHash: put.sha256,
        size: put.size,
        ...(put.libraryFile ? { libraryFile: put.libraryFile } : {}),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await gallery.save(image);
      return image;
    } finally {
      uploading.value = false;
    }
  }

  async function preview(url: string): Promise<LinkPreview> {
    const hit = previews.get(url);
    if (hit) return hit;
    const key = `preview:${url}`;
    const stored = (await stores.prefs.get(key)) as LinkPreview | undefined;
    if (stored) {
      previews.set(url, stored);
      return stored;
    }
    const p = await backend.linkPreview(url);
    previews.set(url, p);
    await stores.prefs.set(key, p);
    return p;
  }

  return { gallery, uploading, upload, preview };
}

export type Files = ReturnType<typeof createFiles>;
