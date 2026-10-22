// DISCOVER — what Seed Bible agents released for the chapter on screen (hard-problems §12, ADR-0007): the Seed
// registry answered through the workspace (`seed.workspace.discover`), never by the browser reaching the registry.
// Bodies (the markdown beside a descriptor) are read through the workspace's public read lane on demand.
import { signal } from "@preact/signals";
import type { ReaderBackend } from "../../backend/ReaderBackend";

export interface Offering {
  owner: string;
  shelf: string;
  entryId: string;
  version: number;
  passage: string;
  kind: string;
  title: string;
  descriptorId: string;
  descriptor: Record<string, unknown>;
  markdownPath: string | null;
  indexedAt: string;
}

export interface DiscoverResult {
  chapter: string;
  offerings: Offering[];
  loadedAt: string;
}

export function createDiscover(backend: ReaderBackend) {
  const byChapter = new Map<
    string,
    ReturnType<typeof signal<DiscoverResult | null>>
  >();
  const loading = signal(false);
  const error = signal<string | null>(null);
  const bodies = new Map<string, ReturnType<typeof signal<string | null>>>();

  function forChapter(chapterRef: string) {
    let s = byChapter.get(chapterRef);
    if (!s) {
      s = signal<DiscoverResult | null>(null);
      byChapter.set(chapterRef, s);
      void refresh(chapterRef);
    }
    return s;
  }

  async function refresh(chapterRef: string) {
    const s = forChapter(chapterRef);
    loading.value = true;
    error.value = null;
    try {
      const offerings = await backend.discover({ passage: chapterRef });
      s.value = {
        chapter: chapterRef,
        offerings,
        loadedAt: new Date().toISOString(),
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** The markdown beside an offering, read once through the workspace. */
  function body(o: Offering) {
    const key = `${o.shelf}:${o.markdownPath ?? o.entryId}`;
    let s = bodies.get(key);
    if (!s) {
      s = signal<string | null>(null);
      bodies.set(key, s);
      if (o.markdownPath)
        backend
          .readPublic(o.shelf, o.markdownPath)
          .then((t) => (s!.value = t))
          .catch(
            (e: unknown) =>
              (s!.value = `(could not read: ${e instanceof Error ? e.message : String(e)})`)
          );
      else s.value = "";
    }
    return s;
  }

  return { forChapter, refresh, body, loading, error };
}

export type Discover = ReturnType<typeof createDiscover>;
