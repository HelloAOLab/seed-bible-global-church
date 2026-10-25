// TODAY — the old TodayPane in outline: its welcome (or a greeting, once there is reading), pick up where you left off, your recent bookmarks and saves, your friends
// from the Home and what they released lately. Dressed by the copied `today.css` / `friends.css` where the
// classes match, and `app.css` for the rest.
import { useEffect, useState } from "preact/hooks";
import type { RecentReading } from "../../state/records/history";
import { CommunityFeed } from "./CommunityFeed";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { DEFAULT_ESTATE } from "../../session";
import { estateById } from "../../../../../estate/faithnet";
import { parseRoute } from "../../state/reading/route";
import { friendLink } from "../../state/social/friendship";
import { isEmail } from "../../state/social/invites";
import { addFriendOrInvite } from "./addFriend";
import { TodayWelcome } from "./TodayWelcome";
import { BookmarkGlyph } from "../records/Bookmarks";

function label(state: ReaderState, chapter: string) {
  const [book, ch] = chapter.split(".");
  return `${state.reading.books.value.find((b) => b.id === book)?.name ?? book} ${ch}`;
}

export function TodayPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { today, bookmarks, saves, reading } = state;
  const signedIn = !!state.session.value;
  const home = estateById(DEFAULT_ESTATE)!.home;

  useEffect(() => {
    if (signedIn && !today.loadedFor.value) void today.refresh();
  }, [signedIn]);
  const [recent, setRecent] = useState<RecentReading[]>([]);
  const [recentRead, setRecentRead] = useState(false);
  const changed = state.buckets.changed.value;
  useEffect(() => {
    void state.history.recent(8).then((r) => {
      setRecent(r);
      setRecentRead(true);
    });
  }, [changed]);

  const open = (chapter: string, start?: number, end?: number) => {
    const [book, ch] = chapter.split(".");
    void reading
      .goTo(reading.translationId.value, book!, Number(ch))
      .then(() => {
        if (start) state.selection.select(start, end ?? start);
      });
  };

  return (
    <section
      className="sb-pane sb-today-container"
      aria-label={t("today", { defaultValue: "Today" })}
    >
      <header className="sb-pane-header sb-today-header">
        <h2>{t("today", { defaultValue: "Today" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      {recentRead && (
        // The chapter on screen does not count: everyone arrives on a chapter.
        <TodayWelcome
          state={state}
          hasReading={recent.some(
            (r) => r.chapterRef !== reading.chapterRef.value
          )}
        />
      )}

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("resume-reading", { defaultValue: "Continue reading" })}
          </h3>
        </div>
        <button
          className="sb-content-save"
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="sb-content-save-kind">
            <span className="material-symbols-outlined">menu_book</span>
          </span>
          <span className="sb-content-save-name">
            {reading.bookName.value} {reading.chapterNumber.value} ·{" "}
            {reading.translation.value?.shortName ??
              reading.translationId.value}
          </span>
        </button>
      </div>

      {recent.length > 0 && (
        <div className="sb-content-section">
          <div className="sb-content-section-head">
            <h3 className="sb-content-section-title">
              {t("recent-reading", { defaultValue: "Recent reading" })}
            </h3>
          </div>
          <div className="sb-recent-chips">
            {recent.map((r) => (
              <button
                key={r.chapterRef}
                className="sb-recent-chip"
                title={new Date(r.at).toLocaleString()}
                onClick={() => {
                  const [book, ch] = r.chapterRef.split(".");
                  void reading.goTo(
                    r.edition ?? reading.translationId.value,
                    book!,
                    Number(ch)
                  );
                  state.ui.pane.value = "none";
                }}
              >
                {label(state, r.chapterRef)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("bookmarks", { defaultValue: "Bookmarks" })}
          </h3>
        </div>
        {!bookmarks.all.value.length && (
          <p className="sb-content-empty">
            {t("today-no-bookmarks", { defaultValue: "No bookmarks yet." })}
          </p>
        )}
        {bookmarks.all.value.slice(0, 5).map((b) => (
          <button
            key={b.id}
            className="sb-content-save"
            onClick={() => open(b.chapter)}
          >
            <span className="sb-content-save-kind">
              <BookmarkGlyph colorId={b.colorId} size={18} />
            </span>
            <span className="sb-content-save-name">{b.name}</span>
            <span className="sb-content-save-date">
              {b.updatedAt.slice(0, 10)}
            </span>
          </button>
        ))}
      </div>

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("saves", { defaultValue: "Saves" })}
          </h3>
        </div>
        {!saves.all.value.length && (
          <p className="sb-content-empty">
            {t("today-no-saves", { defaultValue: "No saves yet." })}
          </p>
        )}
        {saves.all.value.slice(0, 5).map((s) => (
          <button
            key={s.id}
            className="sb-content-save"
            onClick={() =>
              open(s.chapter, s.start ?? undefined, s.end ?? undefined)
            }
          >
            <span className="sb-content-save-kind">
              <span className="material-symbols-outlined">
                {s.start !== null ? "format_quote" : "archive"}
              </span>
            </span>
            <span className="sb-content-save-name">
              {s.label ??
                `${label(state, s.chapter)}${s.start !== null ? `:${s.start}${s.end !== s.start ? `–${s.end}` : ""}` : ""}`}
            </span>
          </button>
        ))}
      </div>

      <FriendsSection state={state} />

      <CommunityFeed state={state} />
      <p className="sb-small sb-muted">
        {t("today-how", {
          defaultValue:
            "Friends see only what you publish. Your private marks never leave your Library.",
        })}{" "}
        {parseRoute(location.pathname) ? "" : ""}
      </p>
    </section>
  );
}

/**
 * FRIENDS — who you and they have added at your Homes, who is waiting for you to add them back, who has not yet,
 * and who is here right now (the green dot, tap to open the same chapter). Shown in Today and as its own pane
 * (the old FriendsPane); adding and inviting happen at your Home.
 */
/** A refusal that only signing in again heals: the workspace holds no (or no longer a valid) wire for this reader. */
export const needsSignInAgain = (message: string) =>
  /no permission to ask your agent|sign in again|no longer accepts|no wire/i.test(
    message
  );

export function FriendsSection({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { today, reading } = state;
  const signedIn = !!state.session.value;
  useEffect(() => {
    if (signedIn && !today.loadedFor.value) void today.refresh();
  }, [signedIn]);
  // Friends' presence: read on open and every half minute while the section is on screen.
  useEffect(() => {
    if (!signedIn) return;
    void state.presence.refresh();
    const id = setInterval(() => void state.presence.refresh(), 30_000);
    return () => clearInterval(id);
  }, [signedIn]);
  const presenceOf = (agent: string) =>
    state.presence.friends.value.find(
      (f) => f.agent.toLowerCase() === agent.toLowerCase()
    )?.presence ?? [];
  const openPresence = (scope: string | undefined) => {
    if (!scope || !/^[1-4]?[A-Z]{2,3}\.\d+$/.test(scope)) return;
    const [book, ch] = scope.split(".");
    void reading.goTo(reading.translationId.value, book!, Number(ch));
  };
  return (
    <div className="sb-content-section sb-friends-section">
      <div className="sb-content-section-head">
        <h3 className="sb-content-section-title">
          {t("friends", { defaultValue: "Friends" })}
        </h3>
        {signedIn && (
          <button
            className="sb-content-see-all"
            onClick={() => void today.refresh()}
            disabled={today.contactsLoading.value}
          >
            {t("refresh", { defaultValue: "Refresh" })}
          </button>
        )}
      </div>
      {!signedIn && (
        <p className="sb-content-empty">
          {t("today-signed-out", {
            defaultValue: "Sign in to see your friends and what they released.",
          })}{" "}
          <button
            type="button"
            className="sb-discover-empty-action"
            onClick={() => (state.ui.pane.value = "account")}
          >
            {t("log-in", { defaultValue: "Log in" })}
          </button>
        </p>
      )}
      {signedIn &&
        today.contactsError.value &&
        (needsSignInAgain(today.contactsError.value) ? (
          <div className="sb-pane-notice sb-friends-notice">
            <p>
              {t("friends-need-permission", {
                defaultValue:
                  "To show your friends, the reader needs your permission to ask your agent. Sign in again to give it — nothing on this device is lost.",
              })}
            </p>
            <button
              className="sb-note-button sb-note-button-primary"
              onClick={() => (state.ui.pane.value = "account")}
            >
              {t("connect-again", { defaultValue: "Sign in again" })}
            </button>
          </div>
        ) : (
          <div className="sb-pane-notice sb-friends-notice">
            <p>
              {t("friends-unreadable", {
                defaultValue: "Your friends could not be read just now.",
              })}
            </p>
            <p className="sb-small sb-muted">{today.contactsError.value}</p>
            <button
              className="sb-note-button"
              onClick={() => void today.refresh()}
            >
              {t("try-again", { defaultValue: "Try again" })}
            </button>
          </div>
        ))}
      {signedIn && <FriendRequests state={state} />}
      {signedIn &&
        !today.contactsLoading.value &&
        !today.friends.value.length &&
        !today.contactsError.value && (
          <p className="sb-content-empty">
            {today.friendsView.value
              ? t("today-no-friends", {
                  defaultValue:
                    "No friends yet. You are friends once you have added each other at your Home.",
                })
              : t("today-no-contacts", {
                  defaultValue:
                    "No contacts yet. Friends are the contacts at your Home.",
                })}
          </p>
        )}
      {signedIn && today.requested.value.length > 0 && (
        <p className="sb-small sb-muted">
          {t("friends-requested", {
            defaultValue: "Not yet added you back:",
          })}{" "}
          {today.requested.value.map((r) => r.name ?? r.agent).join(", ")}
        </p>
      )}
      {today.friends.value.map((c) => {
        const here = presenceOf(c.contact);
        const prof = today.profiles.value[c.contact.toLowerCase()];
        return (
          <div key={c.contact} className="sb-friends-row">
            {prof?.picture ? (
              <img className="sb-friends-avatar" src={prof.picture} alt="" />
            ) : (
              <span className="sb-friends-avatar sb-friends-avatar-empty material-symbols-outlined">
                person
              </span>
            )}
            <span className="sb-friends-person-text">
              <span className="sb-friends-person-name">
                {here.length > 0 && (
                  <span
                    className="sb-presence-dot"
                    title={t("friend-here-now", { defaultValue: "Here now" })}
                  />
                )}
                {prof?.displayName ?? c.name ?? c.contact}
              </span>
              {prof?.about && (
                <span className="sb-friends-person-about">{prof.about}</span>
              )}
              <span className="sb-friends-person-subtitle">
                {here.length
                  ? here.map((p) => (
                      <button
                        key={p.app}
                        type="button"
                        className="sb-presence-where"
                        onClick={() => openPresence(p.scope)}
                        title={
                          p.scope
                            ? t("friend-open-where", {
                                defaultValue: "Open the same chapter",
                              })
                            : undefined
                        }
                      >
                        {p.label ?? p.app}
                      </button>
                    ))
                  : c.name
                    ? c.contact
                    : ""}
                {!here.length && c.mutual
                  ? ` · ${t("friends-mutual", { defaultValue: "mutual" })}`
                  : ""}
              </span>
            </span>
          </div>
        );
      })}
      {signedIn && <AddFriend state={state} />}
      {signedIn && state.presence.error.value && (
        <p className="sb-small sb-muted">{state.presence.error.value}</p>
      )}
    </div>
  );
}

/** People who asked you to be friends: Accept (sign at your Home) or Not now (kept on this device). */
function FriendRequests({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { friendship } = state;
  const asks = friendship.requests.value;
  if (!asks.length) return null;
  return (
    <div className="sb-friend-requests">
      <h4 className="sb-friend-subtitle">
        {t("friend-requests-title", {
          count: asks.length,
          defaultValue: "Friend requests ({{count}})",
        })}
      </h4>
      {asks.map((r) => (
        <div key={r.agent} className="sb-friends-row sb-friend-request">
          <span className="sb-friends-person-text">
            <span className="sb-friends-person-name">{r.name ?? r.agent}</span>
            <span className="sb-friends-person-subtitle">
              {t("friend-request-line", {
                defaultValue: "wants to be friends",
              })}
            </span>
          </span>
          <button
            type="button"
            className="sb-note-button sb-note-button-primary"
            onClick={() => friendship.add(r.agent, r.name)}
          >
            {t("friend-accept", { defaultValue: "Accept" })}
          </button>
          <button
            type="button"
            className="sb-note-button"
            onClick={() => void friendship.putAside(r.agent)}
          >
            {t("friend-not-now", { defaultValue: "Not now" })}
          </button>
        </div>
      ))}
    </div>
  );
}

/** While a friend is being added at the Home: what to do there, then what came of it. */
export function FriendWaiting({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { friendship } = state;
  const w = friendship.waiting.value;
  if (!w) return null;
  return (
    <div className="sb-pane-notice sb-friend-waiting" role="status">
      {!w.landed && w.how === "here" ? (
        w.problem ? (
          <>
            <p>
              {t("friend-add-here-failed", {
                name: w.label,
                problem: w.problem,
                defaultValue:
                  "Couldn't add {{name}} here ({{problem}}). Your Home can do it.",
              })}
            </p>
            <div className="sb-note-card-actions">
              <button
                type="button"
                className="sb-note-button sb-note-button-primary"
                onClick={() => friendship.add(w.who, w.label, { atHome: true })}
              >
                {t("friend-open-home", { defaultValue: "Open your Home" })}
              </button>
              <button
                type="button"
                className="sb-note-button"
                onClick={() => friendship.clearWaiting()}
              >
                {t("cancel", { defaultValue: "Cancel" })}
              </button>
            </div>
          </>
        ) : (
          <p>
            {t("friend-adding-here", {
              name: w.label,
              defaultValue: "Adding {{name}}…",
            })}
          </p>
        )
      ) : !w.landed ? (
        <>
          <p>
            {t("friend-sign-at-home", {
              name: w.label,
              defaultValue:
                "Sign at your Home to add {{name}} — the window that opened. Check the name there before you sign. This updates by itself when you are done.",
            })}
          </p>
          {w.was === "you-asked" && (
            <p className="sb-small sb-muted">
              {t("friend-asked-before", {
                name: w.label,
                defaultValue:
                  "You asked {{name}} before; adding them again sends the request again.",
              })}
            </p>
          )}
          <div className="sb-note-card-actions">
            <button
              type="button"
              className="sb-note-button"
              onClick={() => friendship.add(w.who, w.label, { atHome: true })}
            >
              {t("friend-open-home-again", {
                defaultValue: "Open your Home again",
              })}
            </button>
            <button
              type="button"
              className="sb-note-button"
              onClick={() => friendship.clearWaiting()}
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            {w.was === "friend"
              ? t("friend-now-friends", {
                  name: w.label,
                  defaultValue: "✓ You and {{name}} are friends.",
                })
              : t("friend-asked", {
                  name: w.label,
                  defaultValue:
                    "✓ Asked {{name}}. You are friends once they accept.",
                })}
          </p>
          <button
            type="button"
            className="sb-note-button"
            onClick={() => friendship.clearWaiting()}
          >
            {t("done", { defaultValue: "Done" })}
          </button>
        </>
      )}
    </div>
  );
}

/** Add a friend by name, or send your friend link (copy, share, or email it). */
function AddFriend({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [who, setWho] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const s = state.session.value;
  const me = s?.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0];
  const myName = state.profile.mine.value?.displayName || s?.name || "";
  const link =
    me && typeof location !== "undefined"
      ? friendLink(location.origin, me, myName)
      : "";
  const invitation = t("friend-link-message", {
    name: myName || t("a-friend", { defaultValue: "A friend" }),
    defaultValue: "{{name}} would like to be friends on Seed Bible:",
  });
  return (
    <div className="sb-friend-tools">
      <FriendWaiting state={state} />
      <form
        className="sb-friend-add"
        onSubmit={(e) => {
          e.preventDefault();
          const typed = who;
          setAnswer(null);
          void addFriendOrInvite(state, typed, t).then((said) => {
            setAnswer(said);
            if (said === null || isEmail(typed)) setWho("");
          });
        }}
      >
        <label className="sb-friend-subtitle" htmlFor="sb-friend-add-input">
          {t("friend-add", { defaultValue: "Add a friend" })}
        </label>
        <div className="sb-friend-add-row">
          <input
            id="sb-friend-add-input"
            className="sb-note-editor"
            placeholder={t("friend-add-placeholder-email", {
              defaultValue: "A name like ruth.me, or an email address",
            })}
            value={who}
            onInput={(e) => setWho((e.target as HTMLInputElement).value)}
          />
          <button
            type="submit"
            className="sb-note-button sb-note-button-primary"
            disabled={!who.trim()}
          >
            {t("add", { defaultValue: "Add" })}
          </button>
        </div>
      </form>
      {answer && (
        <p className="sb-small sb-friends-answer" role="status">
          {answer}
        </p>
      )}
      {link && (
        <div className="sb-friend-link">
          <span className="sb-friend-subtitle">
            {t("friend-link-title", { defaultValue: "Your friend link" })}
          </span>
          <p className="sb-small sb-muted">
            {t("friend-link-hint", {
              defaultValue:
                "Send it to anyone. Opening it in the reader lets them add you in one step.",
            })}
          </p>
          <code className="sb-friend-link-url">{link}</code>
          <div className="sb-note-card-actions">
            <button
              type="button"
              className="sb-note-button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => {})
              }
            >
              {copied
                ? t("copied", { defaultValue: "Copied" })
                : t("copy-link", { defaultValue: "Copy link" })}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                type="button"
                className="sb-note-button"
                onClick={() =>
                  void navigator
                    .share({ text: invitation, url: link })
                    .catch(() => {})
                }
              >
                {t("share", { defaultValue: "Share" })}
              </button>
            )}
            <a
              className="sb-note-button"
              href={`mailto:?subject=${encodeURIComponent(invitation)}&body=${encodeURIComponent(`${invitation}\n\n${link}`)}`}
            >
              {t("friend-link-email", { defaultValue: "Email it" })}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
