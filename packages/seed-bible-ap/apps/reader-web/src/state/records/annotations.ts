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
  /** The verses it is on; 0 and 0 for a note on the whole chapter (`whole`). */
  start: number;
  end: number;
  /** A note on the whole chapter, not on verses (the old reader's note with no verse). */
  whole?: boolean;
  note: string;
  updatedAt: string;
  /** Set on the copy a merge kept beside the one it collided with. */
  conflictOf?: string;
}

export function toNotes(items: readonly unknown[]): Note[] {
  const out: Note[] = [];
  for (const it of items as Annotation[]) {
    if (it["@type"] !== "seed:Annotation" || it.deleted) continue;
    const whole = it.aboutPassage === chapterOf(it.aboutPassage);
    const { start, end } = whole
      ? { start: 0, end: 0 }
      : spanOf(it.aboutPassage);
    out.push({
      id: it["@id"],
      start,
      end,
      ...(whole ? { whole: true } : {}),
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

  /** A note on verses, or on the whole chapter when `start` is 0. */
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
      aboutPassage: start > 0 ? passageOf(chapter, start, end) : chapter,
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
      // The write this delete replaces: a plain update for the merge, whatever the clocks say.
      supersedes: cur.opId,
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

  /**
   * Keep both sides of a conflict as one note (the old conflict modal's Merge): the original takes its own text
   * followed by the copy's, and the copy goes. Plain-text notes of the first cut are paragraphed first.
   */
  async function merge(chapterRef: string, copyId: string) {
    const chapter = chapterOf(chapterRef);
    const copy = find(chapter, copyId);
    if (!copy?.conflictOf) return;
    const original = find(chapter, copy.conflictOf);
    if (!original) return;
    const para = (n: string) =>
      /^\s*</.test(n)
        ? n
        : `<p>${n.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
    await edit(chapter, original["@id"], para(original.note) + para(copy.note));
    await remove(chapter, copyId);
  }

  return { forChapter, add, edit, remove, resolve, merge };
}

export type Annotations = ReturnType<typeof createAnnotations>;
