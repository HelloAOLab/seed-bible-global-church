// SHARE WITH A FRIEND — the picker for state/social/share.ts: the reader's friends, one tap each; then what is
// happening in plain words. The first share with someone asks the reader to sign twice at their Home (the read grant,
// then the message with the link); after that a share with them is saved and they see it on their next visit.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function ShareWithFriend({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const item = state.ui.shareWithFriend.value;
  if (!item) return null;
  const friends = state.today.friends.value;
  const p = state.sharing.progress.value;
  const mine = p && p.key === item.key ? p : null;
  const close = () => {
    state.ui.shareWithFriend.value = null;
    state.sharing.progress.value = null;
  };
  const status: Record<string, string> = {
    saving: t("share-friend-saving", {
      defaultValue: "Keeping it for {{name}}…",
      name: mine?.friendName,
    }),
    "sign-grant": t("share-friend-sign-grant", {
      defaultValue:
        "Sign at your Home to let {{name}} read what you share with them. A window has opened.",
      name: mine?.friendName,
    }),
    "sign-message": t("share-friend-sign-message", {
      defaultValue: "Last step: sign at your Home to send {{name}} the link.",
      name: mine?.friendName,
    }),
    done: t("share-friend-done", {
      defaultValue: "Shared with {{name}}. They'll see it in Seed Bible.",
      name: mine?.friendName,
    }),
  };
  return (
    <div className="sb-footnote-modal-overlay" onClick={close}>
      <div
        className="sb-footnote-modal sb-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("share-with-friend", {
          defaultValue: "Share with a friend",
        })}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">
            {t("share-with-friend", { defaultValue: "Share with a friend" })}
          </h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          <p className="sb-muted">{item.title}</p>
          {mine ? (
            <p
              role="status"
              className={mine.step === "failed" ? "sb-pane-error" : undefined}
            >
              {mine.step === "failed" ? mine.error : status[mine.step]}
            </p>
          ) : !state.session.value ? (
            <p>
              {t("share-friend-signed-out", {
                defaultValue: "Sign in to share with a friend.",
              })}
            </p>
          ) : !friends.length ? (
            <p>
              {t("share-friend-none", {
                defaultValue:
                  "Add a friend first: only your friends can be shared with.",
              })}
            </p>
          ) : (
            <div className="sb-share">
              <div className="sb-share-actions">
                {friends.map((f) => (
                  <button
                    key={f.contact}
                    type="button"
                    className="sb-share-action"
                    onClick={() =>
                      void state.sharing.shareWith(
                        { agent: f.contact, name: f.name },
                        item
                      )
                    }
                  >
                    <span className="sb-share-action-icon material-symbols-outlined">
                      person
                    </span>
                    <span className="sb-share-action-text">
                      <span className="sb-share-action-title">
                        {f.name || f.contact}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
