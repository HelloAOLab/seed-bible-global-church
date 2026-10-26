// SAVES — ported from packages/seed-bible SavesManager (docs/porting/SavesManager.md): a save files a passage away
// (a chapter, or a verse range of it) with an optional label, in one or several folders (the old categories; none
// means My Saves, the default); one bucket for the whole collection. Folders with nothing in them yet are kept on
// this device until something is saved there.
import { computed, signal, type ReadonlySignal } from "@preact/signals";
import type { KeyValueStore } from "../../backend/offline/db";
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
  /** The first of its folders (absent: My Saves only) — kept for the places that show one. */
  folder?: string;
  /** Every folder it is in; empty means My Saves. */
  folders: string[];
  createdAt: string;
}

/** The default folder: a save in no named folder is here. */
export const MY_SAVES = "My Saves";
const EMPTY_FOLDERS_KEY = "saves:empty-folders";

const foldersOf = (folder: Save["folder"]): string[] =>
  folder === undefined ? [] : Array.isArray(folder) ? folder : [folder];

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
          ...(foldersOf(it.folder)[0]
            ? { folder: foldersOf(it.folder)[0] }
            : {}),
          folders: foldersOf(it.folder),
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
  identity: () => ReaderIdentity | null,
  prefs?: KeyValueStore<unknown>
) {
  const ob = buckets.get("saves");
  const all: ReadonlySignal<SaveView[]> = computed(() =>
    toSaves(ob.bucket.value["@graph"])
  );

  const forPassage = (passage: string) =>
    all.value.filter((s) => s.passage === passage);
  /** Folders this device knows besides those in use: made empty, or emptied — a folder stays until deleted. */
  const empty = signal<string[]>([]);
  void prefs?.get(EMPTY_FOLDERS_KEY).then((v) => {
    if (Array.isArray(v)) empty.value = v.filter((x) => typeof x === "string");
  });
  const keepEmpty = (names: string[]) => {
    empty.value = names;
    void prefs?.set(EMPTY_FOLDERS_KEY, names);
  };
  /** Folders being renamed or deleted: their saves leaving them must not keep them. */
  const leaving = new Set<string>();
  const remember = (names: string[]) => {
    const add = names.filter(
      (n) => n !== MY_SAVES && !leaving.has(n) && !empty.value.includes(n)
    );
    if (add.length) keepEmpty([...empty.value, ...add]);
  };
  /** Every folder: My Saves first, then the rest by name — those in use and those made empty. */
  const folders: ReadonlySignal<string[]> = computed(() => {
    const used = all.value.flatMap((s) => s.folders);
    const named = [...new Set([...used, ...empty.value])]
      .filter((f) => f !== MY_SAVES)
      .sort((a, b) => a.localeCompare(b));
    return [MY_SAVES, ...named];
  });
  /** What a save keeps for a chosen set: nothing for My Saves alone. */
  const stored = (names: string[]): string[] => {
    const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    return clean.length === 1 && clean[0] === MY_SAVES ? [] : clean;
  };
  const folderField = (names: string[]) => {
    const keep = stored(names);
    return keep.length === 0
      ? {}
      : { folder: keep.length === 1 ? keep[0]! : keep };
  };

  async function add(
    passage: string,
    edition?: string,
    label?: string,
    folder?: string | string[]
  ): Promise<string> {
    const id = `urn:seed:save:${passage}:${newOpId()}`;
    const item: Save = {
      "@id": id,
      "@type": "seed:Save",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: passage,
      ...(edition ? { ofEdition: edition } : {}),
      ...(label ? { label } : {}),
      ...folderField(
        folder === undefined ? [] : Array.isArray(folder) ? folder : [folder]
      ),
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
    patch: {
      label?: string | null;
      folder?: string | null;
      folders?: string[];
    }
  ) {
    const cur = (ob.bucket.value["@graph"] as Save[]).find(
      (it) => it["@id"] === id && !it.deleted
    );
    if (!cur) return;
    const { label: _l, folder: _f, ...rest } = cur;
    const label =
      patch.label === undefined ? cur.label : patch.label?.trim() || undefined;
    const names =
      patch.folders !== undefined
        ? patch.folders
        : patch.folder === undefined
          ? foldersOf(cur.folder)
          : patch.folder?.trim()
            ? [patch.folder.trim()]
            : [];
    remember(foldersOf(cur.folder));
    await buckets.put("saves", undefined, {
      ...rest,
      ...(label ? { label } : {}),
      ...folderField(names),
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
    remember(foldersOf(cur.folder));
    await buckets.put("saves", undefined, {
      ...cur,
      deleted: true,
      // The write this delete replaces: a plain update for the merge, whatever the clocks say.
      supersedes: cur.opId,
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

  /** A folder made before anything is saved in it. */
  function createFolder(name: string) {
    const n = name.trim();
    if (!n || folders.value.includes(n)) return;
    keepEmpty([...empty.value, n]);
  }

  /** A folder renamed: every save in it moves with it. */
  async function renameFolder(from: string, to: string) {
    const n = to.trim();
    if (!n || from === MY_SAVES || n === from || folders.value.includes(n))
      return;
    leaving.add(from);
    keepEmpty([...empty.value.filter((f) => f !== from), n]);
    try {
      for (const sv of all.value.filter((x) => x.folders.includes(from)))
        await update(sv.id, {
          folders: sv.folders.map((f) => (f === from ? n : f)),
        });
    } finally {
      leaving.delete(from);
    }
  }

  /** A folder deleted: its saves leave it (one in no other folder goes back to My Saves). */
  async function deleteFolder(name: string) {
    if (name === MY_SAVES) return;
    leaving.add(name);
    keepEmpty(empty.value.filter((f) => f !== name));
    try {
      for (const sv of all.value.filter((x) => x.folders.includes(name)))
        await update(sv.id, { folders: sv.folders.filter((f) => f !== name) });
    } finally {
      leaving.delete(name);
    }
  }

  /** The folders a save is in, as the picker shows them: My Saves when none. */
  const shownFolders = (sv: SaveView) =>
    sv.folders.length ? sv.folders : [MY_SAVES];
  /** Whether a save is listed under a folder. */
  const inFolder = (sv: SaveView, name: string) =>
    shownFolders(sv).includes(name);

  return {
    all,
    forPassage,
    folders,
    add,
    update,
    remove,
    toggle,
    createFolder,
    renameFolder,
    deleteFolder,
    shownFolders,
    inFolder,
  };
}

export type Saves = ReturnType<typeof createSaves>;
