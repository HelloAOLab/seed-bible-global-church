// VERSE SEARCH — the Seed Bible verse index (Typesense), asked through the scripture content service that serves the Bible
// (`/api/search/{language}`, Typesense's own response shape): no key in the browser, one host for scripture. A typed
// reference ("John 3:16", "1 Kings 2") is answered locally by lib/scripture.
import { BIBLE_API_ENDPOINT } from "./bible";
import {
  parseVerseReference,
  type TranslationBookLike,
  type VerseRef,
} from "@seed/scripture";

export const VERSE_SEARCH_URL = `${BIBLE_API_ENDPOINT}api/search`;

export interface VerseHit {
  id: string;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  reference: string;
}

export interface VerseSearchResult {
  found: number;
  hits: VerseHit[];
}

export interface SearchDeps {
  fetchImpl?: typeof fetch;
  url?: string;
}

export function createVerseSearch(deps: SearchDeps = {}) {
  const fetchImpl =
    deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const url = deps.url ?? VERSE_SEARCH_URL;

  /** Free-text verse search within one translation; `language` is the translation's ISO 639-3 code. */
  async function searchVerses(
    language: string,
    translationId: string,
    text: string,
    signal?: AbortSignal
  ): Promise<VerseSearchResult> {
    const q = text.trim();
    if (!q) return { found: 0, hits: [] };
    const params = new URLSearchParams({
      q,
      translation: translationId,
      per_page: "25",
    });
    const res = await fetchImpl(
      `${url}/${encodeURIComponent(language)}?${params}`,
      signal ? { signal } : {}
    );
    if (!res.ok) throw new Error(`search answered HTTP ${res.status}`);
    const body = (await res.json()) as {
      found?: number;
      hits?: Array<{ document: VerseHit }>;
    };
    return {
      found: body.found ?? 0,
      hits: (body.hits ?? []).map((h) => h.document),
    };
  }

  /** A reference the reader typed, resolved against the open translation's books — or null when it is not one. */
  const parseReference = (
    text: string,
    books: TranslationBookLike[]
  ): VerseRef | null => parseVerseReference(text, books);

  return { searchVerses, parseReference };
}

export type VerseSearch = ReturnType<typeof createVerseSearch>;
