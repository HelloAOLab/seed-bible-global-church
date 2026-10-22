// THE SELECTOR — the old BibleSelector's overlay panel (`sb-selector-overlay` / `sb-selector-panel` and the books,
// chapters and translation lists its stylesheet dresses), with the search box; without the apocrypha info,
// offline downloads and tutorial tour of the full component.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function BibleSelector({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const mode = state.ui.selector.value;
  const { reading } = state;
  const [search, setSearch] = useState("");
  const [bookPick, setBookPick] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "translations") void reading.loadTranslations();
    if (mode) {
      setSearch("");
      setBookPick(null);
    }
  }, [mode]);

  if (!mode) return null;
  const close = () => (state.ui.selector.value = null);
  const q = search.trim().toLowerCase();

  const books = reading.books.value.filter(
    (b) =>
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.commonName.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q)
  );
  const translations = reading.translations.value.filter(
    (tr) =>
      !q ||
      tr.id.toLowerCase().includes(q) ||
      tr.name.toLowerCase().includes(q) ||
      tr.englishName.toLowerCase().includes(q) ||
      (tr.languageEnglishName ?? "").toLowerCase().includes(q)
  );
  const picked = bookPick ?? (q ? null : reading.bookId.value);
  const pickedBook = reading.books.value.find((b) => b.id === picked) ?? null;

  return (
    <div className="sb-selector-overlay open" onClick={close}>
      <div
        className="sb-selector-panel"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div className="sb-selector-header">
          <div className="sb-selector-pane-picker" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "books"}
              className={`sb-selector-pane-chip${mode === "books" ? " sb-selector-pane-chip-selected" : ""}`}
              onClick={() => (state.ui.selector.value = "books")}
            >
              {t("books", { defaultValue: "Books" })}
            </button>
            <button
              role="tab"
              aria-selected={mode === "translations"}
              className={`sb-selector-pane-chip${mode === "translations" ? " sb-selector-pane-chip-selected" : ""}`}
              onClick={() => (state.ui.selector.value = "translations")}
            >
              {reading.translation.value?.shortName ??
                reading.translationId.value}
            </button>
          </div>
          <button
            className="sb-selector-close-button"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="searchbar flex-align-center">
          <span className="search-icon material-symbols-outlined">search</span>
          <input
            className="sb-selector-search-input flex-1"
            type="search"
            value={search}
            placeholder={
              mode === "books"
                ? t("search-books", { defaultValue: "Search books..." })
                : t("search-translation", {
                    defaultValue: "Search translations...",
                  })
            }
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            autoFocus
          />
        </div>

        {mode === "books" ? (
          <div className="sb-selector-grid">
            <div className="sb-selector-books-grid">
              {books.map((b) => (
                <div key={b.id} className="sb-selector-books-row">
                  <button
                    className={`sb-selector-book-button${b.id === reading.bookId.value ? " sb-selector-book-button-current" : ""}`}
                    onClick={() => setBookPick(b.id === bookPick ? null : b.id)}
                    aria-expanded={picked === b.id}
                  >
                    <span className="sb-selector-book-button-name">
                      {b.name}
                    </span>
                  </button>
                  {picked === b.id && (
                    <div className="sb-selector-chapter-grid sb-selector-chapter-grid-inline">
                      {Array.from(
                        { length: b.numberOfChapters },
                        (_, i) => i + 1
                      ).map((c) => (
                        <button
                          key={c}
                          className={`sb-selector-chapter-button${b.id === reading.bookId.value && c === reading.chapterNumber.value ? " sb-selector-chapter-button-current" : ""}`}
                          onClick={() => {
                            void reading.goTo(
                              reading.translationId.value,
                              b.id,
                              c
                            );
                            close();
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!books.length && (
                <p className="sb-selector-section-title">
                  {t("no-search-results", { defaultValue: "Nothing matches." })}
                </p>
              )}
            </div>
            {pickedBook && !q && (
              <div className="sb-selector-column-divider" aria-hidden="true" />
            )}
          </div>
        ) : (
          <div className="sb-selector-grid sb-translation-list">
            {!translations.length && (
              <p className="sb-selector-section-title">
                {reading.translations.value.length
                  ? t("no-search-results", { defaultValue: "Nothing matches." })
                  : t("loading", { defaultValue: "Loading…" })}
              </p>
            )}
            {translations.map((tr) => (
              <button
                key={tr.id}
                className={`sb-translation-row${tr.id === reading.translationId.value ? " sb-translation-row-current" : ""}`}
                onClick={() => {
                  void reading.setTranslation(tr.id);
                  close();
                }}
              >
                <span className="sb-translation-row-short">
                  {tr.shortName ?? tr.id}
                </span>
                <span className="sb-translation-row-name">
                  {tr.name}
                  {tr.englishName && tr.englishName !== tr.name
                    ? ` · ${tr.englishName}`
                    : ""}
                </span>
                <span className="sb-translation-row-lang">
                  {tr.languageEnglishName ?? tr.language}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
