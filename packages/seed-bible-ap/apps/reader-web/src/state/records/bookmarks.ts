// BOOKMARKS — one bucket for the whole collection (`seed-bible/bookmarks/bookmarks.jsonld`); a bookmark names a
// chapter, with a name and a colour of the reader's choosing (the old BookmarksManager's), both editable in place.
import { computed, type ReadonlySignal } from "@preact/signals";
import { conceptIri, type Bookmark } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso } from "./marks";

export interface BookmarkView {
  id: string;
  chapter: string;
  name: string;
  /** A highlight colour id (`yellow`, …), when the reader chose one. */
  colorId?: string;
  updatedAt: string;
}

const COLOR_PREFIX = conceptIri("highlightcolor", "");
const colorIdOf = (iri: string | undefined) =>
  iri?.startsWith(COLOR_PREFIX) ? iri.slice(COLOR_PREFIX.length) : undefined;

export function toBookmarks(items: readonly unknown[]): BookmarkView[] {
  return (items as Bookmark[])
    .filter((it) => it["@type"] === "seed:Bookmark" && !it.deleted)
    .map((it) => ({
      id: it["@id"],
      chapter: chapterOf(it.aboutPassage),
      name: it.bookmarkName,
      ...(colorIdOf(it.bookmarkColor)
        ? { colorId: colorIdOf(it.bookmarkColor) }
        : {}),
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

  async function add(chapterRef: string, name: string, colorId?: string) {
    const chapter = chapterOf(chapterRef);
    const item: Bookmark = {
      "@id": `urn:seed:bookmark:${chapter}:${newOpId()}`,
      "@type": "seed:Bookmark",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: chapter,
      bookmarkName: name,
      ...(colorId
        ? { bookmarkColor: conceptIri("highlightcolor", colorId) }
        : {}),
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("bookmarks", undefined, item);
  }

  /** A bookmark renamed or recoloured in place (a plain update from the copy on this device). */
  async function update(
    id: string,
    patch: { name?: string; colorId?: string | null }
  ) {
    const cur = (ob.bucket.value["@graph"] as Bookmark[]).find(
      (it) => it["@id"] === id && !it.deleted
    );
    if (!cur) return;
    const { bookmarkColor: _drop, ...rest } = cur;
    const color =
      patch.colorId === undefined ? cur.bookmarkColor : patch.colorId;
    await buckets.put("bookmarks", undefined, {
      ...rest,
      bookmarkName: patch.name?.trim() || cur.bookmarkName,
      ...(color
        ? {
            bookmarkColor: color.startsWith(COLOR_PREFIX)
              ? color
              : conceptIri("highlightcolor", color),
          }
        : {}),
      opId: newOpId(),
      supersedes: cur.opId,
      updatedAt: nowIso(),
    });
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

  return { all, onChapter, add, update, remove, toggle };
}

export type Bookmarks = ReturnType<typeof createBookmarks>;
