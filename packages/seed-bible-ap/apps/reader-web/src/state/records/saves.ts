// SAVES — ported from packages/seed-bible SavesManager (docs/porting/SavesManager.md): a save files a passage away
// (a chapter, or a verse range of it) with an optional label; one bucket for the whole collection. Folders
// (categories) are not in `seed:Save` yet and wait for the ontology.
import { computed, type ReadonlySignal } from "@preact/signals";
import type { Save } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso, passageOf, spanOf } from "./marks";

export interface SaveView {
  id: string;
  passage: string;
  chapter: string;
  /** Null for a whole-chapter save. */
  start: number | null;
  end: number | null;
  edition?: string;
  label?: string;
  createdAt: string;
}

const isChapterPassage = (p: string) =>
  p.split(".").length === 2 && !p.includes("-");

export function toSaves(items: readonly unknown[]): SaveView[] {
  return (items as Save[])
    .filter((it) => it["@type"] === "seed:Save" && !it.deleted)
    .map((it) => {
      const whole = isChapterPassage(it.aboutPassage);
      const span = spanOf(it.aboutPassage);
      return {
        id: it["@id"],
        passage: it.aboutPassage,
        chapter: chapterOf(it.aboutPassage),
        start: whole ? null : span.start,
        end: whole ? null : span.end,
        ...(it.ofEdition ? { edition: it.ofEdition } : {}),
        ...(it.label ? { label: it.label } : {}),
        createdAt: it.createdAt ?? it.updatedAt ?? "",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createSaves(
  buckets: BucketStore,
  identity: () => ReaderIdentity | null
) {
  const ob = buckets.get("saves");
  const all: ReadonlySignal<SaveView[]> = computed(() =>
    toSaves(ob.bucket.value["@graph"])
  );

  const forPassage = (passage: string) =>
    all.value.filter((s) => s.passage === passage);

  async function add(
    passage: string,
    edition?: string,
    label?: string
  ): Promise<string> {
    const id = `urn:seed:save:${passage}:${newOpId()}`;
    const item: Save = {
      "@id": id,
      "@type": "seed:Save",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      ...(edition ? { ofEdition: edition } : {}),
      ...(label ? { label } : {}),
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("saves", undefined, item);
    return id;
  }

  async function remove(id: string) {
    const cur = (ob.bucket.value["@graph"] as Save[]).find(
      (it) => it["@id"] === id
    );
    if (!cur) return;
    await buckets.put("saves", undefined, {
      ...cur,
      deleted: true,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  /** The passage's save toggled: removed when one exists, else added. */
  async function toggle(
    chapterRef: string,
    verses: { start: number; end: number } | null,
    edition?: string
  ) {
    const passage = verses
      ? passageOf(chapterRef, verses.start, verses.end)
      : chapterOf(chapterRef);
    const here = forPassage(passage);
    if (here.length) for (const s of here) await remove(s.id);
    else await add(passage, edition);
  }

  return { all, forPassage, add, remove, toggle };
}

export type Saves = ReturnType<typeof createSaves>;
