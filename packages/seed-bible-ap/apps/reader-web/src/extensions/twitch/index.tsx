// TWITCH, READ-ONLY — the old twitchPub/twitchSub pair posted transcripts into a channel's chat; that is a write to
// an outside service, and this app writes nothing outside the estate. What stays is the useful read: a church's
// stream and its chat beside the text, as Twitch's own embeds (read-only players; nothing of the reader's leaves).
// The channel is the reader's own setting, or the church theme's `twitchChannel`.
import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export const TWITCH_CHANNEL_KEY = "twitch:channel";
const CHANNEL = /^[a-z0-9_]{3,25}$/i;

/** The embed URLs for a channel on this page's host; null for a name Twitch would not have. */
export function twitchEmbeds(
  channel: string,
  host: string
): { player: string; chat: string } | null {
  const c = channel.trim().toLowerCase().replace(/^@/, "");
  if (!CHANNEL.test(c) || !host) return null;
  const parent = `parent=${encodeURIComponent(host)}`;
  return {
    player: `https://player.twitch.tv/?channel=${c}&${parent}&muted=false`,
    chat: `https://www.twitch.tv/embed/${c}/chat?${parent}&darkpopout`,
  };
}

/** The reader's chosen channel (a device preference). */
export const channel = signal<string>("");
/** What the reader is typing — kept outside the pane, so turning the extension on (which re-renders the pane) or
 *  the saved channel arriving a moment later never wipes it. */
const draft = signal<string>("");

function WatchPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  // The saved channel arrives from the device a moment after the pane opens; it fills the field only if the
  // reader has not started typing.
  useEffect(() => {
    if (!draft.value) draft.value = channel.value;
  }, [channel.value]);
  const theme = state.settings.resolvedTheme().variables["twitchChannel"] ?? "";
  const name = channel.value || theme;
  const host = typeof location !== "undefined" ? location.hostname : "";
  const embeds = name ? twitchEmbeds(name, host) : null;
  return (
    <section
      className="sb-pane sb-watch"
      aria-label={t("watch", { defaultValue: "Watch" })}
    >
      <form
        className="sb-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          channel.value = draft.value.trim();
          void state.stores.prefs.set(TWITCH_CHANNEL_KEY, channel.value);
        }}
      >
        <input
          className="sb-note-editor"
          placeholder={t("twitch-channel", {
            defaultValue: "Twitch channel (e.g. yourchurch)",
          })}
          value={draft}
          onInput={(e) => (draft.value = (e.target as HTMLInputElement).value)}
        />
        <button type="submit" className="sb-note-button">
          {t("watch", { defaultValue: "Watch" })}
        </button>
      </form>
      {!embeds && (
        <p className="sb-small sb-muted">
          {name
            ? t("twitch-bad-channel", {
                defaultValue: "That is not a Twitch channel name.",
              })
            : t("twitch-none", {
                defaultValue:
                  "Name a channel to watch its stream and chat beside the text. Nothing you do here is sent to Twitch.",
              })}
        </p>
      )}
      {embeds && (
        <>
          <iframe
            className="sb-link-embed"
            src={embeds.player}
            title={`${name} on Twitch`}
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
          <iframe
            className="sb-watch-chat"
            src={embeds.chat}
            title={`${name} chat`}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          <p className="sb-small sb-muted">
            {t("twitch-readonly", {
              defaultValue:
                "Twitch's own player and chat. Posting in chat happens on Twitch, under your Twitch account, never through this app.",
            })}
          </p>
        </>
      )}
    </section>
  );
}

const twitchExtension: ExtensionRegistration = {
  id: "twitch",
  label: "Twitch (watch)",
  description:
    "A church's Twitch stream and chat beside the text — read-only embeds.",
  defaultEnabled: false,
  init: function* (ctx) {
    const { state } = ctx;
    void state.stores.prefs.get(TWITCH_CHANNEL_KEY).then((v) => {
      if (typeof v === "string") channel.value = v;
    });
    yield ctx.panes.register({
      id: "watch",
      title: "Watch",
      render: () => <WatchPane state={state} />,
    });
    yield ctx.toolbar.add({
      id: "watch",
      label: "Watch",
      icon: "live_tv",
      onSelect: () => ctx.panes.open("watch"),
    });
  },
};
export default twitchExtension;
