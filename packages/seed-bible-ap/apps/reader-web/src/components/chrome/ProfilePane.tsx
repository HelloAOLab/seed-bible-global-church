// PROFILE — the old reader's Profile screen (packages/seed-bible components/ProfilePane), a full-width pane opened from
// the profile circle at the bottom of the sidebar (the phone's account button): the card — picture with its + or ✎,
// your name at your Home where the old one shows the email, the display name, your line — with a ✎ to Edit profile;
// then Your content, Friends (with the count) and Account settings (the old reader is moving them into its profile),
// and Sign out. Signed out, the card asks you to sign in. Edit profile is its own pane with ← back to Profile.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
  connectViaHome,
} from "../../session";
import { NeedsHomeHint, ProfileCard } from "./AccountPane";

function Row(props: {
  icon: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sb-profile-row" onClick={props.onClick}>
      <span className="sb-profile-tile" aria-hidden="true">
        <span className="material-symbols-outlined">{props.icon}</span>
      </span>
      <span className="sb-profile-row-text">
        <span className="sb-profile-row-title">{props.title}</span>
        {props.subtitle ? (
          <span className="sb-profile-row-subtitle">{props.subtitle}</span>
        ) : null}
      </span>
      <span className="sb-profile-row-arrow" aria-hidden="true">
        <span className="material-symbols-outlined rtl-mirror">
          arrow_forward
        </span>
      </span>
    </button>
  );
}

function Header({
  state,
  title,
  back,
}: {
  state: ReaderState;
  title: string;
  back?: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="sb-pane-header">
      {back && (
        <button
          type="button"
          className="sb-profile-pane-back"
          aria-label={t("back", { defaultValue: "Back" })}
          title={t("back", { defaultValue: "Back" })}
          onClick={back}
        >
          <span className="material-symbols-outlined rtl-mirror">
            arrow_back
          </span>
        </button>
      )}
      <h2>{title}</h2>
      <button
        className="sb-pane-close"
        aria-label={t("close", { defaultValue: "Close" })}
        onClick={() => (state.ui.pane.value = "none")}
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </header>
  );
}

/** An agent's address as people read it: `0xd9ee…ab2c`, without the chain prefix. */
const shortAddress = (sub: string) => {
  const a = sub.replace(/^eip155:\d+:/, "");
  return /^0x[0-9a-f]{40}$/i.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("");

export function ProfilePane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const s = state.session.value;
  const go = (p: typeof state.ui.pane.value) => (state.ui.pane.value = p);

  if (!s)
    return (
      <section className="sb-pane sb-profile-screen">
        <Header
          state={state}
          title={t("profile", { defaultValue: "Profile" })}
        />
        <div className="sb-profile-content">
          <div className="sb-profile-identity">
            <span className="sb-profile-avatar" aria-hidden="true">
              <span className="material-symbols-outlined">account_circle</span>
            </span>
            <p className="sb-profile-signin-hint">
              {t("profile-signed-out-message", {
                defaultValue:
                  "Sign in to keep your highlights, notes and plans on every device.",
              })}
            </p>
            <button
              type="button"
              className="sb-profile-signin"
              disabled={!HOME_SIGNIN_AVAILABLE}
              onClick={() =>
                void connectViaHome(DEFAULT_ESTATE)
                  .then((out) => out && state.signIn(out, { announce: true }))
                  .catch(() => go("account"))
              }
            >
              {t("log-in", { defaultValue: "Log in" })}
            </button>
            <button
              type="button"
              className="sb-note-button sb-profile-more-ways"
              onClick={() => go("account")}
            >
              {t("profile-more-ways", {
                defaultValue: "More ways to sign in",
              })}
            </button>
          </div>
        </div>
      </section>
    );

  const mine = state.profile.mine.value;
  const name = mine?.displayName || s.name || s.sub;
  const picture = mine?.picture;
  const friends = state.today.friends.value.length;
  const requests = state.friendship.requests.value.length;
  const friendsLine =
    friends || requests
      ? [
          friends === 1
            ? t("friends-count", {
                count: friends,
                defaultValue: "{{count}} friend",
              })
            : t("friends-count-plural", {
                count: friends,
                defaultValue: "{{count}} friends",
              }),
          ...(requests
            ? [
                requests === 1
                  ? t("requests-count", {
                      count: requests,
                      defaultValue: "{{count}} request",
                    })
                  : t("requests-count-plural", {
                      count: requests,
                      defaultValue: "{{count}} requests",
                    }),
              ]
            : []),
        ].join(" · ")
      : t("friends-row-subtitle-empty", {
          defaultValue: "Add friends and see what they're reading",
        });
  const pending = state.outbox.pending.value;

  return (
    <section className="sb-pane sb-profile-screen">
      <Header state={state} title={t("profile", { defaultValue: "Profile" })} />
      <div className="sb-profile-content">
        <div className="sb-profile-identity">
          <button
            type="button"
            className="sb-profile-card-edit"
            aria-label={t("edit-profile", { defaultValue: "Edit profile" })}
            title={t("edit-profile", { defaultValue: "Edit profile" })}
            onClick={() => go("edit-profile")}
          >
            <span className="material-symbols-outlined">edit</span>
          </button>
          <button
            type="button"
            className="sb-profile-avatar-button"
            aria-label={t("change-profile-picture", {
              defaultValue: "Change profile picture",
            })}
            onClick={() => go("edit-profile")}
          >
            <span
              className="sb-profile-avatar"
              style={
                picture ? { backgroundImage: `url(${picture})` } : undefined
              }
            >
              {picture ? null : initialsOf(name)}
            </span>
            <span className="sb-profile-avatar-edit" aria-hidden="true">
              <span className="material-symbols-outlined">
                {picture ? "edit" : "add"}
              </span>
            </span>
          </button>
          <p className="sb-profile-contact">
            <span className="sb-profile-email" title={s.sub}>
              {s.name || shortAddress(s.sub)}
            </span>
          </p>
          <button
            type="button"
            className="sb-profile-name-button"
            onClick={() => go("edit-profile")}
          >
            <span className="sb-profile-name">{name}</span>
          </button>
          {mine?.about ? (
            <p className="sb-profile-description">{mine.about}</p>
          ) : null}
          <p className="sb-profile-sync sb-muted sb-small">
            {state.outbox.flushing.value
              ? t("sync-flushing", { defaultValue: "Sending your changes…" })
              : pending
                ? t("sync-pending", {
                    count: pending,
                    defaultValue: `${pending} chapter(s) waiting to sync`,
                  })
                : t("sync-done", {
                    defaultValue: "Everything is in your Library.",
                  })}
          </p>
          <NeedsHomeHint error={state.outbox.lastError.value} />
        </div>
        <Row
          icon="edit"
          title={t("your-content", { defaultValue: "Your content" })}
          subtitle={t("your-content-subtitle", {
            defaultValue: "Create and manage your content",
          })}
          onClick={() => go("content")}
        />
        <Row
          icon="group"
          title={t("friends", { defaultValue: "Friends" })}
          subtitle={friendsLine}
          onClick={() => go("friends")}
        />
        <Row
          icon="manage_accounts"
          title={t("account-settings", { defaultValue: "Account settings" })}
          subtitle={t("account-settings-subtitle", {
            defaultValue: "Sync, publishing, connected sources and more",
          })}
          onClick={() => go("account")}
        />
        <button
          type="button"
          className="sb-profile-logout"
          onClick={() => void state.signOut()}
        >
          <span className="material-symbols-outlined">logout</span>
          {t("sign-out", { defaultValue: "Sign out" })}
        </button>
      </div>
    </section>
  );
}

export function EditProfilePane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <section className="sb-pane sb-profile-screen">
      <Header
        state={state}
        title={t("edit-profile", { defaultValue: "Edit profile" })}
        back={() => (state.ui.pane.value = "profile")}
      />
      <div className="sb-profile-content">
        {state.session.value ? (
          <ProfileCard state={state} />
        ) : (
          <p className="sb-profile-signin-hint">
            {t("profile-signed-out-message", {
              defaultValue:
                "Sign in to keep your highlights, notes and plans on every device.",
            })}
          </p>
        )}
      </div>
    </section>
  );
}
