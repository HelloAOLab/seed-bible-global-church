// A FRIEND IS SHARING A LIVE SESSION — the old reader's "{{name}} is sharing — click to join": a friend who hosts a
// session tells their friends through presence (state/social/presence.ts `sharingNow`); one line at the top, with
// Join (into the session, as when its link is opened) and Not now (this session, on this device, until reload).
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function FriendSharing({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const sharing = state.presence.sharingNow.value;
  const inSession = state.live.sessionId.value;
  const s = sharing.find((x) => x.sessionId !== inSession);
  if (!s || !state.session.value) return null;
  const name = s.name ?? t("a-friend", { defaultValue: "A friend" });
  const join = () => {
    state.presence.dismiss(s.sessionId);
    state.ui.pane.value = "session";
    void state.live.join(s.sessionId, s.code || undefined).catch(() => {});
  };
  return (
    <div
      className="sb-friend-sharing"
      role="status"
      data-testid="friend-sharing"
    >
      <span className="sb-friend-sharing-text">
        {s.label
          ? t("friend-sharing-at", {
              name,
              where: s.label,
              defaultValue: "{{name}} is sharing {{where}}",
            })
          : t("friend-sharing", {
              name,
              defaultValue: "{{name}} is sharing",
            })}
      </span>
      <button
        type="button"
        className="sb-friends-button sb-friends-button--primary"
        onClick={join}
      >
        {t("join", { defaultValue: "Join" })}
      </button>
      <button
        type="button"
        className="sb-friends-button"
        onClick={() => state.presence.dismiss(s.sessionId)}
      >
        {t("not-now", { defaultValue: "Not now" })}
      </button>
    </div>
  );
}
