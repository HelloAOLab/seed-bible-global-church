// VERSE SEARCH — Typesense straight from the browser, as today's SearchManager does and the work order excepts. One
// GET per query with the search-only key (no client library: the old 150 KB Typesense client is not worth it for
// one call). A typed reference ("John 3:16", "1 Kings 2") is answered locally by lib/scripture.
import {
  parseVerseReference,
  type TranslationBookLike,
  type VerseRef,
} from "@seed/scripture";

const viteEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env;
export const TYPESENSE_URL = (
  viteEnv?.["VITE_TYPESENSE_URL"] ?? "https://search.seedbible.org"
).replace(/\/$/, "");
export const TYPESENSE_SEARCH_KEY =
  viteEnv?.["VITE_TYPESENSE_SEARCH_KEY"] ?? "";
const VERSE_COLLECTION_PREFIX = "bibleVerses";

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
  key?: string;
}

export function createVerseSearch(deps: SearchDeps = {}) {
  const fetchImpl =
    deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const url = deps.url ?? TYPESENSE_URL;
  const key = deps.key ?? TYPESENSE_SEARCH_KEY;

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
      query_by: "referenceNormalized,reference,text",
      filter_by: `translation:=${translationId}`,
      per_page: "25",
    });
    const res = await fetchImpl(
      `${url}/collections/${VERSE_COLLECTION_PREFIX}.${language}/documents/search?${params}`,
      { headers: { "x-typesense-api-key": key }, ...(signal ? { signal } : {}) }
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
