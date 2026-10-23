// WHO IS CONNECTED — a small chip the sidebar and toolbar carry: the reader's picture (their profile's, else an
// initial) and name when signed in, a one-tap **Sign in** when not. Tapping a signed-in chip opens the account pane,
// where Sign out lives beside the sync state.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
  connectViaHome,
} from "../../session";

export function Avatar({
  state,
  size = "s",
}: {
  state: ReaderState;
  size?: "s" | "m";
}) {
  const s = state.session.value;
  const picture = state.profile.mine.value?.picture;
  const name = state.profile.mine.value?.displayName || s?.name || "";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return picture ? (
    <img className={`sb-avatar sb-avatar-${size}`} src={picture} alt="" />
  ) : (
    <span
      className={`sb-avatar sb-avatar-${size} sb-avatar-initial`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function ConnectedChip({
  state,
  compact = false,
}: {
  state: ReaderState;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const s = state.session.value;
  const open = state.ui.pane.value === "account";
  if (!s)
    return (
      <button
        type="button"
        className="sb-connected-chip sb-connected-chip-out"
        disabled={!HOME_SIGNIN_AVAILABLE}
        title={t("sign-in", { defaultValue: "Sign in" })}
        onClick={() =>
          void connectViaHome(DEFAULT_ESTATE)
            .then((out) => out && state.signIn(out, { announce: true }))
            .catch(() => (state.ui.pane.value = "account"))
        }
      >
        <span className="material-symbols-outlined">login</span>
        {!compact && (
          <span className="sb-connected-name">
            {t("sign-in", { defaultValue: "Sign in" })}
          </span>
        )}
      </button>
    );
  const name = state.profile.mine.value?.displayName || s.name || s.sub;
  const pending = state.outbox.pending.value;
  const trouble = state.sessionTrouble.value;
  return (
    <button
      type="button"
      className={`sb-connected-chip${open ? " sb-connected-chip-active" : ""}`}
      title={`${name} · ${t("account-settings", { defaultValue: "Account settings" })}`}
      aria-pressed={open}
      onClick={() => (state.ui.pane.value = open ? "none" : "account")}
    >
      <Avatar state={state} />
      {!compact && (
        <span className="sb-connected-text">
          <span className="sb-connected-name">{name}</span>
          <span className="sb-connected-sub">
            {trouble
              ? t("connect-again", { defaultValue: "Sign in again" })
              : pending
                ? t("sync-pending-short", {
                    count: pending,
                    defaultValue: `${pending} to sync`,
                  })
                : s.wire
                  ? t("connected", { defaultValue: "Connected" })
                  : t("connected-no-wire", {
                      defaultValue: "Signed in · device only",
                    })}
          </span>
        </span>
      )}
      {(pending > 0 || trouble) && (
        <span className="sb-connected-dot" aria-hidden="true" />
      )}
    </button>
  );
}
