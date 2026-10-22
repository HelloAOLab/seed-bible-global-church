// PLAYLISTS — ordered passages, notes and links (seed:Playlist). Private works in the reader's Library; playing
// one walks the reader through its items; publishing makes it a released slice the registry indexes.
import { computed, signal } from "@preact/signals";
import { Playlist, type PlaylistItem } from "@seed/seed-schema";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "../records/buckets";
import { newOpId, nowIso } from "../records/marks";
import { createWorks } from "./works";

export interface Playing {
  playlistId: string;
  index: number;
}

export function createPlaylists(
  backend: ReaderBackend,
  stores: ReaderStores,
  identity: () => { agent: string } | null
) {
  const works = createWorks<Playlist>(
    "seed-bible/playlists",
    backend,
    stores,
    (raw) => Playlist.parse(raw)
  );
  const playing = signal<Playing | null>(null);
  const current = computed(() => {
    const p = playing.value;
    if (!p) return null;
    const pl = works.byId(p.playlistId);
    const item = pl?.hasItem[p.index];
    return pl && item
      ? { playlist: pl, item, index: p.index, count: pl.hasItem.length }
      : null;
  });

  async function create(
    label: string,
    items: PlaylistItem[] = [],
    description?: string
  ): Promise<Playlist> {
    const doc: Playlist = {
      "@id": `urn:seed:playlist:${newOpId()}`,
      "@type": "seed:Playlist",
      publishedBy: identity()?.agent ?? LOCAL_AGENT,
      label,
      ...(description ? { description } : {}),
      hasItem: items,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await works.save(doc);
    return doc;
  }

  async function update(
    id: string,
    patch: Partial<
      Pick<Playlist, "label" | "description" | "hasItem" | "heroImage">
    >
  ) {
    const pl = works.byId(id);
    if (!pl) throw new Error("no such playlist");
    await works.save({ ...pl, ...patch });
  }

  const addItem = (id: string, item: PlaylistItem) =>
    update(id, { hasItem: [...(works.byId(id)?.hasItem ?? []), item] });
  const removeItem = (id: string, index: number) =>
    update(id, {
      hasItem: (works.byId(id)?.hasItem ?? []).filter((_, i) => i !== index),
    });
  const moveItem = (id: string, from: number, to: number) => {
    const items = [...(works.byId(id)?.hasItem ?? [])];
    const [it] = items.splice(from, 1);
    if (it) items.splice(to, 0, it);
    return update(id, { hasItem: items });
  };

  function play(id: string, index = 0) {
    playing.value = works.byId(id) ? { playlistId: id, index } : null;
  }
  function next() {
    const c = current.value;
    if (c && c.index + 1 < c.count)
      playing.value = { playlistId: c.playlist["@id"], index: c.index + 1 };
  }
  function prev() {
    const c = current.value;
    if (c && c.index > 0)
      playing.value = { playlistId: c.playlist["@id"], index: c.index - 1 };
  }
  const stop = () => (playing.value = null);

  return {
    ...works,
    playing,
    current,
    create,
    update,
    addItem,
    removeItem,
    moveItem,
    play,
    next,
    prev,
    stop,
  };
}

export type Playlists = ReturnType<typeof createPlaylists>;

/** The first Scripture item's chapter — what a published playlist is indexed under. */
export function firstPassageOf(items: PlaylistItem[]): string | null {
  for (const it of items)
    if (it["@type"] === "seed:ScriptureItem") return it.aboutPassage;
  return null;
}
