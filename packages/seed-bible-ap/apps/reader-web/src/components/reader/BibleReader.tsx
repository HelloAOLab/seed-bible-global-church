// THE READER — the desktop shell of packages/seed-bible's BibleReader (header with the tappable book · chapter
// title and the translation button, the chapter column, the footnote modal, the skeleton and error states), over
// the ported state. One instance per pane, on that tab's reading state; selection, the toolbars and the panes
// follow the selected tab.
import { useState } from "preact/hooks";
import type { ChapterVerse } from "../../backend/bible";
import type { ReaderState } from "../../state";
import type { Reading } from "../../state/reading/reading";
import { useI18n } from "../../i18n";
import { renderChapterContent } from "./chapterContent";
import { ChapterColumn } from "./ChapterColumn";

interface SelectedFootnote {
  noteId: number;
  verse: ChapterVerse | null;
}

export function BibleReader({
  state,
  reading,
  active = true,
}: {
  state: ReaderState;
  reading: Reading;
  active?: boolean;
}) {
  const { t } = useI18n();
  const { settings, ui, selection } = state;
  const chapter = reading.chapterData.value;
  const chapterRef = reading.chapterRef.value;
  const highlights = state.highlights.forChapter(chapterRef).value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const [footnote, setFootnote] = useState<SelectedFootnote | null>(null);
  const translationLabel =
    reading.translation.value?.shortName ?? reading.translationId.value;
  const saved = state.saves.forPassage(chapterRef).length > 0;
  const bookmarked = state.bookmarks.onChapter(chapterRef).length > 0;

  const onVerseClick = (verseNumber: number, event: MouseEvent) => {
    event.stopPropagation();
    selection.toggle(verseNumber, event.shiftKey);
  };

  const body = () => {
    if (reading.error.value && !chapter) {
      return (
        <div className="sb-reader-error" role="alert">
          <span className="material-symbols-outlined sb-reader-error-icon">
            cloud_off
          </span>
          <h3 className="sb-reader-error-title">
            {t("chapter-unavailable", { defaultValue: "Chapter unavailable" })}
          </h3>
          <p className="sb-reader-error-message">{reading.error.value}</p>
          <div className="sb-reader-error-actions">
            <button
              className="sb-reader-error-retry"
              onClick={() => void reading.retry()}
            >
              {t("retry", { defaultValue: "Retry" })}
            </button>
          </div>
        </div>
      );
    }
    if (!chapter) {
      return (
        <div
          className="sb-chapter-content sb-chapter-skeleton"
          aria-busy="true"
          aria-label={t("loading-chapter", {
            defaultValue: "Loading chapter…",
          })}
        >
          {[0, 1, 2, 3].map((p) => (
            <div className="sb-chapter-skeleton-paragraph" key={p} />
          ))}
        </div>
      );
    }
    return (
      <ChapterColumn
        chapterId={`${chapter.translation.id}:${chapter.book.id}:${chapter.chapter.number}`}
        stale={reading.loading.value}
      >
        {renderChapterContent(chapter, {
          selectedVerses: active ? selection.verses.value : [],
          playingVerse: active
            ? (state.audio.currentVerse.value ?? state.tts.currentVerse.value)
            : null,
          highlights,
          decorations: active
            ? state.live.decorations.value.map((d) => ({
                id: `session:${d.id}`,
                colorId: d.colorId,
                verse:
                  d.start === d.end
                    ? d.start
                    : ([d.start, d.end] as [number, number]),
              }))
            : [],
          notes,
          scriptureElements: settings.scripture.value,
          onVerseClick,
          onOpenFootnote: (noteId, verse) => setFootnote({ noteId, verse }),
          onAnnotationVerseClick: (verseNumber, event) => {
            event.stopPropagation();
            ui.pane.value = "notes";
            ui.focusNoteVerse.value = verseNumber;
          },
        })}
        {chapter.translation.licenseNotice && (
          <p className="sb-translation-license-notice">
            {chapter.translation.licenseNotice}
          </p>
        )}
        {chapter.translation.website && (
          <p className="sb-translation-website">
            <a
              href={chapter.translation.website}
              target="_blank"
              rel="noreferrer"
            >
              {t("information-about-this-translation", {
                defaultValue: "Information about this translation",
              })}
            </a>
          </p>
        )}
      </ChapterColumn>
    );
  };

  const note =
    footnote &&
    chapter?.chapter.footnotes.find((f) => f.noteId === footnote.noteId);

  return (
    <div
      className={`sb-bible-reader sb-font-size-${settings.fontSize.value}${active ? " sb-bible-reader-active" : ""}`}
      onClick={() => selection.clear()}
    >
      <div className="sb-bible-reader-header">
        <div className="sb-bible-reader-heading">
          <h2
            className="sb-bible-reader-title"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              ui.selector.value = "books";
            }}
          >
            <span className="sb-bible-reader-book">
              {reading.bookName.value}
            </span>
            <span className="sb-bible-reader-title-sep" aria-hidden="true">
              {" "}
            </span>
            <span className="sb-bible-reader-chapter">
              {reading.chapterNumber.value}
            </span>
          </h2>
          <button
            type="button"
            className="sb-bible-reader-translation"
            aria-label={t("change-translation", {
              name: translationLabel,
              defaultValue: `Change translation (${translationLabel})`,
            })}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              ui.selector.value = "translations";
            }}
          >
            {translationLabel}
          </button>
        </div>
        <div className="sb-bible-reader-actions">
          {reading.fromDevice.value && (
            <span
              className="sb-reader-from-device"
              title={t("read-from-device", {
                defaultValue: "Read from this device",
              })}
            >
              <span className="material-symbols-outlined">offline_pin</span>
            </span>
          )}
          <button
            type="button"
            className={`sb-bible-reader-save-button${saved ? " sb-bible-reader-save-button-saved" : ""}`}
            aria-label={t("save-chapter", { defaultValue: "Save chapter" })}
            title={t("save-chapter", { defaultValue: "Save chapter" })}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              void state.saves.toggle(
                chapterRef,
                null,
                reading.translationId.value
              );
            }}
          >
            <span className="material-symbols-outlined">
              {saved ? "inventory_2" : "archive"}
            </span>
          </button>
          <button
            type="button"
            className={`sb-bible-reader-bookmark-button${bookmarked ? " sb-bible-reader-save-button-saved" : ""}`}
            aria-label={t("bookmark-this-chapter", {
              defaultValue: "Bookmark this chapter",
            })}
            title={t("bookmark-this-chapter", {
              defaultValue: "Bookmark this chapter",
            })}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              void state.bookmarks.toggle(
                chapterRef,
                `${reading.bookName.value} ${reading.chapterNumber.value}`
              );
            }}
          >
            <span className="material-symbols-outlined">
              {bookmarked ? "bookmark" : "bookmark_border"}
            </span>
          </button>
        </div>
      </div>
      <div className="sb-bible-reader-content">
        <div className="sb-bible-reader-main-content">{body()}</div>
      </div>

      {footnote && (
        <div
          className="sb-footnote-modal-overlay"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            setFootnote(null);
          }}
        >
          <div
            className="sb-footnote-modal"
            role="dialog"
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="sb-footnote-modal-header">
              <h3 className="sb-footnote-modal-title">
                {reading.bookName.value} {reading.chapterNumber.value}
                {footnote.verse ? `:${footnote.verse.number}` : ""}
              </h3>
              <button
                className="sb-footnote-modal-close"
                aria-label={t("close-footnote", {
                  defaultValue: "Close footnote",
                })}
                onClick={() => setFootnote(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="sb-footnote-modal-content">{note?.text ?? ""}</div>
          </div>
        </div>
      )}
    </div>
  );
}
