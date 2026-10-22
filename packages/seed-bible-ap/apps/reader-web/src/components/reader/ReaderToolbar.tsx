// THE READER TOOLBAR — the floating pill at the bottom of the old reader (`sb-reader-toolbar`): the audio controls
// when a recording is playing (scrubber, pause, stop — the old desktop layout), previous / book and chapter / next,
// then play or listen, notes, Your Content, theme, and the account.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { AudioScrubber } from "./AudioScrubber";

function Item(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  badge?: number;
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
        <span className="material-symbols-outlined">{props.icon}</span>
        {props.badge ? (
          <span className="sb-reader-toolbar-unread-indicator">
            {props.badge}
          </span>
        ) : null}
      </button>
    </div>
  );
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

  return (
    <nav
      className={`sb-reader-toolbar${audioActive ? " sb-reader-toolbar-has-audio" : ""}`}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      {audioActive && (
        <>
          <div className="sb-reader-toolbar-audio">
            <AudioScrubber playback={audio.controller} showTimeRemaining />
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
      <div className="sb-reader-toolbar-item sb-reader-toolbar-center-item">
        <button
          type="button"
          className="sb-reader-toolbar-button sb-reader-toolbar-center-button"
          onClick={() => (ui.selector.value = "books")}
        >
          {reading.bookName.value} {reading.chapterNumber.value}
        </button>
      </div>
      <Item
        icon="chevron_right"
        className="sb-reader-toolbar-item-arrow"
        label={t("next-chapter", { defaultValue: "Next Chapter" })}
        disabled={!reading.hasNext.value}
        onClick={() => void reading.next()}
      />
      <span className="sb-reader-toolbar-divider" aria-hidden="true" />
      {audio.available.value && !audioActive && (
        <Item
          icon="play_circle"
          label={t("play", { defaultValue: "Play" })}
          onClick={() => audio.play()}
        />
      )}
      {canListen && (
        <Item
          icon={speaking ? "stop_circle" : "record_voice_over"}
          label={
            speaking
              ? t("stop", { defaultValue: "Stop" })
              : t("listen", { defaultValue: "Listen" })
          }
          active={speaking}
          onClick={() => (speaking ? tts.stop() : state.listen())}
        />
      )}
      <Item
        icon={state.live.active.value ? "groups" : "group_add"}
        label={t("live-session", { defaultValue: "Live session" })}
        active={ui.pane.value === "session" || state.live.active.value}
        badge={
          state.live.active.value
            ? state.live.state.value?.participants.length
            : undefined
        }
        onClick={() => togglePane("session")}
      />
      <Item
        icon="today"
        label={t("today", { defaultValue: "Today" })}
        active={ui.pane.value === "today"}
        onClick={() => togglePane("today")}
      />
      <Item
        icon="explore"
        label={t("discover", { defaultValue: "Discover" })}
        active={ui.pane.value === "discover"}
        onClick={() => togglePane("discover")}
      />
      <Item
        icon="sticky_note_2"
        label={t("notes", { defaultValue: "Notes" })}
        active={ui.pane.value === "notes"}
        badge={notes}
        onClick={() => togglePane("notes")}
      />
      <Item
        icon="queue_music"
        label={t("library", { defaultValue: "Library" })}
        active={ui.pane.value === "library" || !!state.playlists.playing.value}
        onClick={() => togglePane("library")}
      />
      <Item
        icon="library_books"
        label={t("your-content", { defaultValue: "Your content" })}
        active={ui.pane.value === "content"}
        onClick={() => togglePane("content")}
      />
      <Item
        icon={dark ? "light_mode" : "dark_mode"}
        label={t("themes", { defaultValue: "Themes" })}
        onClick={() => settings.toggleTheme()}
      />
      <Item
        icon={
          pending
            ? "cloud_upload"
            : state.session.value
              ? "account_circle"
              : "person"
        }
        label={t("account-settings", { defaultValue: "Account settings" })}
        active={ui.pane.value === "account"}
        badge={pending}
        onClick={() => togglePane("account")}
      />
    </nav>
  );
}
