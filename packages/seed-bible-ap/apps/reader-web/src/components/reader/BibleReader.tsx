// THE READER — the desktop shell of packages/seed-bible's BibleReader (header with the tappable book · chapter
// title and the translation button, and at its end the old reader's chapter actions: ☆ Save chapter, Bookmark,
// Discover, Share and an orange Listen; the chapter column, the footnote modal, the skeleton and error states), over
// the ported state. One instance per pane, on that tab's reading state; selection, the toolbars and the panes
// follow the selected tab.
import { DiscoverPanel } from "../social/DiscoverPanel";
import { PresenceGutter, colorOf } from "../sessions/PresenceGutter";
import { ScriptureCheckBadge, verseCheckTitle } from "./ScriptureCheck";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChapterVerse, TranslationBookChapter } from "../../backend/bible";
import type { ReaderState } from "../../state";
import type { Reading } from "../../state/reading/reading";
import { useI18n } from "../../i18n";
import {
  renderChapterContent,
  type ChapterContentOptions,
} from "./chapterContent";
import { forwardRef } from "preact/compat";
import { ChapterColumn } from "./ChapterColumn";
import { ReferenceText } from "./ReferenceText";
import { attachReaderViewport, pageScrolls } from "./readerViewport";
import { routeOf } from "../../state/reading/route";
import { defaultTranslationFor } from "../../state/reading/defaultTranslation";
import { openSavePicker } from "../records/SavePicker";
import { BookmarkStackIcon, bookmarkButtonLabel } from "../records/Bookmarks";
import { SessionPeopleStack } from "../sessions/SessionPeopleStack";

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
  // An embed is someone else's page: the visitor's own highlights and notes are not drawn on it.
  const highlights = ui.embed.value
    ? []
    : state.highlights.forChapter(chapterRef).value;
  const notes = ui.embed.value
    ? []
    : state.annotations.forChapter(chapterRef).value;
  // This pane shows the live session's tab: the room's marks and where everyone is are drawn here.
  const inSession =
    state.live.active.value && state.live.sessionReading() === reading;
  const [footnote, setFootnote] = useState<SelectedFootnote | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const prevPreview = useRef<HTMLDivElement>(null);
  const nextPreview = useRef<HTMLDivElement>(null);
  // Scroll memory, the linked verse and the swipe, for this pane on this tab's reading.
  useEffect(() => {
    if (!root.current) return;
    return attachReaderViewport(root.current, reading, {
      onNavigate: () => selection.clear(),
      previews: () =>
        pageScrolls()
          ? { prev: prevPreview.current, next: nextPreview.current }
          : null,
    });
  }, [reading]);
  // The phone's swipe slides the neighbouring chapter in beside this one: fetch both ahead.
  const [neighbours, setNeighbours] = useState<{
    prev: TranslationBookChapter | null;
    next: TranslationBookChapter | null;
  }>({ prev: null, next: null });
  useEffect(() => {
    if (!chapter || !pageScrolls())
      return setNeighbours({ prev: null, next: null });
    let live = true;
    void Promise.all([reading.peek("prev"), reading.peek("next")]).then(
      ([prev, next]) => live && setNeighbours({ prev, next })
    );
    return () => {
      live = false;
    };
  }, [chapter]);
  const translationLabel =
    reading.translation.value?.shortName ?? reading.translationId.value;
  // The text on screen, checked against what was published (state/reading/scriptureCheck.ts).
  const check = state.scriptureCheck.of(chapter as never);
  const verseChecks = check && "verses" in check ? check.verses : undefined;
  const saved = state.saves.forPassage(chapterRef).length > 0;
  const bookmarksHere = state.bookmarks.onChapter(
    chapterRef,
    reading.translationId.value
  );
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

  // A drag over the text (or a phone's text selection) chooses every verse it touches, as the old reader does; the
  // click that trails the drag must not toggle a verse back off, nor clear the choice.
  const justDragged = useRef(false);
  const chooseDraggedVerses = () => {
    const sel = window.getSelection();
    if (!active || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const content = root.current?.querySelector(".sb-chapter-content");
    if (!content || !content.contains(range.commonAncestorContainer)) return;
    const touched = new Set<number>();
    for (const el of content.querySelectorAll<HTMLElement>(
      "[data-verse-number]"
    ))
      if (range.intersectsNode(el))
        touched.add(Number(el.dataset["verseNumber"]));
    if (!touched.size) return;
    sel.removeAllRanges();
    justDragged.current = true;
    selection.select(Math.min(...touched), Math.max(...touched));
  };
  const onVerseClick = (verseNumber: number, event: MouseEvent) => {
    event.stopPropagation();
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
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
        gutter={inSession ? <PresenceGutter state={state} /> : undefined}
      >
        {renderChapterContent(chapter, {
          selectedVerses: active ? selection.verses.value : [],
          playingVerse: active
            ? (state.audio.currentVerse.value ?? state.tts.currentVerse.value)
            : null,
          highlights,
          decorations: inSession
            ? state.live.decorations.value.map((d) => ({
                id: `session:${d.id}`,
                colorId: d.colorId,
                verse:
                  d.start === d.end
                    ? d.start
                    : ([d.start, d.end] as [number, number]),
              }))
            : [],
          flares: inSession
            ? state.live.flares.value
                .filter((f) => f.chapter === reading.chapterRef.value)
                .map((f) => ({
                  id: f.id,
                  verse: f.verse,
                  color: colorOf(f.agent),
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

  // An embed's header, as the old reader's: the chapter opened in Seed Bible itself, and the Theme & text sheet.
  const embed = ui.embed.value;
  const embedActions = (
    <>
      <button
        type="button"
        className="sb-bible-reader-action-button sb-bible-reader-open-tab"
        aria-label={t("open-in-new-tab", { defaultValue: "Open in New Tab" })}
        title={t("open-in-new-tab", { defaultValue: "Open in New Tab" })}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          window.open(
            `${location.origin}${routeOf({
              translationId: reading.translationId.value,
              bookId: reading.bookId.value,
              chapterNumber: reading.chapterNumber.value,
            })}`,
            "_blank",
            "noopener,noreferrer"
          );
        }}
      >
        <span className="material-symbols-outlined">open_in_new</span>
      </button>
      <button
        type="button"
        className="sb-bible-reader-action-button sb-bible-reader-mobile-header-settings"
        aria-label={t("text-settings", { defaultValue: "Text settings" })}
        title={t("text-settings", { defaultValue: "Text settings" })}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          ui.textSheet.value = true;
        }}
      >
        <span className="material-symbols-outlined">tune</span>
      </button>
    </>
  );

  // The chapter's own actions, the same on the desktop header and the phone's; Save and Bookmark step aside while a
  // playlist plays (the old reader's rule: the playlist's own card is what is being read).
  const saveButtons = state.playlists.playing.value ? null : (
    <>
      <button
        type="button"
        className={`sb-bible-reader-save-button${saved ? " sb-bible-reader-save-button-saved" : ""}`}
        aria-label={t("save-chapter", { defaultValue: "Save chapter" })}
        title={t("save-chapter", { defaultValue: "Save chapter" })}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          openSavePicker(state, chapterRef, null, reading.translationId.value);
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
        className={`sb-bible-reader-bookmark-button${bookmarksHere.length ? " sb-bible-reader-save-button-saved" : ""}`}
        aria-label={bookmarkButtonLabel(t, bookmarksHere)}
        title={bookmarkButtonLabel(t, bookmarksHere)}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          ui.bookmarkPicker.value = {
            chapterRef,
            edition: reading.translationId.value,
          };
        }}
      >
        <BookmarkStackIcon bookmarks={bookmarksHere} />
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
    <>
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
        onPointerDown={() => (justDragged.current = false)}
        onPointerUp={chooseDraggedVerses}
        onClick={() => {
          if (justDragged.current) {
            justDragged.current = false;
            return;
          }
          selection.clear();
        }}
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
          {!embed && notes.length > 0 && (
            <button
              type="button"
              className="sb-bible-reader-mobile-header-notes"
              aria-label={t("chapter-notes-count", {
                defaultValue: "{{count}} notes for this chapter",
                count: notes.length,
              })}
              title={t("chapter-notes-count", {
                defaultValue: "{{count}} notes for this chapter",
                count: notes.length,
              })}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                ui.pane.value = "notes";
                ui.focusNoteVerse.value = Math.min(
                  ...notes.map((n) => n.start || 1)
                );
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                sticky_note_2
              </span>
              <span className="sb-bible-reader-mobile-header-notes-count">
                {notes.length}
              </span>
            </button>
          )}
          <div className="sb-bible-reader-mobile-header-actions">
            {embed ? (
              embedActions
            ) : (
              <>
                {saveButtons}
                {shareButton}
                {inSession && <SessionPeopleStack state={state} />}
                <button
                  type="button"
                  className="sb-bible-reader-mobile-header-settings"
                  aria-label={t("text-settings", {
                    defaultValue: "Text settings",
                  })}
                  title={t("text-settings", { defaultValue: "Text settings" })}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    ui.textSheet.value = true;
                  }}
                >
                  <span className="material-symbols-outlined">tune</span>
                </button>
              </>
            )}
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
            {embed ? embedActions : null}
            {!embed && reading.fromDevice.value && (
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
            {!embed && saveButtons}
            {!embed && (
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
            )}
            {!embed && shareButton}
            {!embed && active && canPlay && (
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
          {active && settings.showDiscovered.value && (
            <DiscoverPanel state={state} />
          )}
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
              <div className="sb-footnote-modal-content">
                <ReferenceText
                  text={note?.text ?? ""}
                  books={reading.books.value}
                  onReference={(r) => {
                    setFootnote(null);
                    void reading
                      .goTo(reading.translationId.value, r.bookId, r.chapter)
                      .then(() => {
                        if (r.from) selection.select(r.from, r.to ?? r.from);
                      });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <SwipePreview
        ref={prevPreview}
        chapter={neighbours.prev}
        scripture={settings.scripture.value}
        fontSize={settings.fontSize.value}
      />
      <SwipePreview
        ref={nextPreview}
        chapter={neighbours.next}
        scripture={settings.scripture.value}
        fontSize={settings.fontSize.value}
      />
    </>
  );
}

/** A neighbouring chapter as the swipe shows it sliding in: its title and text, nothing to tap. */
const SwipePreview = forwardRef<
  HTMLDivElement,
  {
    chapter: TranslationBookChapter | null;
    scripture: ChapterContentOptions["scriptureElements"];
    fontSize: string | number;
  }
>(function SwipePreview({ chapter, scripture, fontSize }, ref) {
  return (
    <div
      ref={ref}
      className={`sb-reader-swipe-preview sb-bible-reader sb-font-size-${fontSize}`}
      dir={chapter?.translation.textDirection}
      aria-hidden="true"
      style={{ visibility: "hidden" }}
    >
      {chapter && (
        <>
          <div className="sb-reader-swipe-preview-header">
            <span className="sb-reader-swipe-preview-title">
              {chapter.book.name} {chapter.chapter.number}
            </span>
            <span className="sb-reader-swipe-preview-translation">
              {chapter.translation.shortName}
            </span>
          </div>
          <div className="sb-chapter-content">
            {renderChapterContent(chapter, {
              selectedVerses: [],
              highlights: [],
              notes: [],
              scriptureElements: scripture,
              onVerseClick: () => {},
              onOpenFootnote: () => {},
              onAnnotationVerseClick: () => {},
            })}
          </div>
        </>
      )}
    </div>
  );
});
