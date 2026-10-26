// THE SELECTOR — the old BibleSelector's overlay panel (`sb-selector-overlay` / `sb-selector-panel` and the books,
// chapters and translation lists its stylesheet dresses), with the search box and the testament filter (All / Old /
// New, and the Apocrypha when the translation carries it).
import { useEffect, useRef, useState } from "preact/hooks";
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
import { TranslationPicker } from "./TranslationPicker";

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
  /** A long press on a chapter (a finger, held a second) opens it in a new tab, as the old reader's phone picker. */
  onChapterNewTab: (book: string, chapter: number) => void;
}) {
  const { t } = useI18n();
  const { books, columns, open } = props;
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
  };
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
          onClick={() => {
            endPress();
            if (press.current?.fired) {
              press.current = null;
              return;
            }
            props.onChapter(b.id, c);
          }}
          onPointerDown={(e: PointerEvent) => {
            if (e.pointerType !== "touch") return;
            endPress();
            const hold = {
              fired: false,
              timer: window.setTimeout(() => {
                hold.fired = true;
                props.onChapterNewTab(b.id, c);
              }, 1000),
            };
            press.current = hold;
          }}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e: MouseEvent) => {
            if (press.current) e.preventDefault();
          }}
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
  const [apocryphaInfo, setApocryphaInfo] = useState(false);
  const [testament, setTestament] = useState<TestamentFilter>("all");
  const width = useViewportWidth();

  useEffect(() => {
    if (mode === "translations") void reading.loadTranslations();
    // The first time each list opens, its short tour (once; never if tutorials are off).
    if (mode === "books")
      setTimeout(() => state.tours.startContextual("selector"), 400);
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
  if (mode === "translations") return <TranslationPicker state={state} />;
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
  const queryOf = (query: string) =>
    query.replace(/\s*\d+$/, "").trim() || query;
  const matching = (query: string) => {
    const bq = queryOf(query);
    return reading.books.value.filter(
      (b) =>
        !query ||
        b.name.toLowerCase().includes(bq) ||
        b.commonName.toLowerCase().includes(bq) ||
        b.id.toLowerCase().includes(bq)
    );
  };
  const books = matching(q);
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
  const groups = groupByTestament(books, state.settings.bookOrder.value);
  const grid = (list: TranslationBook[], columns: number) => (
    <BooksGrid
      books={list}
      columns={columns}
      open={picked}
      currentBook={reading.bookId.value}
      currentChapter={reading.chapterNumber.value}
      onToggle={(id) => setBookPick(id === picked ? "" : id)}
      onChapter={goTo}
      onChapterNewTab={(book, chapter) => {
        state.tabs.addTab({
          translationId: reading.translationId.value,
          bookId: book,
          chapterNumber: chapter,
        });
        close();
      }}
    />
  );

  const apocryphaButton = (
    <button
      type="button"
      className="material-symbols-outlined apocrypha-info-button"
      aria-label={t("about-apocrypha", { defaultValue: "About the Apocrypha" })}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        setApocryphaInfo(true);
      }}
    >
      info
    </button>
  );

  return (
    <div className="sb-selector-overlay open" onClick={close}>
      {apocryphaInfo && (
        <ApocryphaInfo onClose={() => setApocryphaInfo(false)} />
      )}
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
                aria-expanded={false}
                aria-label={t("choose-translation", {
                  name: shortName,
                  defaultValue: "Translation: {{name}}",
                })}
                onClick={() => {
                  state.ui.selector.value = "translations";
                }}
              >
                <span className="sidebar-selected-title flex-align-center">
                  {shortName}
                </span>
                <span
                  style={{ transition: "transform 0.3s" }}
                  className="material-symbols-outlined"
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
                  // "John 3": the book named exactly, else the top one (John before 1 John), at that chapter.
                  // What is in the box now: Enter can come before the typing has re-rendered.
                  const typed = (e.currentTarget as HTMLInputElement).value
                    .trim()
                    .toLowerCase();
                  const found = matching(typed);
                  const n = /\s(\d+)$/.exec(typed)?.[1];
                  const top =
                    found.find(
                      (b) =>
                        b.name.toLowerCase() === queryOf(typed) ||
                        b.commonName.toLowerCase() === queryOf(typed)
                    ) ?? found[0];
                  if (
                    top &&
                    n &&
                    Number(n) >= 1 &&
                    Number(n) <= top.numberOfChapters
                  )
                    goTo(top.id, Number(n));
                  else if (top) {
                    setSearch(top.name);
                    setBookPick(top.id);
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
                      {apocryphaButton}
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
                      {testament === "apocrypha" && apocryphaButton}
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
        ) : null}
      </div>
    </div>
  );
}

/** "About the Apocrypha" — the old reader's note on why those books are kept apart. */
function ApocryphaInfo({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <>
      <div
        className="sb-apocrypha-info-backdrop"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        id="apocrypha-info"
        className="sb-apocrypha-info-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apocrypha-info-title"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-apocrypha-info">
          <div className="sb-apocrypha-info-header">
            <h2 id="apocrypha-info-title" className="sb-apocrypha-info-title">
              {t("about-apocrypha", { defaultValue: "About the Apocrypha" })}
            </h2>
            <button
              type="button"
              className="sb-apocrypha-info-close"
              aria-label={t("close", { defaultValue: "Close" })}
              onClick={onClose}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="sb-apocrypha-info-content">
            {t("apocrypha-info-text", {
              defaultValue:
                "None of the writings in this section were ever considered Scripture by early Jewish or Christian communities. The Bible is a specific collection of books. Jews and Christians have always agreed on the Old Testament, which comes from a fixed set of sacred writings the Jewish people called the Tanakh and Christians call the Old Testament. The content of the Tanakh and the Old Testament are exactly the same, but are commonly arranged differently. Christians additionally recognize the New Testament, which tells the story of Jesus, his teachings, and the writings of his followers. The writings below were known and widely read at the time the Bible was written, but they were never treated as Scripture. While ancient authors sometimes quoted a wide range of texts including poets, philosophers, and other writings, quoting something is not the same as treating it as Scripture. These writings are included here for historical and literary reference only.",
            })}
          </div>
        </div>
      </div>
    </>
  );
}
