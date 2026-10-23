// WORKS — the reader's playlists and reading plans as private Library documents (docs/porting/PlaylistManager.md,
// ReadingPlansManager.md): listed and read through the workspace, cached on the device, saved whole (a work is one
// document, not a bucket of items). A deleted work keeps its document with `deleted: true` so the list skips it.
import { signal } from "@preact/signals";
import type { ReaderBackend, WorkFolder } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";

export interface WorkLike {
  "@id": string;
  label: string;
  updatedAt?: string;
  deleted?: boolean;
}

export function createWorks<T extends WorkLike>(
  folder: WorkFolder,
  backend: ReaderBackend,
  stores: ReaderStores,
  parse: (raw: unknown) => T
) {
  const all = signal<T[]>([]);
  const loading = signal(false);
  const error = signal<string | null>(null);
  const loaded = signal(false);
  const cacheKey = `works:${folder}`;
  const nameOf = (id: string) =>
    `${id
      .split(":")
      .pop()!
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")}.jsonld`;

  const ready = stores.prefs.get(cacheKey).then((v) => {
    if (Array.isArray(v)) all.value = v.flatMap((x) => tryParse(x));
  });
  const tryParse = (x: unknown): T[] => {
    try {
      return [parse(x)];
    } catch {
      return [];
    }
  };
  const persist = () => stores.prefs.set(cacheKey, all.value);
  // The Library file id of each work, so a save is one run (no read first).
  const fileIds = new Map<string, string>();
  const idsKey = `${cacheKey}:ids`;
  const idsReady = stores.prefs.get(idsKey).then((v) => {
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v as Record<string, string>))
        fileIds.set(k, x);
  });
  const persistIds = () =>
    stores.prefs.set(idsKey, Object.fromEntries(fileIds));
  const live = () =>
    all.value
      .filter((w) => !w.deleted)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  /** Re-read the folder from the Library (signed in and online); the device copy stands otherwise. */
  async function refresh() {
    await ready;
    if (!backend.identity()) return;
    loading.value = true;
    error.value = null;
    try {
      const entries = await backend.listWorks(folder);
      const docs: T[] = [];
      for (const e of entries) {
        if (!e.name.endsWith(".jsonld")) continue;
        if (e.id) fileIds.set(e.name, e.id);
        const raw = await backend.readWork(folder, e.name).catch(() => null);
        if (raw) docs.push(...tryParse(raw));
      }
      // The newer copy wins for the same id — a Library read can still trail a save made a moment ago on this
      // device; works only on the device stay.
      const byId = new Map(all.value.map((w) => [w["@id"], w] as const));
      for (const d of docs) {
        const here = byId.get(d["@id"]);
        if (!here || (d.updatedAt ?? "") >= (here.updatedAt ?? ""))
          byId.set(d["@id"], d);
      }
      all.value = [...byId.values()];
      await persist();
      await persistIds();
      loaded.value = true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** Save a work: on the device at once, in the Library when signed in. */
  async function save(doc: T) {
    await ready;
    const stamped = { ...doc, updatedAt: new Date().toISOString() } as T;
    all.value = [...all.value.filter((w) => w["@id"] !== doc["@id"]), stamped];
    await persist();
    if (backend.identity()) {
      try {
        await idsReady;
        const name = nameOf(doc["@id"]);
        const out = await backend.saveWork(
          folder,
          name,
          stamped,
          fileIds.get(name)
        );
        if (out.id) {
          fileIds.set(name, out.id);
          await persistIds();
        }
        error.value = null;
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
      }
    }
  }

  async function remove(id: string) {
    const w = all.value.find((x) => x["@id"] === id);
    if (w) await save({ ...w, deleted: true } as T);
  }

  const byId = (id: string) =>
    all.value.find((w) => w["@id"] === id && !w.deleted) ?? null;

  return {
    all,
    live,
    byId,
    loading,
    error,
    loaded,
    ready,
    refresh,
    save,
    remove,
    nameOf,
  };
}

export type Works<T extends WorkLike> = ReturnType<typeof createWorks<T>>;
