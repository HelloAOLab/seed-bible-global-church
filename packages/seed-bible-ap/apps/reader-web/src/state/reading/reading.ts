// READING — ported from packages/seed-bible BibleReadingManager's core (docs/porting/BibleReadingManager.md): which
// translation, book and chapter is open, the chapter's content, the catalogue of translations and books, and
// next/previous. Text comes from the Bible API straight into the browser (the one permitted third party) and every
// chapter read is kept on the device, so a chapter read once reads again offline.
import { computed, signal } from "@preact/signals";
import type {
  FreeUseBibleAPI,
  Translation,
  TranslationBook,
  TranslationBookChapter,
  TranslationBooks,
} from "../../backend/bible";
import type { KeyValueStore } from "../../backend/offline/db";

export const DEFAULT_TRANSLATION = "BSB";
export const DEFAULT_BOOK = "JHN";
export const DEFAULT_CHAPTER = 1;

export interface ReadingApi {
  getAvailableTranslations: FreeUseBibleAPI["getAvailableTranslations"];
  getTranslationBooks: FreeUseBibleAPI["getTranslationBooks"];
  getTranslationBookChapter: FreeUseBibleAPI["getTranslationBookChapter"];
}

export interface ReadingDeps {
  api: ReadingApi;
  chapters: KeyValueStore<unknown>;
  onChange?: (p: {
    translationId: string;
    bookId: string;
    chapterNumber: number;
  }) => void;
}

const chapterKey = (t: string, b: string, c: number) =>
  `chapter:${t}/${b}/${c}`;
const booksKey = (t: string) => `books:${t}`;

export function createReading(deps: ReadingDeps) {
  const translationId = signal(DEFAULT_TRANSLATION);
  const bookId = signal(DEFAULT_BOOK);
  const chapterNumber = signal(DEFAULT_CHAPTER);
  const chapterData = signal<TranslationBookChapter | null>(null);
  const translations = signal<Translation[]>([]);
  const books = signal<TranslationBook[]>([]);
  const loading = signal(false);
  const error = signal<string | null>(null);
  /** True when the open chapter came from the device because the API was out of reach. */
  const fromDevice = signal(false);
  let generation = 0;

  const chapterRef = computed(() => `${bookId.value}.${chapterNumber.value}`);
  const book = computed(
    () => books.value.find((b) => b.id === bookId.value) ?? null
  );
  const bookName = computed(
    () => chapterData.value?.book.name ?? book.value?.name ?? bookId.value
  );
  const translation = computed(
    () =>
      chapterData.value?.translation ??
      translations.value.find((t) => t.id === translationId.value) ??
      null
  );

  async function loadTranslations() {
    if (translations.value.length) return translations.value;
    try {
      const out = await deps.api.getAvailableTranslations();
      translations.value = out.translations;
      await deps.chapters.set("translations", out.translations);
    } catch {
      translations.value =
        ((await deps.chapters.get("translations")) as
          | Translation[]
          | undefined) ?? [];
    }
    return translations.value;
  }

  async function loadBooks(t: string) {
    try {
      const out = await deps.api.getTranslationBooks(t);
      await deps.chapters.set(booksKey(t), out);
      return out.books;
    } catch (e) {
      const cached = (await deps.chapters.get(booksKey(t))) as
        | TranslationBooks
        | undefined;
      if (cached) return cached.books;
      throw e;
    }
  }

  async function goTo(t: string, b: string, c: number) {
    const gen = ++generation;
    translationId.value = t;
    bookId.value = b;
    chapterNumber.value = c;
    loading.value = true;
    error.value = null;
    deps.onChange?.({ translationId: t, bookId: b, chapterNumber: c });
    try {
      if (
        !books.value.length ||
        books.value[0]?.id === undefined ||
        translation.value?.id !== t
      ) {
        const list = await loadBooks(t);
        if (gen !== generation) return;
        books.value = list;
      }
      let data: TranslationBookChapter;
      try {
        data = await deps.api.getTranslationBookChapter(t, b, c);
        fromDevice.value = false;
        await deps.chapters.set(chapterKey(t, b, c), data);
      } catch (e) {
        const cached = (await deps.chapters.get(chapterKey(t, b, c))) as
          | TranslationBookChapter
          | undefined;
        if (!cached) throw e;
        data = cached;
        fromDevice.value = true;
      }
      if (gen !== generation) return;
      chapterData.value = data;
    } catch (e) {
      if (gen !== generation) return;
      chapterData.value = null;
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  const parseLink = (link: string | null) => {
    const m = link && /\/api\/([^/]+)\/([^/]+)\/(\d+)\.json$/.exec(link);
    return m
      ? {
          t: decodeURIComponent(m[1]!),
          b: decodeURIComponent(m[2]!),
          c: Number(m[3]),
        }
      : null;
  };

  async function next() {
    const n = parseLink(chapterData.value?.nextChapterApiLink ?? null);
    if (n) await goTo(n.t, n.b, n.c);
  }
  async function prev() {
    const p = parseLink(chapterData.value?.previousChapterApiLink ?? null);
    if (p) await goTo(p.t, p.b, p.c);
  }
  const hasNext = computed(() => !!chapterData.value?.nextChapterApiLink);
  const hasPrev = computed(() => !!chapterData.value?.previousChapterApiLink);

  async function setTranslation(t: string) {
    await goTo(t, bookId.value, chapterNumber.value);
  }

  return {
    translationId,
    bookId,
    chapterNumber,
    chapterRef,
    chapterData,
    translations,
    books,
    book,
    bookName,
    translation,
    loading,
    error,
    fromDevice,
    hasNext,
    hasPrev,
    goTo,
    next,
    prev,
    setTranslation,
    loadTranslations,
    retry: () => goTo(translationId.value, bookId.value, chapterNumber.value),
  };
}

export type Reading = ReturnType<typeof createReading>;
