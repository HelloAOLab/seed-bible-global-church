// THE FLOATING SEARCH — the old reader's (packages/seed-bible FloatingReaderPanels, FloatingSearchPanel): Search in the
// toolbar opens a box just above it. Books match as you type, from the open translation's own list ("Gen 2" offers
// Genesis 2); verses follow from the search service. ↑ ↓ and Enter choose; Esc or a tap elsewhere closes. A result
// opens in the tab on screen, or with ↗ in a new one.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { TranslationBook } from "../../backend/bible";
import type { VerseHit } from "../../backend/search";

export interface BookMatch {
  bookId: string;
  bookName: string;
  chapterNumber: number | null;
}

const rank = (b: TranslationBook, q: string) =>
  b.id.toLowerCase() === q
    ? 0
    : b.commonName.toLowerCase().startsWith(q) ||
        b.name.toLowerCase().startsWith(q) ||
        b.id.toLowerCase().startsWith(q)
      ? 1
      : 2;

/** The old reader's book matching: the words name the book, a trailing number its chapter (when it has one). */
export function matchBookReferences(
  query: string,
  books: readonly TranslationBook[],
  limit = 6
): BookMatch[] {
  const chapter = /(\d+)\s*$/.exec(query)?.[1];
  const q = query
    .replace(/\d+\s*$/, "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  return books
    .filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.commonName.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        (b.title?.toLowerCase().includes(q) ?? false)
    )
    .map((b) => ({ b, r: rank(b, q) }))
    .sort((x, y) => x.r - y.r || x.b.order - y.b.order)
    .slice(0, limit)
    .map(({ b }) => {
      const n = chapter ? Number(chapter) : NaN;
      return {
        bookId: b.id,
        bookName: b.commonName || b.name,
        chapterNumber:
          n >= b.firstChapterNumber && n <= b.lastChapterNumber ? n : null,
      };
    });
}

export function FloatingSearch({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { ui, reading } = state;
  const open = ui.searchOpen.value;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VerseHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lit, setLit] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<Array<HTMLButtonElement | null>>([]);
  const books = matchBookReferences(query, reading.books.value);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setError(null);
      setLit(-1);
      return;
    }
    const id = setTimeout(() => input.current?.focus(), 60);
    // Its short tour, the first time it opens (once; never if tutorials are off).
    const tour = setTimeout(() => state.tours.startContextual("search"), 400);
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (
        !el?.closest?.(
          ".sb-floating-search-panel, .sb-reader-toolbar, .sb-phone-nav"
        )
      )
        ui.searchOpen.value = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      clearTimeout(id);
      clearTimeout(tour);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Verses after a pause in the typing; a newer query supersedes the one in flight.
  useEffect(() => {
    const q = query.trim();
    setLit(-1);
    if (!open || !q) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      state.search
        .searchVerses(
          reading.translation.value?.language ?? "eng",
          reading.translationId.value,
          q,
          ctl.signal
        )
        .then((r) => !ctl.signal.aborted && setHits(r.hits))
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return;
          setHits([]);
          setError(
            e instanceof Error
              ? e.message
              : t("search-failed", { defaultValue: "Unable to search verses." })
          );
        })
        .finally(() => !ctl.signal.aborted && setLoading(false));
    }, 180);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, open, reading.translationId.value]);

  useEffect(() => {
    if (lit >= 0) results.current[lit]?.scrollIntoView({ block: "nearest" });
  }, [lit]);

  if (!open) return null;

  const close = () => (ui.searchOpen.value = false);
  const goTo = (
    book: string,
    chapter: number,
    verse: number | null,
    newTab: boolean
  ) => {
    close();
    if (ui.pane.value !== "none" && ui.pane.value !== "notes")
      ui.pane.value = "none";
    const target = newTab
      ? state.tabs.addTab({
          translationId: reading.translationId.value,
          bookId: book,
          chapterNumber: chapter,
        }).reading
      : state.reading;
    void target.goTo(reading.translationId.value, book, chapter).then(() => {
      if (!verse) return;
      target.scrollToVerse.value = verse;
      state.selection.select(verse, verse);
    });
  };
  const chapterOf = (m: BookMatch) =>
    m.chapterNumber ??
    reading.books.value.find((b) => b.id === m.bookId)?.firstChapterNumber ??
    1;
  const total = books.length + hits.length;
  const openLit = () => {
    if (lit < 0) return;
    if (lit < books.length) {
      const m = books[lit]!;
      goTo(m.bookId, chapterOf(m), null, false);
    } else {
      const h = hits[lit - books.length];
      if (h) goTo(h.book, h.chapter, h.verse, false);
    }
  };
  const hasQuery = query.trim().length > 0;
  const NewTab = (props: { label: string; onOpen: () => void }) => (
    <span
      className="sb-floating-search-result-action"
      role="button"
      tabIndex={0}
      aria-label={props.label}
      title={props.label}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        props.onOpen();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          props.onOpen();
        }
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        open_in_new
      </span>
    </span>
  );

  return (
    <div
      className={`sb-floating-search-panel${hasQuery ? " sb-floating-search-panel-expanded" : ""}`}
      role="dialog"
      aria-label={t("search", { defaultValue: "Search" })}
    >
      {hasQuery && (
        <div className="sb-floating-search-results" role="listbox">
          {books.length > 0 && (
            <div className="sb-floating-search-section">
              <div className="sb-floating-search-section-title">
                {t("books", { defaultValue: "Books" })}
              </div>
              <div className="sb-floating-search-results-list">
                {books.map((m, i) => (
                  <button
                    key={`${m.bookId}-${m.chapterNumber ?? "book"}`}
                    ref={(el) => {
                      results.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={lit === i}
                    className={`sb-floating-search-result sb-floating-search-book${lit === i ? " sb-floating-search-result-highlighted" : ""}`}
                    onMouseEnter={() => setLit(i)}
                    onClick={() => goTo(m.bookId, chapterOf(m), null, false)}
                  >
                    <header className="sb-floating-search-result-header">
                      <span
                        className="material-symbols-outlined sb-floating-search-book-icon"
                        aria-hidden="true"
                      >
                        menu_book
                      </span>
                      <span className="sb-floating-search-result-ref">
                        {m.chapterNumber !== null
                          ? `${m.bookName} ${m.chapterNumber}`
                          : m.bookName}
                      </span>
                      <NewTab
                        label={t("open-in-new-tab", {
                          defaultValue: "Open in New Tab",
                        })}
                        onOpen={() => goTo(m.bookId, chapterOf(m), null, true)}
                      />
                    </header>
                    <p className="sb-floating-search-result-text">
                      {t("open-chapter", { defaultValue: "Open chapter" })}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading && (
            <div className="sb-floating-search-status">
              {t("searching", { defaultValue: "Searching..." })}
            </div>
          )}
          {!loading && error && (
            <div className="sb-floating-search-status sb-floating-search-status-error">
              {error}
            </div>
          )}
          {!loading && !error && !hits.length && !books.length && (
            <div className="sb-floating-search-status">
              {t("no-search-results", { defaultValue: "No matching verses." })}
            </div>
          )}
          {!loading && !error && hits.length > 0 && (
            <div className="sb-floating-search-results-list">
              {hits.map((h, j) => {
                const i = books.length + j;
                return (
                  <button
                    key={h.id}
                    ref={(el) => {
                      results.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={lit === i}
                    className={`sb-floating-search-result${lit === i ? " sb-floating-search-result-highlighted" : ""}`}
                    onMouseEnter={() => setLit(i)}
                    onClick={() => goTo(h.book, h.chapter, h.verse, false)}
                  >
                    <header className="sb-floating-search-result-header">
                      <span className="sb-floating-search-result-ref">
                        {h.reference}
                      </span>
                      <span
                        className="sb-floating-search-result-sep"
                        aria-hidden="true"
                      >
                        •
                      </span>
                      <span className="sb-floating-search-result-translation">
                        {h.translation}
                      </span>
                      <NewTab
                        label={t("open-in-new-tab", {
                          defaultValue: "Open in New Tab",
                        })}
                        onOpen={() => goTo(h.book, h.chapter, h.verse, true)}
                      />
                    </header>
                    <p className="sb-floating-search-result-text">{h.text}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="sb-floating-search-input-wrap">
        <span
          className="material-symbols-outlined sb-floating-search-icon"
          aria-hidden="true"
        >
          search
        </span>
        <input
          ref={input}
          type="text"
          className="sb-floating-search-input"
          placeholder={t("search-verses", { defaultValue: "Search verses" })}
          aria-label={t("search-verses", { defaultValue: "Search verses" })}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            const k = (e as KeyboardEvent).key;
            if (k === "ArrowDown" && total) {
              e.preventDefault();
              setLit((lit + 1) % total);
            } else if (k === "ArrowUp" && total) {
              e.preventDefault();
              setLit(lit <= 0 ? total - 1 : lit - 1);
            } else if (k === "Enter" && lit >= 0) {
              e.preventDefault();
              openLit();
            } else if (k === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        />
        {hasQuery && (
          <button
            type="button"
            className="sb-floating-search-clear"
            aria-label={t("clear-search", { defaultValue: "Clear search" })}
            title={t("clear-search", { defaultValue: "Clear search" })}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
    </div>
  );
}
