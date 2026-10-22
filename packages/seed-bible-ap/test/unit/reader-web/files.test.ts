// Files: an upload goes through the workspace, content-addressed, and leaves a seed:GalleryImage work the reader
// keeps; a link preview is read once and remembered on the device.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createFiles } from "../../../apps/reader-web/src/state/library/files";

const READER = {
  agent: "0x" + "55".repeat(20),
  name: "Seed Reader",
  wire: true,
};

describe("files", () => {
  it("uploads an image and catalogs it as a gallery work", async () => {
    const backend = createDevBackend(READER);
    const files = createFiles(backend, memoryStores(), () => READER);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const img = await files.upload({
      name: "cover.png",
      type: "image/png",
      arrayBuffer: async () => bytes.buffer,
    });
    expect(img["@type"]).toBe("seed:GalleryImage");
    expect(img.url).toMatch(
      new RegExp(`^https://files.test/${READER.agent}/[a-f0-9]{64}$`)
    );
    expect(img.contentHash).toHaveLength(64);
    expect(img.size).toBe(bytes.byteLength);
    expect(files.gallery.live().map((g) => g.label)).toEqual(["cover.png"]);
    expect([...backend.works.keys()][0]).toContain("seed-bible/files/");
  });

  it("refuses an empty or oversized file before asking anyone", async () => {
    const backend = createDevBackend(READER);
    const files = createFiles(backend, memoryStores(), () => READER);
    await expect(
      files.upload({
        name: "e",
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    ).rejects.toThrow(/1 byte/);
    expect(backend.calls).toHaveLength(0);
  });

  it("reads a link preview once and remembers it on the device", async () => {
    const backend = createDevBackend(READER);
    const stores = memoryStores();
    const files = createFiles(backend, stores, () => READER);
    const p1 = await files.preview("https://example.org/a");
    expect(p1.title).toBe("Preview of example.org");
    const again = createFiles(backend, stores, () => READER);
    const p2 = await again.preview("https://example.org/a");
    expect(p2).toEqual(p1);
    expect(await stores.prefs.get("preview:https://example.org/a")).toEqual(p1);
  });
});
