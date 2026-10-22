// ANNOTATIONS (notes) — a chapter's live `seed:Annotation` items. A note edited on two devices comes back from
// the merge twice: the copy flagged `conflictOf` is shown beside the original and the reader keeps one. Plain text
// for now (the TipTap editor is ported in a later cut — docs/porting/AnnotationsManager.md).
import { computed, type ReadonlySignal } from "@preact/signals";
import type { Annotation } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso, passageOf, spanOf } from "./marks";

export interface Note {
  id: string;
  start: number;
  end: number;
  note: string;
  updatedAt: string;
  /** Set on the copy a merge kept beside the one it collided with. */
  conflictOf?: string;
}

export function toNotes(items: readonly unknown[]): Note[] {
  const out: Note[] = [];
  for (const it of items as Annotation[]) {
    if (it["@type"] !== "seed:Annotation" || it.deleted) continue;
    const { start, end } = spanOf(it.aboutPassage);
    out.push({
      id: it["@id"],
      start,
      end,
      note: it.note,
      updatedAt: it.updatedAt ?? it.createdAt ?? "",
      ...(it.conflictOf ? { conflictOf: it.conflictOf } : {}),
    });
  }
  return out.sort(
    (a, b) => a.start - b.start || a.updatedAt.localeCompare(b.updatedAt)
  );
}

export function createAnnotations(
  buckets: BucketStore,
  identity: () => ReaderIdentity | null
) {
  const cache = new Map<string, ReadonlySignal<Note[]>>();

  function forChapter(chapterRef: string): ReadonlySignal<Note[]> {
    const c = chapterOf(chapterRef);
    let s = cache.get(c);
    if (!s) {
      const ob = buckets.get("annotations", c);
      s = computed(() => toNotes(ob.bucket.value["@graph"]));
      cache.set(c, s);
    }
    return s;
  }

  const find = (chapter: string, id: string) =>
    (
      buckets.get("annotations", chapter).bucket.value["@graph"] as Annotation[]
    ).find((it) => it["@id"] === id && it["@type"] === "seed:Annotation");

  async function add(
    chapterRef: string,
    start: number,
    end: number,
    note: string
  ): Promise<string> {
    const chapter = chapterOf(chapterRef);
    const id = `urn:seed:note:${chapter}:${newOpId()}`;
    const item: Annotation = {
      "@id": id,
      "@type": "seed:Annotation",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passageOf(chapter, start, end),
      note,
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("annotations", chapter, item);
    return id;
  }

  async function edit(chapterRef: string, id: string, note: string) {
    const chapter = chapterOf(chapterRef);
    const cur = find(chapter, id);
    if (!cur) throw new Error(`no note ${id} in ${chapter}`);
    await buckets.put("annotations", chapter, {
      ...cur,
      note,
      supersedes: cur.opId,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  async function remove(chapterRef: string, id: string) {
    const chapter = chapterOf(chapterRef);
    const cur = find(chapter, id);
    if (!cur) return;
    await buckets.put("annotations", chapter, {
      ...cur,
      deleted: true,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  /** Keep one side of a conflict: the other copy is tombstoned; keeping the flagged copy adopts its text into the original. */
  async function resolve(chapterRef: string, keepId: string) {
    const chapter = chapterOf(chapterRef);
    const keep = find(chapter, keepId);
    if (!keep) return;
    if (keep.conflictOf) {
      await edit(chapter, keep.conflictOf, keep.note);
      await remove(chapter, keepId);
      return;
    }
    const copies = (
      buckets.get("annotations", chapter).bucket.value["@graph"] as Annotation[]
    ).filter(
      (it) =>
        it["@type"] === "seed:Annotation" &&
        it.conflictOf === keepId &&
        !it.deleted
    );
    for (const c of copies) await remove(chapter, c["@id"]);
  }

  return { forChapter, add, edit, remove, resolve };
}

export type Annotations = ReturnType<typeof createAnnotations>;
