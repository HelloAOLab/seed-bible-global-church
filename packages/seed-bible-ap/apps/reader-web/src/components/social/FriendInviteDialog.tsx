// A FRIEND LINK OPENED HERE (`/friend/<address>?name=…`): who invited you, and one step to add them — sign in first if
// you are not, then the Home's signature. The link carries no authority; it only names who asked.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { standingOf } from "../../state/social/friendship";

export function FriendInviteDialog({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { friendship } = state;
  const inv = friendship.invite.value;
  // Out of the way while the reader signs in to accept; back once they have.
  if (!inv || state.ui.pane.value === "account") return null;
  const name = inv.name ?? `${inv.agent.slice(0, 8)}…`;
  const me = state.session.value?.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0];
  const self = !!me && me.toLowerCase() === inv.agent;
  const standing = standingOf(state.today.friendsView.value, inv.agent);
  const close = () => (friendship.invite.value = null);
  return (
    <div className="sb-share-overlay" onClick={close}>
      <div
        className="sb-share-dialog sb-friend-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-friend-invite-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sb-friend-invite-title">
          {t("friend-invite-title", {
            name,
            defaultValue: "{{name}} wants to be friends",
          })}
        </h3>
        <p className="sb-small sb-muted sb-friend-invite-agent">{inv.agent}</p>
        <p className="sb-small">
          {t("friend-invite-what", {
            defaultValue:
              "Friends see what each other publish in Today, and when the other is reading. Nothing of yours is shared until you publish it.",
          })}
        </p>
        {self ? (
          <p className="sb-small">
            {t("friend-invite-self", {
              defaultValue:
                "This is your own friend link — send it to a friend.",
            })}
          </p>
        ) : !state.session.value ? (
          <div className="sb-note-card-actions">
            <button
              type="button"
              className="sb-note-button sb-note-button-primary"
              onClick={() => (state.ui.pane.value = "account")}
            >
              {t("friend-invite-sign-in", {
                defaultValue: "Sign in to accept",
              })}
            </button>
          </div>
        ) : standing === "friend" ? (
          <p className="sb-small">
            {t("friend-invite-already", {
              name,
              defaultValue: "You and {{name}} are already friends.",
            })}
          </p>
        ) : (
          <div className="sb-note-card-actions">
            <button
              type="button"
              className="sb-note-button sb-note-button-primary"
              onClick={() => {
                friendship.add(inv.agent, inv.name);
                close();
                state.ui.pane.value = "friends";
              }}
            >
              {t("friend-invite-accept", {
                name,
                defaultValue: "Add {{name}} as a friend",
              })}
            </button>
          </div>
        )}
        <div className="sb-note-card-actions">
          <button type="button" className="sb-note-button" onClick={close}>
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>
    </div>
  );
}
