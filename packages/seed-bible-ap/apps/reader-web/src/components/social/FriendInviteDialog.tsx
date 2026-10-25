// A FRIEND LINK OPENED HERE (`/friend/<address>?name=…`, or an emailed invitation `/invite/<token>`): who invited
// you, and one step to add them — sign in first if you are not, then the Home's signature. Accepting an emailed
// invitation also takes it, so the inviter sees you joined. The link carries no authority; it only names who asked.
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { standingOf } from "../../state/social/friendship";

function Frame(props: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <div className="sb-footnote-modal-overlay" onClick={props.onClose}>
      <div
        className="sb-footnote-modal sb-friend-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-friend-invite-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 id="sb-friend-invite-title" className="sb-footnote-modal-title">
            {props.title}
          </h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={props.onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content sb-friend-invite-body">
          {props.children}
        </div>
      </div>
    </div>
  );
}

export function FriendInviteDialog({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { friendship } = state;
  const inv = friendship.invite.value;
  // Out of the way while the reader signs in to accept; back once they have.
  if (!inv || state.ui.pane.value === "account") return null;
  const close = () => (friendship.invite.value = null);
  if (inv.error)
    return (
      <Frame
        title={t("friend-invite-unavailable", {
          defaultValue: "This invitation can't be opened",
        })}
        onClose={close}
      >
        <p className="sb-small">
          {t("friend-invite-unavailable-why", {
            error: inv.error,
            defaultValue:
              "The Home says: {{error}}. Ask your friend to send you a new one.",
          })}
        </p>
      </Frame>
    );
  const name = inv.name ?? `${inv.agent.slice(0, 8)}…`;
  const me = state.session.value?.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0];
  const self = !!me && me.toLowerCase() === inv.agent;
  const standing = standingOf(state.today.friendsView.value, inv.agent);
  return (
    <Frame
      title={t("friend-invite-title", {
        name,
        defaultValue: "{{name}} wants to be friends",
      })}
      onClose={close}
    >
      {!inv.name && (
        <p className="sb-small sb-muted sb-friend-invite-agent">{inv.agent}</p>
      )}
      {inv.note && (
        <blockquote className="sb-small sb-friend-invite-note">
          {inv.note}
        </blockquote>
      )}
      <p className="sb-small">
        {t("friend-invite-what", {
          defaultValue:
            "Friends see what each other publish in Today, and when the other is reading. Nothing of yours is shared until you publish it.",
        })}
      </p>
      {self ? (
        <p className="sb-small">
          {t("friend-invite-self", {
            defaultValue: "This is your own friend link — send it to a friend.",
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
              if (inv.token) void state.invites.claim(inv.token);
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
    </Frame>
  );
}
