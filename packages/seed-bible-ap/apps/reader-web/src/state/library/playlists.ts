// PLAYLISTS — ordered passages, notes and links (seed:Playlist). Private works in the reader's Library; playing
// one walks the reader through its items; publishing makes it a released slice the registry indexes.
import { computed, signal } from "@preact/signals";
import { Playlist, type PlaylistItem } from "@seed/seed-schema";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "../records/buckets";
import { newOpId, nowIso } from "../records/marks";
import { createWorks } from "./works";
import { retainPlayHistory, type PlayHistoryEntry } from "./playHistory";

const HISTORY_KEY = "playlists:history";

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
  /** The playlist just played to its end (the old reader's "You've reached the end of …"); null otherwise. */
  const finished = signal<string | null>(null);
  /** The playing item's note folded away (Hide note); it comes back with Show note or the next item. */
  const noteHidden = signal(false);
  /** One row per playlist played on this device (playHistory.ts). */
  const history = signal<PlayHistoryEntry[]>([]);
  void stores.prefs
    .get(HISTORY_KEY)
    .then((v) => (history.value = (v as PlayHistoryEntry[] | undefined) ?? []))
    .catch(() => undefined);
  /** A queue that is not a saved playlist (a plan's day, read straight through), and what to do at its end. */
  const queue = signal<Playlist | null>(null);
  let onQueueEnd: (() => void) | null = null;
  const current = computed(() => {
    const p = playing.value;
    if (!p) return null;
    const q = queue.value;
    const pl = q && q["@id"] === p.playlistId ? q : works.byId(p.playlistId);
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
    const next: Playlist = { ...pl, ...patch };
    // A field set to nothing (a removed cover, a cleared description) leaves the record.
    if (!next.heroImage) delete next.heroImage;
    if (!next.description) delete next.description;
    await works.save(next);
  }

  const addItem = (id: string, item: PlaylistItem) =>
    update(id, { hasItem: [...(works.byId(id)?.hasItem ?? []), item] });
  const removeItem = (id: string, index: number) =>
    update(id, {
      hasItem: (works.byId(id)?.hasItem ?? []).filter((_, i) => i !== index),
    });
  /** One item re-written in place (a note's text, a link's label or embed, a passage's note). */
  const updateItem = (id: string, index: number, item: PlaylistItem) =>
    update(id, {
      hasItem: (works.byId(id)?.hasItem ?? []).map((it, i) =>
        i === index ? item : it
      ),
    });
  const moveItem = (id: string, from: number, to: number) => {
    const items = [...(works.byId(id)?.hasItem ?? [])];
    const [it] = items.splice(from, 1);
    if (it) items.splice(to, 0, it);
    return update(id, { hasItem: items });
  };

  const itemLabel = (it: PlaylistItem | undefined): string => {
    if (!it) return "";
    const r = it as Record<string, unknown>;
    if (typeof r["label"] === "string" && r["label"]) return r["label"];
    if (typeof r["aboutPassage"] === "string") return r["aboutPassage"];
    if (typeof r["html"] === "string")
      return r["html"]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
    if (typeof r["url"] === "string") return r["url"];
    return "";
  };
  /** Write this play into the history: a new row when it starts, the step and the time as it goes, the end when it stops. */
  function record(
    id: string,
    index: number,
    opts: { start?: boolean; end?: boolean } = {}
  ) {
    const pl = works.byId(id);
    if (!pl) return;
    const now = Date.now();
    const prev = history.value.find((h) => h.playlistId === id);
    const startedAt = opts.start || !prev ? now : prev.startedAt;
    const row: PlayHistoryEntry = {
      playlistId: id,
      title: pl.label,
      totalSteps: pl.hasItem.length,
      currentStep: index,
      lastItem: itemLabel(pl.hasItem[index]),
      startedAt,
      ...(opts.end ? { endedAt: now } : {}),
      durationMs: now - startedAt,
    };
    history.value = retainPlayHistory([
      row,
      ...history.value.filter((h) => h.playlistId !== id),
    ]);
    void stores.prefs.set(HISTORY_KEY, history.value).catch(() => undefined);
  }

  function play(id: string, index = 0) {
    finished.value = null;
    noteHidden.value = false;
    playing.value = works.byId(id) ? { playlistId: id, index } : null;
    if (playing.value) record(id, index, { start: true });
  }
  /** On to the next item; past the last one the playlist is finished. */
  function next() {
    const c = current.value;
    if (!c) return;
    noteHidden.value = false;
    if (c.index + 1 < c.count) {
      playing.value = { playlistId: c.playlist["@id"], index: c.index + 1 };
      if (queue.value?.["@id"] !== c.playlist["@id"])
        record(c.playlist["@id"], c.index + 1);
      return;
    }
    playing.value = null;
    if (queue.value?.["@id"] === c.playlist["@id"]) {
      const end = onQueueEnd;
      queue.value = null;
      onQueueEnd = null;
      end?.();
      return;
    }
    record(c.playlist["@id"], c.index, { end: true });
    finished.value = c.playlist["@id"];
  }

  /** Read a set of items in turn as if they were a playlist (not kept, not in the history). */
  function playItems(
    label: string,
    items: PlaylistItem[],
    start = 0,
    onEnd?: () => void
  ) {
    if (!items.length) return;
    const q: Playlist = {
      "@id": `urn:seed:queue:${newOpId()}`,
      "@type": "seed:Playlist",
      publishedBy: identity()?.agent ?? LOCAL_AGENT,
      label,
      hasItem: items,
    };
    queue.value = q;
    onQueueEnd = onEnd ?? null;
    finished.value = null;
    noteHidden.value = false;
    playing.value = {
      playlistId: q["@id"],
      index: Math.min(Math.max(start, 0), items.length - 1),
    };
  }
  function prev() {
    const c = current.value;
    if (c && c.index > 0) {
      noteHidden.value = false;
      playing.value = { playlistId: c.playlist["@id"], index: c.index - 1 };
      if (queue.value?.["@id"] !== c.playlist["@id"])
        record(c.playlist["@id"], c.index - 1);
    }
  }
  const stop = () => {
    const p = playing.value;
    if (p && queue.value?.["@id"] !== p.playlistId)
      record(p.playlistId, p.index, { end: true });
    queue.value = null;
    onQueueEnd = null;
    playing.value = null;
  };
  /** Forget the history on this device. */
  const clearHistory = () => {
    history.value = [];
    void stores.prefs.set(HISTORY_KEY, []).catch(() => undefined);
  };

  return {
    ...works,
    playing,
    current,
    finished,
    noteHidden,
    history,
    clearHistory,
    create,
    update,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    play,
    playItems,
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
