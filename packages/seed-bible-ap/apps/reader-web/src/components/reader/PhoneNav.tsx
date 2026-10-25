// THE PHONE'S NAVIGATION — the old reader's (packages/seed-bible BibleReaderToolbar, small screens): above the bottom
// edge, play on the left and the chapter pill ‹ John 3 ›; under it the five tabs Today · You · Bible · Search ·
// More. Bible on the text opens the book picker; More is a sheet of everything else (the toolbar's own actions, then
// Saves, Bookmarks, Tabs and Settings). Drawn only on a phone; the labelled bar is the desktop's.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { Avatar } from "../chrome/ConnectedChip";
import { SeedBibleIcon } from "../chrome/icons";
import { AudioScrubber } from "./AudioScrubber";
import { TasksIcon } from "./SidebarPanels";
import { toolbarActions } from "./ReaderToolbar";
import type { ComponentChildren } from "preact";
import { chatBadge } from "../sessions/ChatPanel";

function Tab(props: {
  label: string;
  icon?: string;
  node?: ComponentChildren;
  active: boolean;
  badge?: number | string;
  onClick: () => void;
}) {
  return (
    <div className="sb-reader-toolbar-item sb-reader-toolbar-mobile-tab">
      <button
        type="button"
        onClick={props.onClick}
        className={`sb-reader-toolbar-button sb-reader-toolbar-mobile-tab-button${props.active ? " sb-reader-toolbar-mobile-tab-button-active" : ""}`}
        aria-label={props.label}
        aria-current={props.active ? "page" : undefined}
      >
        {props.node ? (
          <span
            className="sb-reader-toolbar-mobile-tab-icon sb-reader-toolbar-mobile-tab-icon-custom"
            aria-hidden="true"
          >
            {props.node}
          </span>
        ) : (
          <span
            className="material-symbols-outlined sb-reader-toolbar-mobile-tab-icon"
            aria-hidden="true"
          >
            {props.icon}
          </span>
        )}
        <span className="sb-reader-toolbar-mobile-tab-label">
          {props.label}
        </span>
        {props.badge ? (
          <span className="sb-reader-toolbar-unread-indicator">
            {props.badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/** The old reader's play button: a filled circle with the glyph cut out of it. */
function PlayGlyph({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="22" />
      {playing ? (
        <>
          <rect x="15" y="13" width="5" height="18" rx="1.5" />
          <rect x="24" y="13" width="5" height="18" rx="1.5" />
        </>
      ) : (
        <path d="M17 13.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 17 13.5Z" />
      )}
    </svg>
  );
}

/** The chapter bar: play on the left and the pill ‹ John 3 › (the book picker in the middle). The phone's, and an
 *  embed's at any width — there it is the only way around the chapter, as in the old reader. */
export function ChapterNav({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, ui, audio, tts } = state;
  const audioPlaying = audio.controller.isPlaying.value;
  const audioActive = audioPlaying || audio.controller.currentTime.value > 0;
  const speaking = tts.isSpeaking.value;
  const canListen =
    !audio.available.value && tts.canSpeakLanguage(state.speechLang());
  const canPlay = audio.available.value || canListen;
  const playing = audioPlaying || speaking;
  return (
    <div
      className={`sb-reader-floating-nav${audioPlaying ? " sb-reader-floating-nav-scrubbing" : ""}`}
      role="group"
      aria-label={t("chapter-navigation", {
        defaultValue: "Chapter navigation",
      })}
    >
      {canPlay && (
        <div className="sb-reader-floating-nav-play-wrap">
          <button
            type="button"
            className="sb-reader-floating-nav-play"
            aria-label={
              playing
                ? t("pause", { defaultValue: "Pause" })
                : t("play", { defaultValue: "Play" })
            }
            onClick={() => {
              if (speaking) tts.stop();
              else if (audioPlaying) audio.pause();
              else if (audio.available.value) audio.play();
              else state.listen();
            }}
          >
            <PlayGlyph playing={playing} />
          </button>
        </div>
      )}
      <div className="sb-reader-floating-nav-group-wrap">
        {audioActive && (
          <AudioScrubber
            playback={audio.controller}
            showTimeRemaining
            className="sb-reader-floating-nav-scrubber"
          />
        )}
        <div className="sb-reader-floating-nav-group">
          <button
            type="button"
            className="sb-reader-floating-nav-arrow"
            aria-label={t("previous-chapter", {
              defaultValue: "Previous Chapter",
            })}
            disabled={!reading.hasPrev.value}
            onClick={() => void reading.prev()}
          >
            <span className="material-symbols-outlined rtl-mirror">
              chevron_left
            </span>
          </button>
          <button
            type="button"
            className="sb-reader-floating-nav-label"
            onClick={() => (ui.selector.value = "books")}
          >
            <div>{reading.bookName.value || " "}</div>
            <div>{reading.chapterNumber.value}</div>
          </button>
          <button
            type="button"
            className="sb-reader-floating-nav-arrow"
            aria-label={t("next-chapter", { defaultValue: "Next Chapter" })}
            disabled={!reading.hasNext.value}
            onClick={() => void reading.next()}
          >
            <span className="material-symbols-outlined rtl-mirror">
              chevron_right
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PhoneNav({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, ui, audio, tts, settings } = state;
  const [moreOpen, setMoreOpen] = useState(false);
  const pane = ui.pane.value;
  const signedIn = !!state.session.value;

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest?.(".sb-mobile-more-menu, .sb-phone-more-tab"))
        setMoreOpen(false);
    };
    // Esc closes More and nothing else (caught before the reader's keys, which would close a pane).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [moreOpen]);

  /** Whatever covers the reader goes, so the tab tapped is what shows. */
  const clear = () => {
    setMoreOpen(false);
    ui.sidebarDrawer.value = false;
    ui.settingsView.value = null;
  };
  const show = (p: typeof ui.pane.value) => {
    clear();
    ui.pane.value = ui.pane.value === p ? "none" : p;
  };

  const you = ["profile", "edit-profile", "account"].includes(pane);
  const active = moreOpen
    ? "more"
    : pane === "today"
      ? "today"
      : you
        ? "you"
        : ui.searchOpen.value
          ? "search"
          : pane === "none" && !ui.sidebarDrawer.value
            ? "bible"
            : "none";

  const dark = settings.resolvedTheme().id === "dark";
  const notes = state.annotations.forChapter(reading.chapterRef.value).value
    .length;
  const actions = toolbarActions(state, t, {
    togglePane: (p) => show(p),
    dark,
    notes,
  }).filter((a) => a.id !== "today" && a.id !== "content");
  const extras = [
    {
      id: "saves",
      icon: "star",
      label: t("saves", { defaultValue: "Saves" }),
      onClick: () => {
        clear();
        ui.pane.value = "none";
        ui.savesPanel.value = true;
        ui.sidebarDrawer.value = true;
      },
    },
    {
      id: "bookmarks",
      icon: "bookmarks",
      label: t("bookmarks", { defaultValue: "Bookmarks" }),
      onClick: () => {
        clear();
        ui.pane.value = "none";
        ui.bookmarksPanel.value = true;
        ui.sidebarDrawer.value = true;
      },
    },
    {
      id: "tabs",
      icon: "view_agenda",
      label: t("tabs", { defaultValue: "Tabs" }),
      onClick: () => {
        clear();
        ui.pane.value = "none";
        ui.sidebarDrawer.value = true;
      },
    },
    {
      id: "settings",
      icon: "settings",
      label: t("settings", { defaultValue: "Settings" }),
      onClick: () => {
        clear();
        ui.pane.value = "none";
        ui.sidebarDrawer.value = true;
        ui.settingsView.value = "main";
      },
    },
  ];

  // The verse sheet takes the bottom of the screen while verses are chosen, as in the old reader.
  if (state.selection.verses.value.length > 0) return null;
  return (
    <div className="sb-reader-toolbar-wrap sb-phone-nav">
      {active === "bible" && <ChapterNav state={state} />}
      <nav className="sb-reader-toolbar sb-reader-toolbar-mobile-layout">
        <Tab
          label={t("today", { defaultValue: "Today" })}
          node={<TasksIcon />}
          active={active === "today"}
          onClick={() => show("today")}
        />
        <Tab
          label={t("you", { defaultValue: "You" })}
          {...(signedIn
            ? { node: <Avatar state={state} /> }
            : { icon: "account_circle" })}
          active={active === "you"}
          badge={state.outbox.pending.value}
          onClick={() => show(signedIn ? "profile" : "account")}
        />
        <Tab
          label={t("bible", { defaultValue: "Bible" })}
          node={<SeedBibleIcon size={24} />}
          active={active === "bible"}
          onClick={() => {
            // On the text already: the book picker, as the old reader does.
            if (active === "bible") ui.selector.value = "books";
            else {
              clear();
              ui.pane.value = "none";
            }
          }}
        />
        <Tab
          label={t("search", { defaultValue: "Search" })}
          icon="search"
          active={active === "search"}
          onClick={() => {
            const opening = !ui.searchOpen.value;
            clear();
            ui.pane.value = "none";
            ui.searchOpen.value = opening;
          }}
        />
        <div className="sb-reader-toolbar-item sb-reader-toolbar-mobile-tab sb-reader-toolbar-more-anchor sb-phone-more-tab">
          <button
            type="button"
            className={`sb-reader-toolbar-button sb-reader-toolbar-mobile-tab-button${active === "more" ? " sb-reader-toolbar-mobile-tab-button-active" : ""}`}
            aria-label={t("more", { defaultValue: "More" })}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <span
              className="material-symbols-outlined sb-reader-toolbar-mobile-tab-icon"
              aria-hidden="true"
            >
              menu
            </span>
            <span className="sb-reader-toolbar-mobile-tab-label">
              {t("more", { defaultValue: "More" })}
            </span>
            {/* Chat lives in More on a phone, so More carries what came unread there. */}
            {!moreOpen && chatBadge(state) && (
              <span className="sb-reader-toolbar-unread-indicator">
                {chatBadge(state)}
              </span>
            )}
          </button>
          {moreOpen && (
            <div className="sb-mobile-more-menu" role="menu">
              {[
                ...actions.filter((a) => a.id === "discover"),
                ...extras.filter((a) => a.id !== "settings"),
                ...actions.filter((a) => a.id !== "discover"),
                ...extras.filter((a) => a.id === "settings"),
              ].map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className="sb-mobile-more-menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    a.onClick();
                  }}
                >
                  <span
                    className="material-symbols-outlined sb-mobile-more-menu-icon"
                    aria-hidden="true"
                  >
                    {a.icon}
                  </span>
                  <span className="sb-mobile-more-menu-label">{a.label}</span>
                  {"badge" in a && a.badge ? (
                    <span className="sb-mobile-more-menu-unread-indicator">
                      {a.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
