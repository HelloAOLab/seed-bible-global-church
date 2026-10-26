// BOOKMARKS — one bucket for the whole collection (`seed-bible/bookmarks/bookmarks.jsonld`). As in the old
// BookmarksManager a bookmark is a named, coloured marker for where you are that you move forward as you read: it
// points at one chapter in one translation, moving it replaces where it was, and there are at most five of them
// (Saves is where things pile up). Several may sit on the same chapter.
import { computed, type ReadonlySignal } from "@preact/signals";
import { conceptIri, type Bookmark } from "@seed/seed-schema";
import { chapterOf } from "@seed/seed-protocol";
import type { ReaderIdentity } from "../../backend/ReaderBackend";
import { LOCAL_AGENT, type BucketStore } from "./buckets";
import { newOpId, nowIso } from "./marks";

/** A soft cap: it stops making a sixth, but a list already longer (from another device) is kept whole. */
export const MAX_BOOKMARKS = 5;

/** The old reader's bookmark colours, in its order; a new bookmark takes the first one not in use. */
export const BOOKMARK_COLOR_IDS = [
  "orange",
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;
export const DEFAULT_BOOKMARK_COLOR_ID = "orange";

/** The CSS colour of a bookmark: its own when it is one of the six, else the default (the old reader's rule). */
export function bookmarkColorValue(colorId: string | undefined): string {
  const id = (BOOKMARK_COLOR_IDS as readonly string[]).includes(colorId ?? "")
    ? colorId
    : DEFAULT_BOOKMARK_COLOR_ID;
  return `var(--sb-bookmark-${id}-color)`;
}

export interface BookmarkView {
  id: string;
  chapter: string;
  /** The translation it was placed in (a chapter in two translations is two places to come back to). */
  edition?: string;
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
      ...(it.ofEdition ? { edition: it.ofEdition } : {}),
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
  /** The bookmarks on a chapter — in that translation, when one is named (one placed before translations were kept counts in any). */
  const onChapter = (chapterRef: string, edition?: string) =>
    all.value.filter(
      (b) =>
        b.chapter === chapterOf(chapterRef) &&
        (!edition || !b.edition || b.edition === edition)
    );

  const canCreate = computed(() => all.value.length < MAX_BOOKMARKS);

  async function add(
    chapterRef: string,
    name: string,
    colorId?: string,
    edition?: string
  ) {
    if (!canCreate.value || !name.trim()) return;
    const chapter = chapterOf(chapterRef);
    const item: Bookmark = {
      "@id": `urn:seed:bookmark:${chapter}:${newOpId()}`,
      "@type": "seed:Bookmark",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: chapter,
      ...(edition ? { ofEdition: edition } : {}),
      bookmarkName: name.trim(),
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
      // The write this delete replaces: a plain update for the merge, whatever the clocks say.
      supersedes: cur.opId,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  /** A bookmark moved to a chapter (and translation): it leaves where it was and comes first, as just moved. */
  async function move(id: string, chapterRef: string, edition?: string) {
    const cur = (ob.bucket.value["@graph"] as Bookmark[]).find(
      (it) => it["@id"] === id && !it.deleted
    );
    if (!cur) return;
    const { ofEdition: _e, ...rest } = cur;
    await buckets.put("bookmarks", undefined, {
      ...rest,
      aboutPassage: chapterOf(chapterRef),
      ...(edition ? { ofEdition: edition } : {}),
      opId: newOpId(),
      supersedes: cur.opId,
      updatedAt: nowIso(),
    });
  }

  /** The name and colour a new bookmark is offered: "My bookmark" (or the first free "My bookmark n") in the first colour not in use. */
  function nextDraft(
    myBookmark: string,
    numbered: (n: number) => string
  ): { name: string; colorId: string } {
    const names = new Set(all.value.map((b) => b.name));
    let name = myBookmark;
    for (let n = 2; names.has(name); n++) name = numbered(n);
    const used = new Set(all.value.map((b) => b.colorId));
    const colorId =
      BOOKMARK_COLOR_IDS.find((c) => !used.has(c)) ?? DEFAULT_BOOKMARK_COLOR_ID;
    return { name, colorId };
  }

  return {
    all,
    onChapter,
    canCreate,
    add,
    update,
    move,
    remove,
    nextDraft,
  };
}

export type Bookmarks = ReturnType<typeof createBookmarks>;
