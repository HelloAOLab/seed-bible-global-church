// BOOKMARKS — one bucket for the whole collection (`seed-bible/bookmarks/bookmarks.jsonld`); a bookmark names a
// chapter. Toggling the current chapter's bookmark is the first-cut UX (the colours and names of the old
// BookmarksManager follow with the Today pane).
import { computed, type ReadonlySignal } from "@preact/signals";
import type { Bookmark } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso } from "./marks";

export interface BookmarkView {
  id: string;
  chapter: string;
  name: string;
  updatedAt: string;
}

export function toBookmarks(items: readonly unknown[]): BookmarkView[] {
  return (items as Bookmark[])
    .filter((it) => it["@type"] === "seed:Bookmark" && !it.deleted)
    .map((it) => ({
      id: it["@id"],
      chapter: chapterOf(it.aboutPassage),
      name: it.bookmarkName,
      updatedAt: it.updatedAt ?? it.createdAt ?? "",
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createBookmarks(
  buckets: BucketStore,
  identity: () => ReaderIdentity | null
) {
  const ob = buckets.get("bookmarks");
  const all: ReadonlySignal<BookmarkView[]> = computed(() =>
    toBookmarks(ob.bucket.value["@graph"])
  );
  const onChapter = (chapterRef: string) =>
    all.value.filter((b) => b.chapter === chapterOf(chapterRef));

  async function add(chapterRef: string, name: string) {
    const chapter = chapterOf(chapterRef);
    const item: Bookmark = {
      "@id": `urn:seed:bookmark:${chapter}:${newOpId()}`,
      "@type": "seed:Bookmark",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: chapter,
      bookmarkName: name,
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("bookmarks", undefined, item);
  }

  async function remove(id: string) {
    const cur = (ob.bucket.value["@graph"] as Bookmark[]).find(
      (it) => it["@id"] === id
    );
    if (!cur) return;
    await buckets.put("bookmarks", undefined, {
      ...cur,
      deleted: true,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  /** The chapter's bookmark toggled: removed when one exists, else added with the given name. */
  async function toggle(chapterRef: string, name: string) {
    const here = onChapter(chapterRef);
    if (here.length) for (const b of here) await remove(b.id);
    else await add(chapterRef, name);
  }

  return { all, onChapter, add, remove, toggle };
}

export type Bookmarks = ReturnType<typeof createBookmarks>;
