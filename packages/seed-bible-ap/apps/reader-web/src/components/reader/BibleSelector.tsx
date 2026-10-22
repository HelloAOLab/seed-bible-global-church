// THE SELECTOR — the old BibleSelector's overlay panel (`sb-selector-overlay` / `sb-selector-panel` and the books,
// chapters and translation lists its stylesheet dresses), with the search box and the testament filter (All / Old /
// New, and the Apocrypha when the translation carries it).
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { handleGridKeyNav, handleVerticalListKeyNav } from "../keyboardNav";
import {
  groupByTestament,
  testamentChoices,
  type Testament,
  type TestamentFilter,
} from "../../state/reading/testaments";
import type { TranslationBook } from "../../backend/bible";

export function BibleSelector({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const mode = state.ui.selector.value;
  const { reading } = state;
  const [search, setSearch] = useState("");
  const [bookPick, setBookPick] = useState<string | null>(null);
  const [testament, setTestament] = useState<TestamentFilter>("all");

  useEffect(() => {
    if (mode === "translations") void reading.loadTranslations();
    // The first time each list opens, its short tour (once; never if tutorials are off).
    if (mode)
      setTimeout(
        () =>
          state.tours.startContextual(
            mode === "books" ? "selector" : "offline-download"
          ),
        400
      );
    if (mode) {
      setSearch("");
      setBookPick(null);
    }
  }, [mode]);

  if (!mode) return null;
  const close = () => (state.ui.selector.value = null);
  const q = search.trim().toLowerCase();

  const choices = testamentChoices(reading.books.value);
  const testamentLabel = (x: TestamentFilter) =>
    x === "all"
      ? t("allBooks", { defaultValue: "All books" })
      : x === "old"
        ? t("old-testament", { defaultValue: "Old Testament" })
        : x === "new"
          ? t("new-testament", { defaultValue: "New Testament" })
          : t("apocrypha", { defaultValue: "Apocrypha" });
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

  const BookRows = ({ books: list }: { books: TranslationBook[] }) => (
    <div className="sb-selector-books-grid">
      {list.map((b) => (
        <div key={b.id} className="sb-selector-books-row">
          <button
            className={`sb-selector-book-button${b.id === reading.bookId.value ? " sb-selector-book-button-current" : ""}`}
            onClick={() => setBookPick(b.id === bookPick ? null : b.id)}
            aria-expanded={picked === b.id}
          >
            <span className="sb-selector-book-button-name">{b.name}</span>
          </button>
          {picked === b.id && (
            <div className="sb-selector-chapter-grid sb-selector-chapter-grid-inline">
              {Array.from({ length: b.numberOfChapters }, (_, i) => i + 1).map(
                (c) => (
                  <button
                    key={c}
                    className={`sb-selector-chapter-button${b.id === reading.bookId.value && c === reading.chapterNumber.value ? " sb-selector-chapter-button-current" : ""}`}
                    onClick={() => {
                      void reading.goTo(reading.translationId.value, b.id, c);
                      close();
                    }}
                  >
                    {c}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

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
          <div
            className="sb-selector-grid"
            onKeyDown={(e) =>
              handleGridKeyNav(
                e as KeyboardEvent,
                e.currentTarget as HTMLElement
              )
            }
          >
            <div className="sb-selector-testament-picker" role="tablist">
              {choices.map((x) => (
                <button
                  key={x}
                  role="tab"
                  aria-selected={testament === x}
                  className={`sb-selector-pane-chip${testament === x ? " sb-selector-pane-chip-selected" : ""}`}
                  onClick={() => setTestament(x)}
                >
                  {testamentLabel(x)}
                </button>
              ))}
            </div>
            {(() => {
              const groups = groupByTestament(books);
              const shown: Testament[] =
                testament === "all"
                  ? (["old", "new", "apocrypha"] as const).filter(
                      (g) => groups[g].length
                    )
                  : [testament];
              return shown.map((g) => (
                <section key={g} className="sb-selector-testament">
                  {testament === "all" && (
                    <h3 className="sb-selector-section-title">
                      {testamentLabel(g)}
                    </h3>
                  )}
                  {!groups[g].length && !q && (
                    <p className="sb-selector-section-title sb-muted">
                      {t("testament-missing", {
                        name: testamentLabel(g),
                        translation:
                          reading.translation.value?.shortName ??
                          reading.translationId.value,
                        defaultValue:
                          "{{translation}} has no {{name}}. Pick another translation to read it.",
                      })}
                    </p>
                  )}
                  <BookRows books={groups[g]} />
                </section>
              ));
            })()}
            {!books.length && (
              <p className="sb-selector-section-title">
                {t("no-search-results", { defaultValue: "Nothing matches." })}
              </p>
            )}
            {pickedBook && !q && (
              <div className="sb-selector-column-divider" aria-hidden="true" />
            )}
          </div>
        ) : (
          <div
            className="sb-selector-grid sb-translation-list"
            onKeyDown={(e) =>
              handleVerticalListKeyNav(
                e as KeyboardEvent,
                e.currentTarget as HTMLElement
              )
            }
          >
            {!translations.length && (
              <p className="sb-selector-section-title">
                {reading.translations.value.length
                  ? t("no-search-results", { defaultValue: "Nothing matches." })
                  : t("loading", { defaultValue: "Loading…" })}
              </p>
            )}
            {translations.map((tr) => {
              const onDevice = state.offline.has(tr.id);
              const going = state.offline.progress.value?.id === tr.id;
              return (
                <div key={tr.id} className="sb-translation-item">
                  <button
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
                  <button
                    type="button"
                    className={`sb-translation-offline${onDevice ? " sb-translation-offline-on" : ""}`}
                    disabled={!!state.offline.progress.value && !going}
                    aria-label={
                      onDevice
                        ? t("offline-remove", {
                            name: tr.shortName ?? tr.id,
                            defaultValue: "Remove {{name}} from this device",
                          })
                        : t("offline-download", {
                            name: tr.shortName ?? tr.id,
                            defaultValue: "Download {{name}} to read offline",
                          })
                    }
                    title={
                      onDevice
                        ? t("offline-on-device", {
                            defaultValue:
                              "On this device: reads without a connection. Tap to remove.",
                          })
                        : t("offline-download-hint", {
                            defaultValue:
                              "Download the whole translation to read it without a connection",
                          })
                    }
                    onClick={() => {
                      if (going) return;
                      if (onDevice) {
                        if (
                          confirm(
                            t("offline-remove-confirm", {
                              name: tr.shortName ?? tr.id,
                              defaultValue:
                                "Remove {{name}} from this device? Chapters will need a connection again.",
                            })
                          )
                        )
                          void state.offline.remove(tr.id);
                      } else void state.offline.download(tr).catch(() => {});
                    }}
                  >
                    {going ? (
                      <span className="sb-translation-offline-progress">
                        {Math.round(
                          (state.offline.progress.value?.fraction ?? 0) * 100
                        )}
                        %
                      </span>
                    ) : (
                      <span className="material-symbols-outlined">
                        {onDevice ? "offline_pin" : "download"}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {state.offline.error.value && (
              <p className="sb-selector-section-title sb-pane-error">
                {t("offline-failed", {
                  reason: state.offline.error.value,
                  defaultValue: "The download did not finish: {{reason}}",
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
