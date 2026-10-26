// A WHOLE TRANSLATION ON THE DEVICE — the old OfflineTranslationsManager: download a translation once (the Bible
// API's complete-translation file) and every chapter of it reads without a connection. Each chapter is stored under
// the same device key a chapter read online is kept under (reading.ts `chapterKey`), so the reader's existing
// "the API is out of reach, read the device's copy" path serves it; nothing else changes. Which translations are
// on the device, and when they came, is a device preference.
import { signal } from "@preact/signals";
import type {
  CompleteTranslation,
  FreeUseBibleAPI,
  Translation,
  TranslationBook,
  TranslationBookChapter,
  TranslationBooks,
} from "../../backend/bible";
import type { KeyValueStore } from "../../backend/offline/db";
import { booksKey, chapterKey } from "./reading";

const PREF = "offline:translations";

export interface OfflineEntry {
  id: string;
  name: string;
  chapters: number;
  at: string;
  /** The API's hash of the file when it came: a different one in the list now means a newer version. */
  sha256?: string;
  /** Bytes received (the old reader shows "Available offline (4.2 MB)"). */
  sizeBytes?: number;
}

/** The thrown error when a download is cancelled (not shown as a failure). */
export const CANCELLED = "cancelled";

export interface OfflineDeps {
  api: Pick<FreeUseBibleAPI, "getCompleteTranslation">;
  chapters: KeyValueStore<unknown>;
  prefs: KeyValueStore<unknown>;
  now?: () => string;
}

const link = (t: string, b: string, c: number) =>
  `/api/${encodeURIComponent(t)}/${encodeURIComponent(b)}/${c}.json`;

/** The complete file as the per-chapter documents the reader stores (links in the API's own shape, so next/previous work). */
export function chaptersOf(full: CompleteTranslation): {
  books: TranslationBooks;
  chapters: Array<{ key: string; doc: TranslationBookChapter }>;
} {
  const t = full.translation.id;
  const order: Array<{ book: TranslationBook; n: number }> = [];
  const books: TranslationBook[] = full.books.map((b) => {
    const nums = b.chapters.map((c) => c.chapter.number);
    const first = nums[0] ?? 1;
    const last = nums[nums.length - 1] ?? first;
    const book: TranslationBook = {
      id: b.id,
      name: b.name,
      commonName: b.commonName,
      title: b.title ?? null,
      order: b.order,
      numberOfChapters: b.numberOfChapters,
      firstChapterNumber: first,
      firstChapterApiLink: link(t, b.id, first),
      lastChapterNumber: last,
      lastChapterApiLink: link(t, b.id, last),
      totalNumberOfVerses: b.totalNumberOfVerses,
    } as TranslationBook;
    for (const n of nums) order.push({ book, n });
    return book;
  });
  const chapters = full.books.flatMap((b) =>
    b.chapters.map((c) => {
      const at = order.findIndex(
        (o) => o.book.id === b.id && o.n === c.chapter.number
      );
      const prev = order[at - 1];
      const next = order[at + 1];
      const doc = {
        translation: full.translation,
        book: books.find((x) => x.id === b.id)!,
        thisChapterLink: link(t, b.id, c.chapter.number),
        thisChapterAudioLinks: c.thisChapterAudioLinks ?? {},
        thisChapterAudioTimings: {},
        nextChapterApiLink: next ? link(t, next.book.id, next.n) : null,
        nextChapterAudioLinks: null,
        nextChapterAudioTimings: null,
        previousChapterApiLink: prev ? link(t, prev.book.id, prev.n) : null,
        previousChapterAudioLinks: null,
        previousChapterAudioTimings: null,
        numberOfVerses: c.numberOfVerses,
        chapter: c.chapter,
      } as unknown as TranslationBookChapter;
      return { key: chapterKey(t, b.id, c.chapter.number), doc };
    })
  );
  return {
    books: { translation: full.translation, books } as TranslationBooks,
    chapters,
  };
}

export function createOfflineTranslations(deps: OfflineDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const downloaded = signal<OfflineEntry[]>([]);
  /** The download in progress: which translation, how far (0–1, an estimate while the file streams), and the phase. */
  const progress = signal<{
    id: string;
    fraction: number;
    phase?: "downloading" | "saving";
    receivedBytes?: number;
  } | null>(null);
  const error = signal<string | null>(null);
  /** The last failure per translation, until it is tried again (the row offers Retry). */
  const errors = signal<Record<string, string>>({});
  let aborter: AbortController | null = null;

  async function load() {
    downloaded.value =
      ((await deps.prefs.get(PREF)) as OfflineEntry[] | undefined) ?? [];
  }

  async function download(tr: Translation | string) {
    const id = typeof tr === "string" ? tr : tr.id;
    if (progress.value) return;
    error.value = null;
    const { [id]: _was, ...rest } = errors.value;
    errors.value = rest;
    progress.value = {
      id,
      fraction: 0,
      phase: "downloading",
      receivedBytes: 0,
    };
    aborter = new AbortController();
    const signal = aborter.signal;
    let size = 0;
    try {
      const full = await deps.api.getCompleteTranslation(tr, {
        signal,
        onProgress: (got, total) => {
          size = got;
          progress.value = {
            id,
            fraction: total ? Math.min(0.9, (got / total) * 0.9) : 0.45,
            phase: "downloading",
            receivedBytes: got,
          };
        },
      });
      const { books, chapters } = chaptersOf(full);
      await deps.chapters.set(booksKey(id), books);
      let i = 0;
      for (const c of chapters) {
        if (signal.aborted) throw new Error(CANCELLED);
        await deps.chapters.set(c.key, c.doc);
        if (++i % 50 === 0)
          progress.value = {
            id,
            fraction: 0.9 + (0.1 * i) / chapters.length,
            phase: "saving",
          };
      }
      const entry: OfflineEntry = {
        id,
        name: full.translation.shortName ?? full.translation.name ?? id,
        chapters: chapters.length,
        at: now(),
        ...((typeof tr !== "string" && tr.sha256) || full.translation.sha256
          ? {
              sha256:
                (typeof tr !== "string" && tr.sha256) ||
                full.translation.sha256,
            }
          : {}),
        ...(size ? { sizeBytes: size } : {}),
      };
      downloaded.value = [
        ...downloaded.value.filter((d) => d.id !== id),
        entry,
      ];
      await deps.prefs.set(PREF, downloaded.value);
      return entry;
    } catch (e) {
      if (signal.aborted) {
        // A cancelled download leaves nothing half-stored behind.
        await removeChapters(id);
        throw new Error(CANCELLED);
      }
      const why = e instanceof Error ? e.message : String(e);
      error.value = why;
      errors.value = { ...errors.value, [id]: why };
      throw e;
    } finally {
      progress.value = null;
      aborter = null;
    }
  }

  /** Stop the download in progress. */
  function cancel(id: string) {
    if (progress.value?.id === id) aborter?.abort();
  }

  async function removeChapters(id: string) {
    if (downloaded.value.some((d) => d.id === id)) return;
    const prefix = `chapter:${id}/`;
    for (const k of await deps.chapters.keys())
      if (k.startsWith(prefix)) await deps.chapters.delete(k);
  }

  /** Take a translation off the device: every stored chapter of it, read online or downloaded. */
  async function remove(id: string) {
    const prefix = `chapter:${id}/`;
    for (const k of await deps.chapters.keys())
      if (k.startsWith(prefix)) await deps.chapters.delete(k);
    await deps.chapters.delete(booksKey(id));
    downloaded.value = downloaded.value.filter((d) => d.id !== id);
    await deps.prefs.set(PREF, downloaded.value);
  }

  const has = (id: string) => downloaded.value.some((d) => d.id === id);
  const entry = (id: string) => downloaded.value.find((d) => d.id === id);
  /** Whether the list now names a different file than the one on the device. */
  const updateAvailable = (tr: Translation) => {
    const e = entry(tr.id);
    return !!(e?.sha256 && tr.sha256 && e.sha256 !== tr.sha256);
  };

  /** The saved translations (other than `except`) that hold this chapter on the device. */
  async function holding(book: string, chapter: number, except: string) {
    const out: OfflineEntry[] = [];
    for (const d of downloaded.value)
      if (
        d.id !== except &&
        (await deps.chapters.get(chapterKey(d.id, book, chapter)))
      )
        out.push(d);
    return out;
  }

  /** The old reader's recovery card: a chapter that failed came back on Reload, so offer to keep its translation
   *  on the device — once a session for each, and not for one already offered or kept. */
  const recoveryOffer = signal<Translation | null>(null);
  const offeredRecovery = new Set<string>();
  function offerRecovery(tr: Translation | null) {
    if (!tr || has(tr.id) || offeredRecovery.has(tr.id)) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    offeredRecovery.add(tr.id);
    recoveryOffer.value = tr;
  }
  /** A kept translation the list now names a newer file for is fetched again on its own (the old reader's
   *  checkAndApplyUpdate), once per newer file; a device saving data keeps the Update button instead. */
  const updatedTo = new Set<string>();
  function refreshIfNewer(tr: Translation | null) {
    if (!tr || !updateAvailable(tr) || progress.value) return;
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (conn?.saveData || navigator.onLine === false) return;
    const mark = `${tr.id}:${tr.sha256}`;
    if (updatedTo.has(mark)) return;
    updatedTo.add(mark);
    void download(tr).catch(() => undefined);
  }

  return {
    downloaded,
    holding,
    recoveryOffer,
    offerRecovery,
    refreshIfNewer,
    progress,
    error,
    errors,
    load,
    download,
    cancel,
    remove,
    has,
    entry,
    updateAvailable,
  };
}

export type OfflineTranslations = ReturnType<typeof createOfflineTranslations>;
