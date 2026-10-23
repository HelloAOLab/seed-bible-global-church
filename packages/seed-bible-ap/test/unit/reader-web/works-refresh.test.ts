// RE-READING WORKS FROM THE LIBRARY: the newer copy of a work wins, so a Library read that still trails a save made a
// moment ago on this device cannot undo it; a newer copy from another device replaces the one here.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import type { ReaderBackend } from "../../../apps/reader-web/src/backend/ReaderBackend";
import { createWorks } from "../../../apps/reader-web/src/state/library/works";

interface Doc {
  "@id": string;
  label: string;
  updatedAt?: string;
}

/** A Library holding one copy of the work: what `listWorks`/`readWork` return. */
function library(held: Doc) {
  return {
    identity: () => ({ agent: "0xabc" }),
    listWorks: async () => [{ name: "w1.jsonld", id: "file-1" }],
    readWork: async () => held,
    saveWork: async () => ({ id: "file-1" }),
  } as unknown as ReaderBackend;
}

describe("re-reading works from the Library", () => {
  it("keeps this device's newer save over an older Library copy", async () => {
    const lib = library({
      "@id": "urn:w1",
      label: "old line",
      updatedAt: "2026-10-22T10:00:00Z",
    });
    const works = createWorks<Doc>(
      "seed-bible/profile",
      lib,
      memoryStores(),
      (x) => x as Doc
    );
    await works.save({ "@id": "urn:w1", label: "new line" });
    await works.refresh();
    expect(works.byId("urn:w1")?.label).toBe("new line");
  });

  it("takes a newer copy saved on another device", async () => {
    const stores = memoryStores();
    const works = createWorks<Doc>(
      "seed-bible/profile",
      library({
        "@id": "urn:w1",
        label: "from the phone",
        updatedAt: "2999-01-01T00:00:00Z",
      }),
      stores,
      (x) => x as Doc
    );
    await works.save({ "@id": "urn:w1", label: "on this computer" });
    await works.refresh();
    expect(works.byId("urn:w1")?.label).toBe("from the phone");
  });
});
