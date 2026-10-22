// YOUR CONTENT — the old YourContentPane's shape (search box, then sections) over the ported state: verse search
// (a typed reference opens the chapter; free text asks Typesense), saves, bookmarks, and this chapter's highlights
// and notes. Dressed by the copied `your-content.css`.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { VerseHit } from "../../backend/search";
import { noteText } from "./noteHtml";
import { getVersePlainText } from "../reader/chapterContent";

function refLabel(
  state: ReaderState,
  chapter: string,
  start: number | null,
  end: number | null
) {
  const [book, ch] = chapter.split(".");
  const name =
    state.reading.books.value.find((b) => b.id === book)?.name ?? book;
  if (start === null) return `${name} ${ch}`;
  return `${name} ${ch}:${start === end ? start : `${start}–${end}`}`;
}

export function YourContentPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, saves, bookmarks } = state;
  const chapterRef = reading.chapterRef.value;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VerseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const open = (chapter: string, start?: number, end?: number) => {
    const [book, ch] = chapter.split(".");
    void reading
      .goTo(reading.translationId.value, book!, Number(ch))
      .then(() => {
        if (start) state.selection.select(start, end ?? start);
      });
  };

  useEffect(() => {
    abort.current?.abort();
    const q = query.trim();
    if (!q) {
      setHits(null);
      setSearchError(null);
      return;
    }
    const ref = state.search.parseReference(q, reading.books.value);
    if (ref) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    abort.current = ctl;
    const timer = setTimeout(() => {
      setSearching(true);
      state.search
        .searchVerses(
          reading.translation.value?.language ?? "eng",
          reading.translationId.value,
          q,
          ctl.signal
        )
        .then((r) => {
          if (ctl.signal.aborted) return;
          setHits(r.hits);
          setSearchError(null);
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return;
          setSearchError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => !ctl.signal.aborted && setSearching(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, reading.translationId.value]);

  const typedRef = query.trim()
    ? state.search.parseReference(query.trim(), reading.books.value)
    : null;
  const chapterHighlights = state.highlights.forChapter(chapterRef).value;
  const chapterNotes = state.annotations.forChapter(chapterRef).value;
  const verseText = (n: number) => {
    const v = reading.chapterData.value?.chapter.content.find(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        (e as { type?: string }).type === "verse" &&
        (e as { number?: number }).number === n
    ) as { content: Parameters<typeof getVersePlainText>[0] } | undefined;
    return v ? getVersePlainText(v.content) : "";
  };

  return (
    <section
      className="sb-pane sb-content-screen"
      aria-label={t("your-content", { defaultValue: "Your content" })}
    >
      <header className="sb-pane-header">
        <h2>{t("your-content", { defaultValue: "Your content" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <form
        className="sb-content-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (typedRef)
            open(
              `${typedRef.book}.${typedRef.chapter}`,
              typedRef.verse,
              typedRef.endVerse ?? typedRef.verse
            );
        }}
      >
        <span className="material-symbols-outlined">search</span>
        <input
          type="search"
          value={query}
          placeholder={t("today-search-verses", {
            defaultValue: "Search books, chapters, verses...",
          })}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        {query && (
          <button
            type="button"
            className="sb-pane-close"
            aria-label={t("clear-search", { defaultValue: "Clear search" })}
            onClick={() => setQuery("")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </form>

      {typedRef && (
        <div className="sb-content-section">
          <button
            className="sb-content-quote"
            onClick={() =>
              open(
                `${typedRef.book}.${typedRef.chapter}`,
                typedRef.verse,
                typedRef.endVerse ?? typedRef.verse
              )
            }
          >
            <span className="sb-content-quote-ref">
              {t("open-chapter", { defaultValue: "Open chapter" })}:{" "}
              {refLabel(
                state,
                `${typedRef.book}.${typedRef.chapter}`,
                typedRef.verse ?? null,
                typedRef.endVerse ?? typedRef.verse ?? null
              )}
            </span>
          </button>
        </div>
      )}
      {!typedRef && query.trim() && (
        <div className="sb-content-section">
          {searching && (
            <p className="sb-content-status sb-content-status--loading">
              {t("searching", { defaultValue: "Searching..." })}
            </p>
          )}
          {searchError && <p className="sb-pane-error">{searchError}</p>}
          {hits && !hits.length && !searching && !searchError && (
            <p className="sb-content-empty">
              {t("no-search-results", { defaultValue: "No matching verses." })}
            </p>
          )}
          {hits?.map((h) => (
            <button
              key={h.id}
              className="sb-content-quote"
              onClick={() => open(`${h.book}.${h.chapter}`, h.verse, h.verse)}
            >
              <span className="sb-content-quote-ref">{h.reference}</span>
              <span className="sb-content-quote-text">{h.text}</span>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && (
        <>
          <div className="sb-content-section sb-content-saves">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("saves", { defaultValue: "Saves" })}
              </h3>
            </div>
            {!saves.all.value.length && (
              <p className="sb-content-empty">
                {t("your-content-empty-saves", {
                  defaultValue: "Passages you save will show up here.",
                })}
              </p>
            )}
            {saves.all.value.map((s) => (
              <div key={s.id} className="sb-content-save-row">
                <button
                  className="sb-content-save"
                  onClick={() =>
                    open(s.chapter, s.start ?? undefined, s.end ?? undefined)
                  }
                >
                  <span
                    className={`sb-content-save-kind${s.start !== null ? " sb-content-save-kind-verse" : ""}`}
                  >
                    <span className="material-symbols-outlined">
                      {s.start !== null ? "format_quote" : "menu_book"}
                    </span>
                  </span>
                  <span className="sb-content-save-name">
                    {s.label ?? refLabel(state, s.chapter, s.start, s.end)}
                  </span>
                  <span className="sb-content-save-date">
                    {s.createdAt.slice(0, 10)}
                  </span>
                </button>
                <button
                  className="sb-content-kebab"
                  aria-label={t("remove-save", { defaultValue: "Remove save" })}
                  onClick={() => void saves.remove(s.id)}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            ))}
          </div>

          <div className="sb-content-section">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("bookmarks", { defaultValue: "Bookmarks" })}
              </h3>
            </div>
            {!bookmarks.all.value.length && (
              <p className="sb-content-empty">
                {t("bookmark-move-hint", {
                  defaultValue: "Chapters you bookmark will show up here.",
                })}
              </p>
            )}
            {bookmarks.all.value.map((b) => (
              <div key={b.id} className="sb-content-save-row">
                <button
                  className="sb-content-save"
                  onClick={() => open(b.chapter)}
                >
                  <span className="sb-content-save-kind">
                    <span className="material-symbols-outlined">bookmark</span>
                  </span>
                  <span className="sb-content-save-name">{b.name}</span>
                  <span className="sb-content-save-date">
                    {b.updatedAt.slice(0, 10)}
                  </span>
                </button>
                <button
                  className="sb-content-kebab"
                  aria-label={t("remove-bookmark", {
                    defaultValue: "Remove bookmark",
                  })}
                  onClick={() => void bookmarks.remove(b.id)}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            ))}
          </div>

          <div className="sb-content-section sb-content-highlights">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("highlights", { defaultValue: "Highlights" })} ·{" "}
                {reading.bookName.value} {reading.chapterNumber.value}
              </h3>
            </div>
            {!chapterHighlights.length && (
              <p className="sb-content-empty">
                {t("your-content-empty-highlights", {
                  defaultValue: "Verses you highlight will show up here.",
                })}
              </p>
            )}
            {chapterHighlights.map((h) => {
              const start = typeof h.verse === "number" ? h.verse : h.verse[0];
              const end = typeof h.verse === "number" ? h.verse : h.verse[1];
              return (
                <button
                  key={h.id}
                  className="sb-content-highlight-row"
                  onClick={() => state.selection.select(start, end)}
                >
                  <span
                    className="sb-content-highlight"
                    style={{
                      background: `var(--sb-highlight-${h.colorId}-color)`,
                    }}
                  />
                  <span className="sb-content-highlight-ref">
                    {refLabel(state, chapterRef, start, end)}
                  </span>
                  <span className="sb-content-highlight-text">
                    {verseText(start)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sb-content-section sb-content-annotations">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("notes", { defaultValue: "Notes" })} ·{" "}
                {reading.bookName.value} {reading.chapterNumber.value}
              </h3>
              <button
                className="sb-content-see-all"
                onClick={() => (state.ui.pane.value = "notes")}
              >
                {t("see-all", { defaultValue: "See all" })}
              </button>
            </div>
            {!chapterNotes.length && (
              <p className="sb-content-empty">
                {t("feed-empty-notes", {
                  defaultValue: "No notes on this chapter yet.",
                })}
              </p>
            )}
            {chapterNotes.slice(0, 5).map((n) => (
              <button
                key={n.id}
                className="sb-content-annotation"
                onClick={() => {
                  state.ui.pane.value = "notes";
                  state.ui.focusNoteVerse.value = n.start;
                }}
              >
                <span className="sb-content-annotation-head">
                  {refLabel(state, chapterRef, n.start, n.end)}
                </span>
                <span className="sb-content-annotation-body">
                  {noteText(n.note).slice(0, 140)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
