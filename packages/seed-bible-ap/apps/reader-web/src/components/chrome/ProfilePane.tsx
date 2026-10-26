// PROFILE — the old reader's Profile screen (packages/seed-bible components/ProfilePane), a full-width pane opened from
// the profile circle at the bottom of the sidebar (the phone's account button): the card — picture with its + or ✎,
// your name at your Home where the old one shows the email, the display name, your line — with a ✎ to Edit profile;
// then Your content, Friends (with the count) and Account settings (the old reader is moving them into its profile),
// and Sign out. Signed out, the card asks you to sign in. Edit profile is its own pane with ← back to Profile.
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { fullName } from "../../state/social/homeProfile";
import { useI18n } from "../../i18n";
import { AccountCard } from "./AccountPane";
import {
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
  connectViaHome,
} from "../../session";
import { NeedsHomeHint, ProfileCard } from "./AccountPane";
import { planSummary } from "../../state/library/planSummary";

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

/** The description, one line until Read more (the old reader's ExpandableText). */
export function Description({
  text,
  className = "sb-profile-description",
}: {
  text: string;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <>
      <p
        ref={ref}
        className={`${className}${open ? "" : " sb-profile-description-clamped"}`}
      >
        {text}
      </p>
      {(clipped || open) && (
        <button
          type="button"
          className="sb-profile-read-more"
          onClick={() => setOpen(!open)}
        >
          {open
            ? t("read-less", { defaultValue: "Read less" })
            : t("read-more", { defaultValue: "Read more" })}
        </button>
      )}
    </>
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

/** The plan furthest along that is under way: its name, how far, the next day, the streak (the old Profile's card). */
function ReadingPlansCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const now = Date.now();
  let best: {
    title: string;
    fraction: number;
    day: number;
    total: number;
    streak: number;
  } | null = null;
  for (const v of state.plans.views.value) {
    if (!v.progress) continue;
    const s = planSummary(v.plan, v.progress, now);
    if (!s.days.length || !s.next) continue;
    const c = {
      title: v.plan.label,
      fraction: s.doneDays / s.days.length,
      day: s.next.index + 1,
      total: s.days.length,
      streak: s.streak,
    };
    if (!best || c.fraction > best.fraction) best = c;
  }
  return (
    <button
      type="button"
      className="sb-profile-plans"
      onClick={() => {
        state.ui.libraryTab.value = "plans";
        state.ui.pane.value = "library";
      }}
    >
      <span className="sb-profile-plans-head">
        <span className="sb-profile-tile" aria-hidden="true">
          <span className="material-symbols-outlined">menu_book</span>
        </span>
        <span className="sb-profile-plans-title">
          {t("my-reading-plans", { defaultValue: "My reading plans" })}
        </span>
        <span className="sb-profile-plans-link">
          {t("all-plans", { defaultValue: "All plans" })}
          <span className="material-symbols-outlined">arrow_forward</span>
        </span>
      </span>
      {best ? (
        <>
          <span
            className="sb-profile-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={best.total}
            aria-valuenow={best.day}
          >
            <span
              className="sb-profile-progress-fill"
              style={{ width: `${Math.round(best.fraction * 100)}%` }}
            />
          </span>
          <span className="sb-profile-plans-foot">
            <span className="sb-profile-plans-name">{best.title}</span>
            <span className="sb-profile-plans-stats">
              {t("plan-day-of", {
                day: best.day,
                total: best.total,
                defaultValue: "Day {{day}} of {{total}}",
              })}
              {best.streak > 0 && (
                <>
                  {" · "}
                  <span className="material-symbols-outlined">
                    local_fire_department
                  </span>
                  {best.streak}
                </>
              )}
            </span>
          </span>
        </>
      ) : (
        <span className="sb-profile-plans-foot">
          <span className="sb-profile-plans-name">
            {t("no-active-reading-plan", {
              defaultValue: "You haven't started a plan yet.",
            })}
          </span>
        </span>
      )}
    </button>
  );
}

/** The latest playlist played: Continue (or Replay) it, how far it got, and View all (the old Profile's card). */
function PlaylistHistoryCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const latest = [...state.playlists.history.value].sort(
    (a, b) => b.startedAt - a.startedAt
  )[0];
  const complete = !!latest && latest.currentStep + 1 >= latest.totalSteps;
  const percent = latest
    ? Math.round(
        ((latest.currentStep + 1) / Math.max(1, latest.totalSteps)) * 100
      )
    : 0;
  const exists = !!latest && !!state.playlists.byId(latest.playlistId);
  return (
    <div className="sb-profile-playlist-history">
      <span className="sb-profile-plans-head">
        <span className="sb-profile-tile" aria-hidden="true">
          <span className="material-symbols-outlined">playlist_play</span>
        </span>
        <span className="sb-profile-plans-title">
          {t("my-playlist-history", { defaultValue: "My playlist history" })}
        </span>
        <button
          type="button"
          className="sb-profile-plans-link"
          onClick={() => {
            state.ui.libraryTab.value = "playlists";
            state.ui.pane.value = "library";
          }}
        >
          {t("view-all", { defaultValue: "View all" })}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </span>
      {latest ? (
        <button
          type="button"
          className="sb-profile-playlist-continue"
          disabled={!exists}
          onClick={() => {
            state.playlists.play(
              latest.playlistId,
              complete ? 0 : latest.currentStep
            );
            state.ui.pane.value = "none";
          }}
        >
          <span
            className="sb-profile-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("playlist-history-percent", {
              percent,
              defaultValue: "{{percent}}% complete",
            })}
          >
            <span
              className="sb-profile-progress-fill"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="sb-profile-plans-foot sb-profile-playlist-continue-foot">
            <span className="sb-profile-playlist-continue-label">
              {complete
                ? t("replay-latest-playlist", {
                    defaultValue: "Replay latest playlist",
                  })
                : t("continue-latest-playlist", {
                    defaultValue: "Continue latest playlist",
                  })}
            </span>
            <span className="sb-profile-plans-name">{latest.title}</span>
          </span>
        </button>
      ) : (
        <span className="sb-profile-plans-foot">
          <span className="sb-profile-plans-name">
            {t("playlist-history-empty", {
              defaultValue: "Playlists you listen to will show up here.",
            })}
          </span>
        </span>
      )}
    </div>
  );
}

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
          {/* The sign-in itself, here: the terms and Sign in with Faithnet, no detour through Account. */}
          <div className="sb-profile-signin-card">
            <AccountCard state={state} />
          </div>
        </div>
      </section>
    );

  const mine = state.profile.mine.value;
  const home = state.homeProfile.value.value;
  const name = fullName(home) || mine?.displayName || s.name || s.sub;
  const picture = home ? home.photo : mine?.picture;
  // Your line about you is your Home profile's; the reader's own copy only until the Home's has been read.
  const about = home ? home.about : mine?.about;
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
          {about ? <Description text={about} /> : null}
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
        <ReadingPlansCard state={state} />
        <PlaylistHistoryCard state={state} />
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
