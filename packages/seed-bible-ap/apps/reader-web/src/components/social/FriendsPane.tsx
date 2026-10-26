// FRIENDS — the old reader's Friends screen (packages/seed-bible components/FriendsPane), a full page reached from
// Profile: the requests waiting on you (Accept, Decline), your friends (Remove), Add a friend (by their name at a
// Home, or send your friend link; your address to copy), and the requests you sent (Cancel). Being friends is the
// two contact grants each person signs at their own Home, so adding, removing and cancelling open the Home for that
// one step; this page watches until it lands. Decline is Not now, kept on this device (declining is doing nothing).
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { friendLink, standingOf } from "../../state/social/friendship";
import { isEmail } from "../../state/social/invites";
import { addFriendOrInvite, isPersonName, myFriendlyName } from "./addFriend";
import {
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
  connectViaHome,
} from "../../session";
import { FriendWaiting } from "./TodayPane";
import { AccountCard } from "../chrome/AccountPane";
import { sessionEmail } from "../../session";
import { Description } from "../chrome/ProfilePane";
import type { FriendProfile } from "../../state/social/profile";

function Heading(props: { icon: string; children: string }) {
  return (
    <h2 className="sb-friends-heading">
      <span className="material-symbols-outlined" aria-hidden="true">
        {props.icon}
      </span>
      <span className="sb-friends-heading-text">{props.children}</span>
    </h2>
  );
}

function CopyButton(props: { text: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="sb-friends-button"
      aria-label={props.label}
      title={props.label}
      onClick={() =>
        void navigator.clipboard
          .writeText(props.text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {})
      }
    >
      <span className="sb-friends-copy-labels">
        {copied
          ? t("copied", { defaultValue: "Copied" })
          : t("copy", { defaultValue: "Copy" })}
      </span>
    </button>
  );
}

function Person(props: {
  name: string;
  subtitle?: ComponentChildren;
  picture?: string | undefined;
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  const shown = (
    <>
      {props.picture ? (
        <img className="sb-friends-avatar" src={props.picture} alt="" />
      ) : (
        <span
          className="sb-friends-avatar sb-friends-avatar-empty material-symbols-outlined"
          aria-hidden="true"
        >
          person
        </span>
      )}
      <span className="sb-friends-person-text">
        <span className="sb-friends-person-name">{props.name}</span>
        {props.subtitle ? (
          <span className="sb-friends-person-subtitle">{props.subtitle}</span>
        ) : null}
      </span>
    </>
  );
  return props.onOpen ? (
    <button
      type="button"
      className="sb-friends-person-button"
      aria-label={t("view-profile-of", {
        name: props.name,
        defaultValue: "View {{name}}'s profile",
      })}
      onClick={props.onOpen}
    >
      {shown}
    </button>
  ) : (
    <span className="sb-friends-person-button">{shown}</span>
  );
}

/** The old reader's person card: someone's picture and name, and their description when they've written one. */
function PersonCard(props: {
  name: string;
  profile?: FriendProfile | undefined;
}) {
  const { t } = useI18n();
  const p = props.profile;
  const empty = !p?.displayName && !p?.about && !p?.picture;
  return (
    <div className="sb-confirm-delete">
      <div className="sb-friend-link-about">
        <div className="sb-friend-link-person">
          <Person name={props.name} picture={p?.picture} />
        </div>
        {p?.about ? (
          <Description text={p.about} className="sb-friend-link-description" />
        ) : null}
        {empty ? (
          <p className="sb-friend-link-note">
            {t("person-profile-empty", {
              defaultValue: "This person hasn't set up their profile yet.",
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Header({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <header className="sb-pane-header">
      <button
        type="button"
        className="sb-profile-pane-back"
        aria-label={t("back", { defaultValue: "Back" })}
        title={t("back", { defaultValue: "Back" })}
        onClick={() => (state.ui.pane.value = "profile")}
      >
        <span className="material-symbols-outlined rtl-mirror">arrow_back</span>
      </button>
      <h2>{t("friends", { defaultValue: "Friends" })}</h2>
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

/** While someone is being removed at the Home: what to do there, then that it is done. */
function Removing({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const r = state.friendship.removing.value;
  if (!r) return null;
  return (
    <div className="sb-pane-notice sb-friend-waiting" role="status">
      <p>
        {r.done
          ? t("friend-removed", {
              name: r.label,
              defaultValue: "✓ {{name}} is no longer a friend.",
            })
          : t("friend-remove-confirm-window", {
              name: r.label,
              defaultValue:
                "A small window opened. Tap “Yes, remove them” there to remove {{name}}. It closes by itself.",
            })}
      </p>
      <button
        type="button"
        className="sb-note-button"
        onClick={() => state.friendship.clearRemoving()}
      >
        {r.done
          ? t("done", { defaultValue: "Done" })
          : t("cancel", { defaultValue: "Cancel" })}
      </button>
    </div>
  );
}

export function FriendsPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { today, friendship } = state;
  const s = state.session.value;
  const [who, setWho] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    agent: string;
    name: string;
  } | null>(null);
  /** The email an invitation is waiting to go to, while the reader says how they want to be known. */
  const [naming, setNaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    agent: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!s) return;
    void today.refresh();
    void state.invites.refresh();
    void state.invites.loadFindable();
    const address = s.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0];
    if (address) void state.invites.loadPublicName(address);
  }, [!!s]);

  if (!s)
    return (
      <section className="sb-pane sb-friends-pane">
        <Header state={state} />
        <div className="sb-friends-screen">
          <div className="sb-friends-inner sb-friends-signed-out">
            <p>
              {t("friends-signed-out", {
                defaultValue:
                  "Sign in to add friends and see what they're reading.",
              })}
            </p>
            <AccountCard state={state} />
          </div>
        </div>
      </section>
    );

  const me = s.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0] ?? "";
  const publicName = state.invites.publicName.value;
  const email = sessionEmail(s);
  const myName = myFriendlyName(state) ?? "";
  const link = me ? friendLink(location.origin, me, myName) : "";
  const invitation = t("friend-link-message", {
    name: myName || t("a-friend", { defaultValue: "A friend" }),
    defaultValue: "{{name}} would like to be friends on Seed Bible:",
  });
  const friends = today.friends.value;
  const sent = today.requested.value;
  const invitations = state.invites.sent.value;
  const invited = invitations.filter((i) => !i.acceptedBy);
  /** Who took one of your invitations — the email they were invited at, by their agent. */
  const joinedFrom = new Map(
    invitations
      .filter((i) => i.acceptedBy)
      .map((i) => [i.acceptedBy!.toLowerCase(), i.email])
  );
  // They joined from your invitation and are not friends yet: inviting them was your yes, so this is one tap to
  // finish, never a request to weigh with Decline — whether or not their side has landed.
  const joined = [...joinedFrom].filter(([agent]) => {
    const st = standingOf(today.friendsView.value, agent);
    return st === "none" || st === "asked-you";
  });
  const incoming = friendship.requests.value.filter(
    (r) => !joinedFrom.has(r.agent.toLowerCase())
  );
  // A name, else the email they were invited at, before a bare address.
  const nameOf = (agent: string, name?: string | null) =>
    today.profiles.value[agent.toLowerCase()]?.displayName ??
    (name && !/^0x[0-9a-f]{40}$/i.test(name) ? name : null) ??
    joinedFrom.get(agent.toLowerCase()) ??
    name ??
    agent;
  const here = (agent: string) =>
    state.presence.friends.value.find(
      (f) => f.agent.toLowerCase() === agent.toLowerCase()
    )?.presence ?? [];

  return (
    <section className="sb-pane sb-friends-pane">
      <Header state={state} />
      <div className="sb-friends-screen">
        <div className="sb-friends-inner">
          <FriendWaiting state={state} />
          <Removing state={state} />

          {joined.length > 0 && (
            <section className="sb-friends-section">
              <Heading icon="waving_hand">
                {t("friend-joined-heading", {
                  defaultValue: "Joined from your invitation",
                })}
              </Heading>
              <ul className="sb-friends-list">
                {joined.map(([agent, email]) => {
                  const name = nameOf(agent);
                  return (
                    <li key={agent} className="sb-friends-row">
                      <Person
                        name={name}
                        onOpen={() => setViewing({ agent, name })}
                        picture={today.profiles.value[agent]?.picture}
                        subtitle={
                          name === email
                            ? t("friend-joined-line", {
                                defaultValue: "accepted your invitation",
                              })
                            : email
                        }
                      />
                      <span className="sb-friends-row-actions">
                        <button
                          type="button"
                          className="sb-friends-button sb-friends-button--primary"
                          aria-label={t("add-friend-user", {
                            name,
                            defaultValue: "Add {{name}} as a friend",
                          })}
                          onClick={() => friendship.add(agent, name)}
                        >
                          {t("friend-finish-adding", {
                            defaultValue: "Finish adding",
                          })}
                        </button>
                        {/* Not someone to add after all: clear the invitation they accepted, so they are not offered again. */}
                        <button
                          type="button"
                          className="sb-friends-button"
                          aria-label={t("friend-joined-dismiss-user", {
                            name,
                            defaultValue: "Remove {{name}} from this list",
                          })}
                          onClick={() =>
                            void state.invites.clearAccepted(agent)
                          }
                        >
                          {t("remove", { defaultValue: "Remove" })}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {incoming.length > 0 && (
            <section className="sb-friends-section">
              <Heading icon="how_to_reg">
                {t("friend-requests", { defaultValue: "Friend requests" })}
              </Heading>
              <ul className="sb-friends-list">
                {incoming.map((r) => {
                  const name = nameOf(r.agent, r.name);
                  return (
                    <li key={r.agent} className="sb-friends-row">
                      <Person
                        name={name}
                        onOpen={() => setViewing({ agent: r.agent, name })}
                        picture={
                          today.profiles.value[r.agent.toLowerCase()]?.picture
                        }
                        subtitle={t("friend-request-line", {
                          defaultValue: "wants to be friends",
                        })}
                      />
                      <span className="sb-friends-row-actions">
                        <button
                          type="button"
                          className="sb-friends-button sb-friends-button--primary"
                          aria-label={t("accept-friend-user", {
                            name,
                            defaultValue: "Accept {{name}}'s friend request",
                          })}
                          onClick={() => friendship.add(r.agent, r.name)}
                        >
                          {t("accept", { defaultValue: "Accept" })}
                        </button>
                        <button
                          type="button"
                          className="sb-friends-button"
                          aria-label={t("decline-friend-user", {
                            name,
                            defaultValue: "Decline {{name}}'s friend request",
                          })}
                          onClick={() => void friendship.putAside(r.agent)}
                        >
                          {t("decline", { defaultValue: "Decline" })}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="sb-friends-section">
            <Heading icon="group">
              {t("friends", { defaultValue: "Friends" })}
            </Heading>
            {friends.length > 0 ? (
              <ul className="sb-friends-list">
                {friends.map((c) => {
                  const name = nameOf(c.contact, c.name);
                  const at = here(c.contact);
                  const prof = today.profiles.value[c.contact.toLowerCase()];
                  return (
                    <li key={c.contact} className="sb-friends-row">
                      <Person
                        name={name}
                        onOpen={() => setViewing({ agent: c.contact, name })}
                        picture={prof?.picture}
                        subtitle={
                          at.length
                            ? at.map((p) => p.label ?? p.app).join(" · ")
                            : (prof?.about ?? "")
                        }
                      />
                      <span className="sb-friends-row-actions">
                        <button
                          type="button"
                          className="sb-friends-button"
                          aria-label={t("remove-friend-user", {
                            name,
                            defaultValue: "Remove {{name}} as a friend",
                          })}
                          onClick={() =>
                            setConfirming({ agent: c.contact, name })
                          }
                        >
                          {t("remove", { defaultValue: "Remove" })}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="sb-friends-empty">
                {today.contactsLoading.value
                  ? t("loading", { defaultValue: "Loading…" })
                  : t("friends-empty", {
                      defaultValue:
                        "No friends yet. Share your friend link, or add someone by their name at a Home.",
                    })}
              </p>
            )}
            {today.contactsError.value && (
              <p className="sb-small sb-muted">{today.contactsError.value}</p>
            )}
          </section>

          <section className="sb-friends-card">
            <Heading icon="person_add">
              {t("add-friend", { defaultValue: "Add a friend" })}
            </Heading>
            {!naming && (
              <form
                className="sb-friends-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const typed = who;
                  setAnswer(null);
                  // An invitation names who sent it: with no name to give (a nameless agent), ask for one first.
                  if (isEmail(typed) && !myFriendlyName(state)) {
                    setNaming(typed.trim());
                    return;
                  }
                  void addFriendOrInvite(state, typed, t).then((said) => {
                    setAnswer(said);
                    if (said === null || isEmail(typed)) setWho("");
                  });
                }}
              >
                <input
                  type="text"
                  className="sb-friends-add-input"
                  value={who}
                  onInput={(e) => setWho((e.target as HTMLInputElement).value)}
                  placeholder={t("friend-add-placeholder-plain", {
                    defaultValue: "Their email, or their name here",
                  })}
                  aria-label={t("add-friend", { defaultValue: "Add a friend" })}
                  autoComplete="off"
                  spellcheck={false}
                />
                <button
                  type="submit"
                  className="sb-friends-button sb-friends-button--primary"
                  disabled={!who.trim()}
                >
                  {isEmail(who)
                    ? t("send-friend-invitation", {
                        defaultValue: "Send invitation",
                      })
                    : t("send-friend-request", {
                        defaultValue: "Send request",
                      })}
                </button>
              </form>
            )}
            {naming && (
              <NameForInvite
                state={state}
                email={naming}
                onCancel={() => setNaming(null)}
                onSent={(said) => {
                  setNaming(null);
                  setAnswer(said);
                  setWho("");
                }}
              />
            )}
            {answer && (
              <p className="sb-small sb-friends-answer" role="status">
                {answer}
              </p>
            )}
            {link && (
              <div className="sb-friends-share">
                <div className="sb-friends-share-row sb-friends-my-link">
                  <span className="sb-friends-share-text sb-friends-share-label">
                    {t("your-friend-link-description", {
                      defaultValue:
                        "Share your friend link. Anyone who opens it can send you a request.",
                    })}
                  </span>
                  <CopyButton
                    text={link}
                    label={t("copy-your-friend-link", {
                      defaultValue: "Copy your friend link",
                    })}
                  />
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <button
                      type="button"
                      className="sb-friends-button"
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
                    className="sb-friends-button"
                    href={`mailto:?subject=${encodeURIComponent(invitation)}&body=${encodeURIComponent(`${invitation}\n\n${link}`)}`}
                  >
                    {t("friend-link-email", { defaultValue: "Email it" })}
                  </a>
                </div>
                <FindMeAs state={state} name={publicName} email={email} />
              </div>
            )}
          </section>

          {(sent.length > 0 || invited.length > 0) && (
            <section className="sb-friends-section">
              <Heading icon="schedule_send">
                {t("sent-friend-requests", { defaultValue: "Sent requests" })}
              </Heading>
              <ul className="sb-friends-list">
                {sent.map((r) => {
                  const name = nameOf(r.agent, r.name);
                  return (
                    <li key={r.agent} className="sb-friends-row">
                      <Person
                        name={name}
                        onOpen={() => setViewing({ agent: r.agent, name })}
                        subtitle={t("friend-request-pending", {
                          defaultValue: "Waiting for them to accept",
                        })}
                      />
                      <span className="sb-friends-row-actions">
                        <button
                          type="button"
                          className="sb-friends-button"
                          aria-label={t("cancel-friend-request-user", {
                            name,
                            defaultValue:
                              "Cancel your friend request to {{name}}",
                          })}
                          onClick={() => friendship.remove(r.agent, name)}
                        >
                          {t("cancel", { defaultValue: "Cancel" })}
                        </button>
                      </span>
                    </li>
                  );
                })}
                {invited.map((i) => (
                  <li key={i.token} className="sb-friends-row">
                    <Person
                      name={i.email}
                      subtitle={t("friend-invite-pending", {
                        defaultValue:
                          "Invited by email · waiting for them to join",
                      })}
                    />
                    <span className="sb-friends-row-actions">
                      <button
                        type="button"
                        className="sb-friends-button"
                        aria-label={t("resend-invitation-to", {
                          email: i.email,
                          defaultValue:
                            "Send the invitation to {{email}} again",
                        })}
                        onClick={() =>
                          void state.invites.resend(i.token).then((ok) =>
                            setAnswer(
                              ok
                                ? t("friend-invite-sent-again", {
                                    email: i.email,
                                    defaultValue:
                                      "Sent your invitation to {{email}} again.",
                                  })
                                : t("friend-invite-resend-failed", {
                                    defaultValue:
                                      "Couldn't send it again. Try in a moment.",
                                  })
                            )
                          )
                        }
                      >
                        {t("resend", { defaultValue: "Resend" })}
                      </button>
                      <button
                        type="button"
                        className="sb-friends-button"
                        aria-label={t("cancel-invitation-to", {
                          email: i.email,
                          defaultValue: "Cancel your invitation to {{email}}",
                        })}
                        onClick={() => void state.invites.cancel(i.token)}
                      >
                        {t("cancel", { defaultValue: "Cancel" })}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {viewing && (
        <div
          className="sb-footnote-modal-overlay"
          onClick={() => setViewing(null)}
        >
          <div
            className="sb-footnote-modal sb-content-dialog sb-person-profile"
            role="dialog"
            aria-label={t("profile", { defaultValue: "Profile" })}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="sb-footnote-modal-header">
              <h3 className="sb-footnote-modal-title">
                {t("profile", { defaultValue: "Profile" })}
              </h3>
              <button
                type="button"
                className="sb-footnote-modal-close"
                aria-label={t("close", { defaultValue: "Close" })}
                onClick={() => setViewing(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <PersonCard
              name={viewing.name}
              profile={today.profiles.value[viewing.agent.toLowerCase()]}
            />
          </div>
        </div>
      )}

      {confirming && (
        <div
          className="sb-footnote-modal-overlay"
          onClick={() => setConfirming(null)}
        >
          <div
            className="sb-footnote-modal sb-content-dialog"
            role="dialog"
            aria-label={t("remove-friend-confirm-title", {
              defaultValue: "Remove friend?",
            })}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="sb-footnote-modal-header">
              <h3 className="sb-footnote-modal-title">
                {t("remove-friend-confirm-title", {
                  defaultValue: "Remove friend?",
                })}
              </h3>
            </div>
            <div className="sb-confirm-delete">
              <p className="sb-confirm-delete-message">
                {t("remove-friend-confirm-message", {
                  name: confirming.name,
                  defaultValue:
                    "Remove {{name}} as a friend? You'll both stop seeing each other's reading.",
                })}
              </p>
              <div className="sb-confirm-delete-actions">
                <button
                  type="button"
                  className="sb-note-button"
                  onClick={() => setConfirming(null)}
                >
                  {t("cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  className="sb-note-button sb-note-button-danger"
                  onClick={() => {
                    friendship.remove(confirming.agent, confirming.name);
                    setConfirming(null);
                  }}
                >
                  {t("remove", { defaultValue: "Remove" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** What a friend can really type to find you: your public name, or your email when you let people find you by it —
 *  never a display name, which finds no one. With neither, it says so and offers the email switch right here. */
function FindMeAs({
  state,
  name,
  email,
}: {
  state: ReaderState;
  name: string | null | undefined;
  email: string | null;
}) {
  const { t } = useI18n();
  const findable = state.invites.findable.value;
  if (name === undefined) return null;
  if (name)
    return (
      <div className="sb-friends-share-row sb-friends-my-id">
        <span className="sb-friends-share-text">
          <span className="sb-friends-share-label">
            {t("friends-find-you-as", {
              defaultValue: "Friends can find you as",
            })}
          </span>
          <code className="sb-friends-my-id-value">{name}</code>
        </span>
        <CopyButton
          text={name}
          label={t("copy-your-user-id", { defaultValue: "Copy your user ID" })}
        />
      </div>
    );
  return (
    <div className="sb-friends-share-row sb-friends-my-id sb-friends-find-me">
      <span className="sb-friends-share-text">
        {findable && email ? (
          <>
            <span className="sb-friends-share-label">
              {t("friends-find-you-by-email", {
                defaultValue: "Friends can find you by your email",
              })}
            </span>
            <code className="sb-friends-my-id-value">{email}</code>
          </>
        ) : (
          <span className="sb-friends-share-label">
            {t("friends-find-you-nothing", {
              defaultValue:
                "You don't have a name friends can type yet, so they can't find you by searching. Send them your friend link instead.",
            })}
          </span>
        )}
        {email && findable !== null && (
          <label className="sb-friends-find-me-email">
            <input
              type="checkbox"
              checked={findable}
              onChange={(e) =>
                void state.invites.setFindable(
                  (e.currentTarget as HTMLInputElement).checked
                )
              }
            />{" "}
            {t("findable-by-email-here", {
              email,
              defaultValue: "Let people who have my email ({{email}}) find me",
            })}
          </label>
        )}
      </span>
      {findable && email && (
        <CopyButton
          text={email}
          label={t("copy-your-email", { defaultValue: "Copy your email" })}
        />
      )}
    </div>
  );
}

/** Before an invitation goes out from someone the Home knows by no name (a nameless agent): how they want their friend
 *  to know them — their first and last name — and whether to keep that in their profile, so they are not asked again. */
function NameForInvite({
  state,
  email,
  onCancel,
  onSent,
}: {
  state: ReaderState;
  email: string;
  onCancel: () => void;
  onSent: (said: string | null) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const ok = isPersonName(name);
  return (
    <form
      className="sb-friends-name-for-invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok || busy) return;
        setBusy(true);
        // The invitation first: it opens the Home's window, which must happen on this tap, before anything is awaited.
        const sending = addFriendOrInvite(state, email, t, name.trim());
        void (async () => {
          if (keep)
            await state.profile
              .save({ displayName: name.trim() })
              .catch(() => undefined);
          onSent(await sending);
        })().finally(() => setBusy(false));
      }}
    >
      <label className="sb-friends-name-for-invite-ask" htmlFor="sb-invite-as">
        {t("invite-as-ask", {
          email,
          defaultValue: "How should {{email}} know you?",
        })}
      </label>
      <p className="sb-small sb-muted">
        {t("invite-as-why", {
          defaultValue:
            "Your invitation says who it is from. Your Home doesn't have a name for you yet.",
        })}
      </p>
      <input
        id="sb-invite-as"
        type="text"
        className="sb-friends-add-input"
        autoComplete="name"
        value={name}
        placeholder={t("invite-as-placeholder", {
          defaultValue: "Your first and last name",
        })}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <label className="sb-friends-name-for-invite-keep">
        <input
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep((e.target as HTMLInputElement).checked)}
        />{" "}
        {t("invite-as-keep", {
          defaultValue:
            "Save this name to my profile, so friends always see it",
        })}
      </label>
      <div className="sb-note-card-actions">
        <button
          type="submit"
          className="sb-note-button sb-note-button-primary"
          disabled={!ok || busy}
        >
          {busy
            ? t("sending", { defaultValue: "Sending…" })
            : t("invite-as-send", { defaultValue: "Send invitation" })}
        </button>
        <button type="button" className="sb-note-button" onClick={onCancel}>
          {t("cancel", { defaultValue: "Cancel" })}
        </button>
      </div>
    </form>
  );
}
