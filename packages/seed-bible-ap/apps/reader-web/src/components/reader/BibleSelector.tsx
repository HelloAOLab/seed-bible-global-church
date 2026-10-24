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
  type TestamentFilter,
} from "../../state/reading/testaments";
import type { TranslationBook } from "../../backend/bible";
import type * as preact from "preact";

/** The old reader's columns: Old Testament 3 + New 2 on a desktop, 2 + 1 below 1200 px, one each on a phone. */
const MOBILE_BREAKPOINT = 480;
function columnsFor(width: number) {
  if (width <= MOBILE_BREAKPOINT)
    return { ot: 1, nt: 1, single: 1, otPct: 100, ntPct: 100 };
  if (width < 1200)
    return { ot: 2, nt: 1, single: 3, otPct: 66.66, ntPct: 33.33 };
  return { ot: 3, nt: 2, single: 5, otPct: 60, ntPct: 40 };
}

function useViewportWidth() {
  const [w, setW] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/**
 * One testament's books, laid out as the old reader lays them: filled down each column, then across, and the open
 * book's chapters as a full-width row under the row it sits in (Psalms in its five books).
 */
function BooksGrid(props: {
  books: TranslationBook[];
  columns: number;
  open: string | null;
  currentBook: string;
  currentChapter: number;
  onToggle: (id: string) => void;
  onChapter: (book: string, chapter: number) => void;
}) {
  const { t } = useI18n();
  const { books, columns, open } = props;
  const rows =
    columns <= 1
      ? books.length
      : Math.max(1, Math.ceil(books.length / columns));
  const openIndex = books.findIndex((b) => b.id === open);
  const openRow = openIndex >= 0 && columns > 1 ? openIndex % rows : null;
  const [psalmParts, setPsalmParts] = useState<number[]>(() => [0, 1, 2, 3, 4]);
  const PSALM_STARTS = [1, 42, 73, 90, 107];
  const partOf = (c: number) => PSALM_STARTS.filter((s) => c >= s).length - 1;

  const chapters = (b: TranslationBook) => {
    const list: preact.JSX.Element[] = [];
    for (let c = 1; c <= b.numberOfChapters; c++) {
      if (b.id === "PSA" && PSALM_STARTS.includes(c)) {
        const part = partOf(c);
        list.push(
          <button
            key={`part-${part}`}
            type="button"
            style={{ width: "100%" }}
            className={`psalms-btn flex-start-start${psalmParts.includes(part) ? " sidebar-selected-itm" : ""}`}
            onClick={() =>
              setPsalmParts((p) =>
                p.includes(part) ? p.filter((x) => x !== part) : [...p, part]
              )
            }
          >
            {t(`${part + 1}-psalms`, { defaultValue: `Book ${part + 1}` })}
          </button>
        );
      }
      const current = b.id === props.currentBook && c === props.currentChapter;
      const hidden = b.id === "PSA" && !psalmParts.includes(partOf(c));
      list.push(
        <button
          key={c}
          type="button"
          id={`chapter-btn-${c}`}
          style={hidden ? { display: "none" } : undefined}
          className={`chapter-btn flex-center${current ? " chapter-btn-current" : ""}`}
          aria-current={current ? "true" : undefined}
          onClick={() => props.onChapter(b.id, c)}
        >
          <span
            className={`sidebar-chapter-itm ${current ? "highlight" : "un-highlight"}`}
          >
            {c}
          </span>
        </button>
      );
    }
    return list;
  };

  const padded: Array<TranslationBook | null> = [...books];
  while (columns > 1 && padded.length % columns) padded.push(null);
  const cells: preact.JSX.Element[] = [];
  padded.forEach((b, i) => {
    const grid =
      columns > 1
        ? {
            gridColumn: Math.floor(i / rows) + 1,
            gridRow:
              openRow !== null && i % rows > openRow
                ? (i % rows) + 2
                : (i % rows) + 1,
          }
        : undefined;
    if (!b) {
      cells.push(
        <div key={`ghost-${i}`} className="sidebar-ghost-itm" style={grid} />
      );
      return;
    }
    const isOpen = b.id === open;
    cells.push(
      <button
        key={b.id}
        type="button"
        id={`booktab-${b.id}`}
        className={`sidebar-itm flex-between-center${isOpen ? " sidebar-selected-itm" : ""}`}
        aria-expanded={isOpen}
        aria-current={b.id === props.currentBook ? "true" : undefined}
        style={grid}
        onClick={() => props.onToggle(b.id)}
      >
        <span className="sb-selector-book-name">{b.commonName || b.name}</span>
        <span
          className={`material-symbols-outlined${isOpen ? " upside-down" : ""}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
    );
    if (isOpen && columns <= 1)
      cells.push(
        <div key="chapters" className="sidebar-chapters show-sidebar-chapter">
          {chapters(b)}
        </div>
      );
  });
  const openBook = openIndex >= 0 ? books[openIndex]! : null;
  if (openBook && columns > 1)
    cells.push(
      <div
        key="chapters"
        className="sidebar-chapters show-sidebar-chapter"
        style={{ gridColumn: "1 / -1", gridRow: openRow! + 2 }}
      >
        {chapters(openBook)}
      </div>
    );
  return (
    <div
      className={`books-item ${columns > 1 ? "grid-column-wrap-around" : "books-item-vertical"}`}
      style={
        columns > 1
          ? {
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows + (openBook ? 1 : 0)}, auto)`,
            }
          : undefined
      }
    >
      {cells}
    </div>
  );
}

export function BibleSelector({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const mode = state.ui.selector.value;
  const { reading } = state;
  const [search, setSearch] = useState("");
  const [bookPick, setBookPick] = useState<string | null>(null);
  const [testament, setTestament] = useState<TestamentFilter>("all");
  const width = useViewportWidth();

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

  // The open book's grid (and the current chapter in it) scrolled into view.
  useEffect(() => {
    if (mode !== "books") return;
    const id = setTimeout(() => {
      const el =
        document.querySelector<HTMLElement>(
          ".show-sidebar-chapter .chapter-btn-current"
        ) ?? document.querySelector<HTMLElement>(".sidebar-selected-itm");
      el?.scrollIntoView({ block: "center" });
    }, 50);
    return () => clearTimeout(id);
  }, [mode, bookPick]);

  if (!mode) return null;
  const close = () => (state.ui.selector.value = null);
  const q = search.trim().toLowerCase();
  const shortName =
    reading.translation.value?.shortName ?? reading.translationId.value;

  const choices = testamentChoices(reading.books.value);
  const testamentLabel = (x: TestamentFilter) =>
    x === "all"
      ? t("allBooks", { defaultValue: "All books" })
      : x === "old"
        ? t("old-testament", { defaultValue: "Old Testament" })
        : x === "new"
          ? t("new-testament", { defaultValue: "New Testament" })
          : t("apocrypha", { defaultValue: "Apocrypha" });
  // "John 3" searches for John and keeps the 3 for Enter.
  const bookQuery = q.replace(/\s*\d+$/, "").trim() || q;
  const books = reading.books.value.filter(
    (b) =>
      !q ||
      b.name.toLowerCase().includes(bookQuery) ||
      b.commonName.toLowerCase().includes(bookQuery) ||
      b.id.toLowerCase().includes(bookQuery)
  );
  const translations = reading.translations.value.filter(
    (tr) =>
      !q ||
      tr.id.toLowerCase().includes(q) ||
      tr.name.toLowerCase().includes(q) ||
      tr.englishName.toLowerCase().includes(q) ||
      (tr.languageEnglishName ?? "").toLowerCase().includes(q)
  );
  // The book on screen opens with the picker; a search down to one book opens that one.
  const picked =
    bookPick ??
    (q ? (books.length === 1 ? books[0]!.id : null) : reading.bookId.value);
  const goTo = (book: string, chapter: number) => {
    void reading.goTo(reading.translationId.value, book, chapter);
    close();
  };
  const cols = columnsFor(width);
  const phone = width <= MOBILE_BREAKPOINT;
  const groups = groupByTestament(books);
  const grid = (list: TranslationBook[], columns: number) => (
    <BooksGrid
      books={list}
      columns={columns}
      open={picked}
      currentBook={reading.bookId.value}
      currentChapter={reading.chapterNumber.value}
      onToggle={(id) => setBookPick(id === picked ? "" : id)}
      onChapter={goTo}
    />
  );

  return (
    <div className="sb-selector-overlay open" onClick={close}>
      <div
        className="sb-selector-panel"
        onClick={(e: Event) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e as KeyboardEvent).key === "Escape") close();
        }}
      >
        {phone && mode === "books" ? (
          // The old reader's phone header: close, the title, and the tabs.
          <div className="testament-selection">
            <button
              type="button"
              className="sb-selector-mobile-close"
              aria-label={t("close", { defaultValue: "Close" })}
              onClick={close}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <span className="sb-bible-reader-mobile-header-title">
              {t("books", { defaultValue: "Books" })}
            </span>
            <button
              type="button"
              className="sb-selector-mobile-close"
              aria-label={t("tabs", { defaultValue: "Tabs" })}
              onClick={() => {
                close();
                state.ui.sidebarDrawer.value = true;
              }}
            >
              <span className="material-symbols-outlined">view_agenda</span>
            </button>
          </div>
        ) : (
          <div className="testament-selection">
            {phone && (
              <button
                type="button"
                className="sb-selector-mobile-close"
                aria-label={t("close", { defaultValue: "Close" })}
                onClick={close}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
            {!phone && (
              <button
                type="button"
                className="sidebar-translation-selector flex-between-center"
                aria-expanded={mode === "translations"}
                aria-label={t("choose-translation", {
                  name: shortName,
                  defaultValue: "Translation: {{name}}",
                })}
                onClick={() => {
                  state.ui.selector.value =
                    mode === "translations" ? "books" : "translations";
                }}
              >
                <span className="sidebar-selected-title flex-align-center">
                  {shortName}
                </span>
                <span
                  style={{ transition: "transform 0.3s" }}
                  className={`material-symbols-outlined${mode === "translations" ? " upside-down" : ""}`}
                  aria-hidden="true"
                >
                  expand_more
                </span>
              </button>
            )}
            <div className="searchbar flex-align-center">
              <span
                className="search-icon material-symbols-outlined"
                aria-hidden="true"
              >
                search
              </span>
              <input
                className="sb-selector-search-input flex-1"
                type="search"
                value={search}
                aria-label={
                  mode === "books"
                    ? t("search-books", { defaultValue: "Search books..." })
                    : t("search-translation", {
                        defaultValue: "Search translations...",
                      })
                }
                placeholder={
                  mode === "books"
                    ? t("search-books", { defaultValue: "Search books..." })
                    : t("search-translation", {
                        defaultValue: "Search translations...",
                      })
                }
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if ((e as KeyboardEvent).key !== "Enter" || mode !== "books")
                    return;
                  const n = /(\d+)$/.exec(q)?.[1];
                  const only = books.length === 1 ? books[0]! : null;
                  if (
                    only &&
                    n &&
                    Number(n) >= 1 &&
                    Number(n) <= only.numberOfChapters
                  )
                    goTo(only.id, Number(n));
                  else if (books[0]) {
                    setSearch(books[0].name);
                    setBookPick(books[0].id);
                  }
                }}
                autoFocus
              />
            </div>
            {mode === "books" && (
              <div className="dropdown">
                <select
                  className="dropdown-select sb-selector-testament-select"
                  aria-label={t("testament", { defaultValue: "Testament" })}
                  value={testament}
                  onChange={(e) =>
                    setTestament(
                      (e.target as HTMLSelectElement).value as TestamentFilter
                    )
                  }
                >
                  {choices.map((x) => (
                    <option key={x} value={x} className="dropdown-option">
                      {testamentLabel(x)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {mode === "books" ? (
          <div
            className="sidebar-results flex-wrap-start"
            onKeyDown={(e) =>
              handleGridKeyNav(
                e as KeyboardEvent,
                e.currentTarget as HTMLElement
              )
            }
          >
            {!books.length ? (
              <p className="testament-title">
                {t("no-search-results", { defaultValue: "Nothing matches." })}
              </p>
            ) : testament === "all" ? (
              <div
                className="books-container flex-gap-md"
                dir={reading.translation.value?.textDirection ?? "ltr"}
              >
                {groups.old.length > 0 && (
                  <div
                    className="testament-container flex-col-gap-sm"
                    style={{
                      width: groups.new.length ? `${cols.otPct}%` : "100%",
                    }}
                  >
                    <span className="testament-title">
                      {testamentLabel("old")}
                    </span>
                    {grid(
                      groups.old,
                      groups.new.length ? cols.ot : cols.single
                    )}
                  </div>
                )}
                {groups.old.length > 0 && groups.new.length > 0 && (
                  <div className="separator" />
                )}
                {groups.new.length > 0 && (
                  <div
                    className="testament-container flex-col-gap-sm"
                    style={{
                      width: groups.old.length ? `${cols.ntPct}%` : "100%",
                    }}
                  >
                    <span className="testament-title">
                      {testamentLabel("new")}
                    </span>
                    {grid(
                      groups.new,
                      groups.old.length ? cols.nt : cols.single
                    )}
                  </div>
                )}
                {groups.apocrypha.length > 0 && width <= MOBILE_BREAKPOINT && (
                  <div
                    className="testament-container flex-col-gap-sm"
                    style={{ width: "100%" }}
                  >
                    <span className="testament-title">
                      {testamentLabel("apocrypha")}
                    </span>
                    {grid(groups.apocrypha, 1)}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="books-container flex-gap-md"
                dir={reading.translation.value?.textDirection ?? "ltr"}
              >
                <div
                  className="testament-container flex-col-gap-sm"
                  style={{ width: "100%" }}
                >
                  {(testament === "apocrypha" || width > MOBILE_BREAKPOINT) && (
                    <span className="testament-title">
                      {testamentLabel(testament)}
                    </span>
                  )}
                  {groups[testament].length ? (
                    grid(groups[testament], cols.single)
                  ) : (
                    <p className="testament-title sb-muted">
                      {t("testament-missing", {
                        name: testamentLabel(testament),
                        translation: shortName,
                        defaultValue:
                          "{{translation}} has no {{name}}. Pick another translation to read it.",
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="sidebar-results sb-translation-list"
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
