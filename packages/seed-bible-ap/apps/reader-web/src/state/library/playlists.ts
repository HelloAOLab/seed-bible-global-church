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
  /** One row per playlist played on this device (playHistory.ts). */
  const history = signal<PlayHistoryEntry[]>([]);
  void stores.prefs
    .get(HISTORY_KEY)
    .then((v) => (history.value = (v as PlayHistoryEntry[] | undefined) ?? []))
    .catch(() => undefined);
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
    playing.value = works.byId(id) ? { playlistId: id, index } : null;
    if (playing.value) record(id, index, { start: true });
  }
  function next() {
    const c = current.value;
    if (c && c.index + 1 < c.count) {
      playing.value = { playlistId: c.playlist["@id"], index: c.index + 1 };
      record(c.playlist["@id"], c.index + 1);
    }
  }
  function prev() {
    const c = current.value;
    if (c && c.index > 0) {
      playing.value = { playlistId: c.playlist["@id"], index: c.index - 1 };
      record(c.playlist["@id"], c.index - 1);
    }
  }
  const stop = () => {
    const p = playing.value;
    if (p) record(p.playlistId, p.index, { end: true });
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
    history,
    clearHistory,
    create,
    update,
    addItem,
    updateItem,
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
