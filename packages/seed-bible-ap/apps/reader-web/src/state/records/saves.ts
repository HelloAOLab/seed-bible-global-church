// SAVES — ported from packages/seed-bible SavesManager (docs/porting/SavesManager.md): a save files a passage away
// (a chapter, or a verse range of it) with an optional label and an optional folder (the old categories); one
// bucket for the whole collection.
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
  /** The reader's grouping; absent means unfiled. */
  folder?: string;
  createdAt: string;
}

const isChapterPassage = (p: string) =>
  p.split(".").length === 2 && !p.includes("-");

export function toSaves(items: readonly unknown[]): SaveView[] {
  return (
    (items as Save[])
      .filter((it) => it["@type"] === "seed:Save" && !it.deleted)
      .map((it, index) => {
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
          ...(it.folder ? { folder: it.folder } : {}),
          createdAt: it.createdAt ?? it.updatedAt ?? "",
          index,
        };
      })
      // Newest first; two saves made in the same instant keep their order of making.
      .sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.index - a.index
      )
      .map(({ index: _i, ...s }) => s)
  );
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
  /** The folders in use, sorted; the unfiled saves are not a folder. */
  const folders: ReadonlySignal<string[]> = computed(() =>
    [
      ...new Set(
        all.value.map((s) => s.folder).filter((f): f is string => !!f)
      ),
    ].sort((a, b) => a.localeCompare(b))
  );

  async function add(
    passage: string,
    edition?: string,
    label?: string,
    folder?: string
  ): Promise<string> {
    const id = `urn:seed:save:${passage}:${newOpId()}`;
    const item: Save = {
      "@id": id,
      "@type": "seed:Save",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      ...(edition ? { ofEdition: edition } : {}),
      ...(label ? { label } : {}),
      ...(folder?.trim() ? { folder: folder.trim() } : {}),
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("saves", undefined, item);
    return id;
  }

  /** A save relabelled or moved to a folder (an empty folder unfiles it); a plain update from this device's copy. */
  async function update(
    id: string,
    patch: { label?: string | null; folder?: string | null }
  ) {
    const cur = (ob.bucket.value["@graph"] as Save[]).find(
      (it) => it["@id"] === id && !it.deleted
    );
    if (!cur) return;
    const { label: _l, folder: _f, ...rest } = cur;
    const label =
      patch.label === undefined ? cur.label : patch.label?.trim() || undefined;
    const folder =
      patch.folder === undefined
        ? cur.folder
        : patch.folder?.trim() || undefined;
    await buckets.put("saves", undefined, {
      ...rest,
      ...(label ? { label } : {}),
      ...(folder ? { folder } : {}),
      opId: newOpId(),
      supersedes: cur.opId,
      updatedAt: nowIso(),
    });
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

  return { all, forPassage, folders, add, update, remove, toggle };
}

export type Saves = ReturnType<typeof createSaves>;
