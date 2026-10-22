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

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
      throw new Error("a file is 1 byte to 5 MB");
    uploading.value = true;
    try {
      const put = await backend.uploadFile(
        file.name,
        file.type || "application/octet-stream",
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
