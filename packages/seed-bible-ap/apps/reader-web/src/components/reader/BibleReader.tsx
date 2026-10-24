// THE READER — the desktop shell of packages/seed-bible's BibleReader (header with the tappable book · chapter
// title and the translation button, and at its end the old reader's chapter actions: ☆ Save chapter, Bookmark,
// Discover, Share and an orange Listen; the chapter column, the footnote modal, the skeleton and error states), over
// the ported state. One instance per pane, on that tab's reading state; selection, the toolbars and the panes
// follow the selected tab.
import { DiscoverPanel } from "../social/DiscoverPanel";
import { ScriptureCheckBadge, verseCheckTitle } from "./ScriptureCheck";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChapterVerse } from "../../backend/bible";
import type { ReaderState } from "../../state";
import type { Reading } from "../../state/reading/reading";
import { useI18n } from "../../i18n";
import { renderChapterContent } from "./chapterContent";
import { ChapterColumn } from "./ChapterColumn";
import { attachReaderViewport } from "./readerViewport";
import { routeOf } from "../../state/reading/route";
import { defaultTranslationFor } from "../../state/reading/defaultTranslation";

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
  const { t, language } = useI18n();
  const { settings, ui, selection } = state;
  const chapter = reading.chapterData.value;
  const chapterRef = reading.chapterRef.value;
  const highlights = state.highlights.forChapter(chapterRef).value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const [footnote, setFootnote] = useState<SelectedFootnote | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // Scroll memory, the linked verse and the swipe, for this pane on this tab's reading.
  useEffect(() => {
    if (!root.current) return;
    return attachReaderViewport(root.current, reading, {
      onNavigate: () => selection.clear(),
    });
  }, [reading]);
  const translationLabel =
    reading.translation.value?.shortName ?? reading.translationId.value;
  // The text on screen, checked against what was published (state/reading/scriptureCheck.ts).
  const check = state.scriptureCheck.of(chapter as never);
  const verseChecks = check && "verses" in check ? check.verses : undefined;
  const saved = state.saves.forPassage(chapterRef).length > 0;
  const bookmarked = state.bookmarks.onChapter(chapterRef).length > 0;
  // Listen: the chapter's recording where it has one, else the device's voice where it speaks the language.
  const audio = state.audio;
  const playing =
    audio.controller.isPlaying.value || state.tts.isSpeaking.value;
  const canPlay =
    audio.available.value || state.tts.canSpeakLanguage(state.speechLang());
  const chapterLabel = `${reading.bookName.value} ${reading.chapterNumber.value}`;

  // A chapter that fails: is its translation one the scripture agent serves at all? (A link to one it does not —
  // `/read/WEB/…` once WEB became ENGWEBP — can never load, so Retry alone would be a dead end.)
  const failed = !!reading.error.value && !chapter;
  const [served, setServed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!failed) return setServed(null);
    let live = true;
    void reading.loadTranslations().then((list) => {
      if (live && list.length)
        setServed(list.some((x) => x.id === reading.translationId.value));
    });
    return () => {
      live = false;
    };
  }, [failed, reading.translationId.value]);
  const fallbackTranslation = defaultTranslationFor(language);

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
            {served === false
              ? t("translation-not-served", {
                  defaultValue: "This translation isn't available here",
                })
              : t("chapter-unavailable", {
                  defaultValue: "Chapter unavailable",
                })}
          </h3>
          <p className="sb-reader-error-message">
            {served === false
              ? t("translation-not-served-body", {
                  id: reading.translationId.value,
                  defaultValue:
                    "{{id}} is not among the Bibles this reader serves. Read this chapter in another translation.",
                })
              : reading.error.value}
          </p>
          <div className="sb-reader-error-actions">
            {served === false ? (
              <button
                className="sb-reader-error-retry"
                onClick={() =>
                  void reading.goTo(
                    fallbackTranslation,
                    reading.bookId.value,
                    reading.chapterNumber.value
                  )
                }
              >
                {t("read-in-translation", {
                  id: fallbackTranslation,
                  defaultValue: "Read in {{id}}",
                })}
              </button>
            ) : (
              <button
                className="sb-reader-error-retry"
                onClick={() => void reading.retry()}
              >
                {t("retry", { defaultValue: "Retry" })}
              </button>
            )}
            <button
              className="sb-reader-error-switch"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                ui.selector.value = "translations";
              }}
            >
              {t("choose-translation", {
                defaultValue: "Choose a translation",
              })}
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
          ...(verseChecks
            ? { verseChecks, verseCheckTitle: verseCheckTitle(t) }
            : {}),
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

  // The chapter's own actions, the same on the desktop header and the phone's.
  const saveButtons = (
    <>
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
        <span
          className={`material-symbols-outlined${saved ? " sb-icon-filled" : ""}`}
        >
          star
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
    </>
  );
  const shareButton = (
    <button
      type="button"
      className="sb-bible-reader-action-button"
      aria-label={t("share", { defaultValue: "Share" })}
      title={t("share", { defaultValue: "Share" })}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        ui.share.value = {
          title: chapterLabel,
          url: `${location.origin}${routeOf({
            translationId: reading.translationId.value,
            bookId: reading.bookId.value,
            chapterNumber: reading.chapterNumber.value,
          })}`,
        };
      }}
    >
      <span className="material-symbols-outlined">share</span>
    </button>
  );

  return (
    <div
      ref={root}
      onContextMenu={(e: MouseEvent) => {
        // A right-click on a verse opens the verse toolbar as a menu at the pointer (the old ContextMenu).
        const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
          "[data-verse-number]"
        );
        if (!el || !active) return;
        e.preventDefault();
        const n = Number(el.dataset["verseNumber"]);
        if (!selection.verses.value.includes(n)) selection.select(n, n);
        ui.verseMenuAt.value = { x: e.clientX, y: e.clientY };
      }}
      className={`sb-bible-reader sb-font-size-${settings.fontSize.value}${active ? " sb-bible-reader-active" : ""}`}
      // The translation's own direction (Hebrew, Arabic run right to left), as the old reader sets it.
      dir={reading.translation.value?.textDirection}
      onClick={() => selection.clear()}
    >
      <div className="sb-bible-reader-mobile-header">
        <div className="sb-bible-reader-mobile-header-text">
          <h1 className="sb-bible-reader-mobile-header-title">
            <button
              type="button"
              className="sb-bible-reader-mobile-header-translation"
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
          </h1>
        </div>
        <div className="sb-bible-reader-mobile-header-actions">
          {saveButtons}
          {shareButton}
          <button
            type="button"
            className="sb-bible-reader-mobile-header-settings"
            aria-label={t("text-settings", { defaultValue: "Text settings" })}
            title={t("text-settings", { defaultValue: "Text settings" })}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              ui.sidebarDrawer.value = true;
              ui.settingsView.value = "display";
            }}
          >
            <span className="material-symbols-outlined">tune</span>
          </button>
        </div>
      </div>
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
          <ScriptureCheckBadge
            check={check}
            translationName={
              reading.translation.value?.name ?? translationLabel
            }
            chapterLabel={`${reading.bookName.value} ${reading.chapterNumber.value}`}
          />
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
          {/* The old reader's chapter actions, in its order. */}
          {saveButtons}
          <button
            type="button"
            className={`sb-bible-reader-action-button${ui.pane.value === "discover" ? " sb-bible-reader-save-button-saved" : ""}`}
            aria-label={t("discover", { defaultValue: "Discover" })}
            title={t("discover", { defaultValue: "Discover" })}
            aria-pressed={ui.pane.value === "discover"}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              ui.pane.value =
                ui.pane.value === "discover" ? "none" : "discover";
            }}
          >
            <span className="material-symbols-outlined">explore</span>
          </button>
          {shareButton}
          {active && canPlay && (
            <button
              type="button"
              className="sb-bible-reader-play-button"
              aria-label={
                playing
                  ? t("pause", { defaultValue: "Pause" })
                  : t("listen", { defaultValue: "Listen" })
              }
              title={
                playing
                  ? t("pause", { defaultValue: "Pause" })
                  : t("listen", { defaultValue: "Listen" })
              }
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                if (state.tts.isSpeaking.value) state.tts.stop();
                else if (audio.controller.isPlaying.value) audio.pause();
                else if (audio.available.value) audio.play();
                else state.listen();
              }}
            >
              <span className="material-symbols-outlined sb-icon-filled">
                {playing ? "pause" : "play_arrow"}
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="sb-bible-reader-content">
        <div className="sb-bible-reader-main-content">
          <h2
            className="sb-bible-reader-mobile-content-title sb-bible-reader-mobile-content-title-tappable"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              ui.selector.value = "books";
            }}
          >
            <span className="sb-bible-reader-book">
              {reading.bookName.value}
            </span>
            <span className="sb-bible-reader-chapter">
              {reading.chapterNumber.value}
            </span>
          </h2>
          {body()}
        </div>
        {active && <DiscoverPanel state={state} />}
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
