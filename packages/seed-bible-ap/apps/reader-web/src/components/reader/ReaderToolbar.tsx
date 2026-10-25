// THE READER TOOLBAR — the floating pill at the bottom of the old reader (`sb-reader-toolbar`). Off a phone it is the
// old reader's labelled bar: ‹ · Books · Search · Discover · each extension's button · More · ›, with the audio
// controls in front while a recording plays; what the reader took out of the bar is under More (play sits in the
// chapter header). A phone has its own (PhoneNav.tsx); both are drawn and CSS picks one, so the page drawn on the
// edge matches the app.
import {
  canFullScreen,
  fullScreen,
  runningAsApp,
  toggleFullScreen,
} from "../../state/chrome/fullScreen";
import { arrange, underMore } from "../../state/chrome/toolbarLayout";
import { handleGridKeyNav } from "../keyboardNav";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { AudioScrubber } from "./AudioScrubber";
import { Avatar } from "../chrome/ConnectedChip";
import { SeedBibleIcon } from "../chrome/icons";
import type { ComponentChildren } from "preact";
import { chatBadge } from "../sessions/ChatPanel";

interface ToolbarAction {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number | string;
}

function Item(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  badge?: number | string;
  /** Drawn instead of the icon (the signed-in reader's avatar). */
  render?: () => ComponentChildren;
  /** The word under the icon, off a phone (the old reader's labelled bar). */
  labeled?: boolean;
}) {
  return (
    <div
      className={`sb-reader-toolbar-item${props.className ? ` ${props.className}` : ""}`}
    >
      <button
        type="button"
        className="sb-reader-toolbar-button"
        aria-label={props.label}
        title={props.label}
        aria-pressed={props.active}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.render ? (
          props.render()
        ) : (
          <span className="material-symbols-outlined">{props.icon}</span>
        )}
        {props.labeled && (
          <span className="sb-reader-toolbar-button-label">{props.label}</span>
        )}
        {props.badge ? (
          <span className="sb-reader-toolbar-unread-indicator">
            {props.badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

type PaneId =
  | "notes"
  | "account"
  | "content"
  | "today"
  | "discover"
  | "session"
  | "library";

/**
 * Every button that can sit after the chapter controls, in the default order — what the toolbar shows (arranged by
 * the reader's layout) and what Account → Toolbar lists for the reader to order and hide.
 */
export function toolbarActions(
  state: ReaderState,
  t: ReturnType<typeof useI18n>["t"],
  h: { togglePane: (p: PaneId) => void; dark: boolean; notes: number }
): ToolbarAction[] {
  const { ui, settings } = state;
  const { togglePane, dark, notes } = h;
  return [
    {
      id: "session",
      icon: state.live.active.value ? "groups" : "group_add",
      label: t("live-session", { defaultValue: "Live session" }),
      active: ui.pane.value === "session" || state.live.active.value,
      ...(state.live.active.value
        ? { badge: state.live.state.value?.participants.length }
        : {}),
      onClick: () => togglePane("session"),
    },
    // The old reader's Chat: while in a live session (its chat, and the study companion), with what came unread.
    ...(state.live.active.value
      ? [
          {
            id: "chat",
            icon: "chat_bubble_outline",
            label: t("chat", { defaultValue: "Chat" }),
            active: ui.chatOpen.value,
            ...(chatBadge(state) ? { badge: chatBadge(state) } : {}),
            onClick: () => (ui.chatOpen.value = !ui.chatOpen.value),
          },
        ]
      : []),
    {
      id: "today",
      icon: "today",
      label: t("today", { defaultValue: "Today" }),
      active: ui.pane.value === "today",
      onClick: () => togglePane("today"),
    },
    {
      id: "discover",
      icon: "explore",
      label: t("discover", { defaultValue: "Discover" }),
      active: ui.pane.value === "discover",
      onClick: () => togglePane("discover"),
    },
    {
      id: "notes",
      icon: "sticky_note_2",
      label: t("notes", { defaultValue: "Notes" }),
      active: ui.pane.value === "notes",
      badge: notes,
      onClick: () => togglePane("notes"),
    },
    {
      id: "library",
      icon: "queue_music",
      label: t("library", { defaultValue: "Library" }),
      active: ui.pane.value === "library" || !!state.playlists.playing.value,
      onClick: () => togglePane("library"),
    },
    {
      id: "content",
      icon: "library_books",
      label: t("your-content", { defaultValue: "Your content" }),
      active: ui.pane.value === "content",
      onClick: () => togglePane("content"),
    },
    ...state.extensions.toolbarItems.value.map((it) => ({
      id: `ext:${it.id}`,
      icon: it.icon,
      label: it.label,
      active: ui.pane.value === (`ext:${it.id}` as never),
      onClick: () => it.onSelect(),
    })),
    // The whole screen: hidden when opened from the home screen (no browser bars to hide).
    ...(runningAsApp()
      ? []
      : [
          {
            id: "fullscreen",
            icon: fullScreen.value ? "fullscreen_exit" : "fullscreen",
            label: fullScreen.value
              ? t("full-screen-exit", { defaultValue: "Exit full screen" })
              : t("full-screen", { defaultValue: "Full screen" }),
            active: fullScreen.value,
            onClick: () =>
              canFullScreen()
                ? void toggleFullScreen()
                : (ui.fullScreenHelp.value = true),
          },
        ]),
    {
      id: "theme",
      icon: dark ? "light_mode" : "dark_mode",
      label: t("themes", { defaultValue: "Themes" }),
      onClick: () => settings.toggleTheme(),
    },
  ];
}

export function ReaderToolbar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, ui, settings, audio, tts } = state;
  const notes = state.annotations.forChapter(reading.chapterRef.value).value
    .length;
  const pending = state.outbox.pending.value;
  const dark = settings.resolvedTheme().id === "dark";
  const togglePane = (
    p:
      | "notes"
      | "account"
      | "content"
      | "today"
      | "discover"
      | "session"
      | "library"
  ) => (ui.pane.value = ui.pane.value === p ? "none" : p);
  const audioPlaying = audio.controller.isPlaying.value;
  const audioActive = audioPlaying || audio.controller.currentTime.value > 0;
  const speaking = tts.isSpeaking.value;
  const canListen =
    !audio.available.value && tts.canSpeakLanguage(state.speechLang());
  const [moreOpen, setMoreOpen] = useState(false);
  // More is a passing menu: choosing verses (their own actions take its place), a tap anywhere else, or Esc closes it.
  const selectedCount = state.selection.verses.value.length;
  useEffect(() => {
    if (selectedCount) setMoreOpen(false);
  }, [selectedCount]);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (
        !el?.closest?.(
          ".sb-reader-toolbar-more-menu, .sb-reader-toolbar-more-button"
        )
      )
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

  // Everything after the chapter controls: inline when the bar fits, otherwise under "More"; in the order
  // and with the buttons the reader chose (Account → Toolbar).
  const secondary: ToolbarAction[] = toolbarActions(state, t, {
    togglePane,
    dark,
    notes,
  });
  const shown = arrange(secondary, state.toolbar.layout.value);
  const more = underMore(secondary, state.toolbar.layout.value);
  const openSearch = () => (ui.searchOpen.value = !ui.searchOpen.value);

  // Folded under More when the whole bar is wider than the reading area (the sidebar or a pane beside it leaves less
  // room than the window). Its full width can only be read while it is unfolded, so anything that changes it (the
  // buttons, the audio controls, the chapter's name, the room, the web fonts arriving) unfolds it for one measure
  // before the paint.
  const navRef = useRef<HTMLElement>(null);
  const fullWidth = useRef(0);
  const [folded, setFolded] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsLoaded(true));
  }, []);
  const mainWidth = ui.mainWidth.value;
  const contentKey = [
    mainWidth,
    fontsLoaded,
    shown.map((a) => a.id).join(),
    more.length,
    audioActive,
    audioPlaying,
    audio.available.value,
    canListen,
    reading.bookName.value,
    reading.chapterNumber.value,
  ].join("|");
  useLayoutEffect(() => setFolded(false), [contentKey]);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (!folded) fullWidth.current = nav.scrollWidth;
    const fold = mainWidth > 0 && fullWidth.current > mainWidth - 16;
    if (fold === folded) return;
    setFolded(fold);
    if (!fold) setMoreOpen(false);
  });

  return (
    <nav
      ref={navRef}
      className={`sb-reader-toolbar sb-reader-toolbar-desk${audioActive ? " sb-reader-toolbar-has-audio" : ""}${folded ? " sb-reader-toolbar-folded" : ""}${more.length || !state.session.value ? "" : " sb-reader-toolbar-more-empty"}`}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      {audioActive && (
        <>
          <div className="sb-reader-toolbar-audio">
            <AudioScrubber playback={audio.controller} showTimeRemaining />
            {audio.readers.value.length > 1 && (
              <select
                className="sb-reader-toolbar-reader"
                aria-label={t("audio-reader", { defaultValue: "Reader" })}
                value={audio.reader.value ?? ""}
                onChange={(e) =>
                  void state.listening.chooseReader(
                    (e.target as HTMLSelectElement).value
                  )
                }
              >
                {audio.readers.value.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Item
            icon={audioPlaying ? "pause" : "play_arrow"}
            className="sb-reader-toolbar-item-arrow"
            label={
              audioPlaying
                ? t("pause", { defaultValue: "Pause" })
                : t("play", { defaultValue: "Play" })
            }
            onClick={() => (audioPlaying ? audio.pause() : audio.play())}
          />
          {!audioPlaying && (
            <Item
              icon="stop"
              className="sb-reader-toolbar-item-arrow"
              label={t("stop", { defaultValue: "Stop" })}
              onClick={() => audio.stop()}
            />
          )}
          <span className="sb-reader-toolbar-divider" aria-hidden="true" />
        </>
      )}
      <Item
        icon="chevron_left"
        className="sb-reader-toolbar-item-arrow"
        label={t("previous-chapter", { defaultValue: "Previous Chapter" })}
        disabled={!reading.hasPrev.value}
        onClick={() => void reading.prev()}
      />
      <span
        className="sb-reader-toolbar-divider sb-reader-toolbar-desk-only"
        aria-hidden="true"
      />
      <span
        className="sb-reader-toolbar-divider sb-reader-toolbar-desk-only sb-reader-toolbar-desk-end"
        aria-hidden="true"
      />
      <Item
        icon="chevron_right"
        className="sb-reader-toolbar-item-arrow sb-reader-toolbar-next"
        label={t("next-chapter", { defaultValue: "Next Chapter" })}
        disabled={!reading.hasNext.value}
        onClick={() => void reading.next()}
      />
      <Item
        icon="books"
        render={() => <SeedBibleIcon size={24} />}
        className="sb-reader-toolbar-desk-only"
        label={t("books", { defaultValue: "Books" })}
        labeled
        active={ui.selector.value === "books"}
        onClick={() =>
          (ui.selector.value = ui.selector.value === "books" ? null : "books")
        }
      />
      <Item
        icon="search"
        className="sb-reader-toolbar-desk-only"
        label={t("search", { defaultValue: "Search" })}
        labeled
        active={ui.searchOpen.value}
        onClick={openSearch}
      />
      {shown.map((a) => (
        <Item
          key={a.id}
          icon={a.icon}
          label={a.label}
          labeled
          active={a.active}
          badge={a.badge}
          className="sb-reader-toolbar-secondary"
          onClick={a.onClick}
        />
      ))}
      <Item
        icon="more_horiz"
        className="sb-reader-toolbar-more-button"
        labeled
        label={t("more", { defaultValue: "More" })}
        active={moreOpen}
        onClick={() => setMoreOpen((o) => !o)}
      />
      {moreOpen && (
        <div
          className="sb-reader-toolbar-more-menu"
          role="menu"
          onKeyDown={(e) =>
            handleGridKeyNav(e as KeyboardEvent, e.currentTarget as HTMLElement)
          }
        >
          {!state.session.value && (
            <button
              type="button"
              role="menuitem"
              className="sb-reader-toolbar-more-signin"
              onClick={() => {
                setMoreOpen(false);
                ui.pane.value = "account";
              }}
            >
              <span className="material-symbols-outlined">login</span>
              <span>{t("sign-in", { defaultValue: "Sign in" })}</span>
            </button>
          )}
          {[
            ...shown.map((a) => ({ a, inBar: true })),
            ...more.map((a) => ({ a, inBar: false })),
          ].map(({ a, inBar }) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className={`sb-reader-toolbar-more-item${inBar ? " sb-reader-toolbar-more-item-in-bar" : ""}${a.active ? " sb-reader-toolbar-more-item-active" : ""}`}
              onClick={() => {
                setMoreOpen(false);
                a.onClick();
              }}
            >
              <span className="material-symbols-outlined">{a.icon}</span>
              <span>{a.label}</span>
              {a.badge ? (
                <span className="sb-reader-toolbar-unread-indicator">
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {/* The old reader's credit under the bar (its "below the toolbar" tool). */}
      <div className="sb-reader-toolbar-powered-by" aria-hidden="true">
        <SeedBibleIcon size={12} />
        <span>
          {t("powered-by-seed-bible-api", {
            defaultValue: "Powered by Seed Bible API",
          })}
        </span>
      </div>
    </nav>
  );
}
