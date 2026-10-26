// AN INVITATION OPENED HERE (`/friend/<address>?name=…`, or an emailed invitation `/invite/<token>`) — the invited
// person's whole welcome in one window, for someone who has never seen the app: who invited them and their note; the
// terms and one Continue that signs them in at their Home (or creates their account there); then "Welcome, <name>"
// with one tap to add the inviter; then done, back to reading. Accepting an emailed invitation also takes it, so the
// inviter sees they joined. The link carries no authority; it only names who asked.
import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { standingOf } from "../../state/social/friendship";
import { isPersonName } from "./addFriend";
import {
  connectViaHome,
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
} from "../../session";

function Frame(props: {
  title: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  return (
    <div className="sb-footnote-modal-overlay" onClick={props.onClose}>
      <div
        className="sb-footnote-modal sb-friend-invite-dialog sb-invite-welcome"
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

/** The inviter as a face: their first letter in a circle. */
function Initial({ name }: { name: string }) {
  return (
    <span className="sb-invite-initial" aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function FriendInviteDialog({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { friendship } = state;
  const inv = friendship.invite.value;
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  /** Stops a sign-in still waiting on the Home's window. */
  const stop = useRef<AbortController | null>(null);
  // Out of the way while the reader uses another way to sign in; back once they have.
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
  // Never an address: a sender who gave no name is "A friend".
  const name = isPersonName(inv.name)
    ? inv.name
    : t("invite-a-friend", { defaultValue: "A friend" });
  const s = state.session.value;
  const me = s?.sub.match(/0x[0-9a-fA-F]{40}$/)?.[0];
  const self = !!me && me.toLowerCase() === inv.agent;
  const standing = standingOf(state.today.friendsView.value, inv.agent);
  const myName = state.profile.mine.value?.displayName || s?.name || "";

  const signIn = async () => {
    if (!agreed) {
      setProblem(
        t("login-error-terms-required", {
          defaultValue: "Please agree to the terms of service to continue.",
        })
      );
      return;
    }
    setProblem(null);
    setBusy(t("invite-opening-home", { defaultValue: "Opening sign-in…" }));
    try {
      // One Home window: it signs them in, then asks "Add <inviter> as a friend?" before it closes.
      const addPath = /^0x[0-9a-f]{40}$/.test(inv.agent)
        ? new URL(friendship.homeUrl("add", inv.agent, inv.name)).pathname +
          new URL(friendship.homeUrl("add", inv.agent, inv.name)).search
        : undefined;
      stop.current?.abort();
      stop.current = new AbortController();
      const out = await connectViaHome(DEFAULT_ESTATE, (m) => setBusy(m), {
        ...(addPath ? { then: addPath } : {}),
        signal: stop.current.signal,
      });
      if (out) {
        await state.signIn(out);
        if (addPath) {
          if (inv.token) void state.invites.claim(inv.token);
          friendship.add(inv.agent, inv.name, { alreadyAsked: true });
          setAdded(true);
        }
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const add = () => {
    if (inv.token) void state.invites.claim(inv.token);
    friendship.add(inv.agent, inv.name);
    setAdded(true);
  };

  const note = inv.note && (
    <blockquote className="sb-small sb-friend-invite-note">
      {inv.note}
    </blockquote>
  );

  // 1 · Signed out: who invited you, the terms, one Continue.
  if (!s)
    return (
      <Frame
        title={t("invite-welcome-title", {
          name,
          defaultValue: "{{name}} invited you to Seed Bible",
        })}
        onClose={close}
      >
        <div className="sb-invite-who">
          <Initial name={name} />
          <p className="sb-invite-lead">
            {isPersonName(inv.name)
              ? t("invite-welcome-lead", {
                  name,
                  defaultValue:
                    "Read the Bible together with {{name}}. Friends see what each other share, and when the other is reading.",
                })
              : t("invite-welcome-lead-unnamed", {
                  defaultValue:
                    "Read the Bible together. Friends see what each other share, and when the other is reading.",
                })}
          </p>
        </div>
        {note}
        <label className="sb-login-terms" htmlFor="sb-invite-terms">
          <input
            id="sb-invite-terms"
            className="sb-login-terms-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed((e.currentTarget as HTMLInputElement).checked);
              setProblem(null);
            }}
          />
          <span className="sb-login-terms-text">
            {t("login-agree-prefix", { defaultValue: "I agree to the" })}{" "}
            <a
              className="sb-login-link"
              href="?terms=open"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                state.ui.policy.value = "terms-of-service";
                state.ui.pane.value = "about";
              }}
            >
              {t("terms-of-service", { defaultValue: "Terms of service" })}
            </a>
          </span>
        </label>
        {problem && (
          <p className="sb-small sb-pane-error" role="alert">
            {problem}
          </p>
        )}
        <button
          type="button"
          className="sb-note-button sb-note-button-primary sb-invite-continue"
          disabled={!!busy || !HOME_SIGNIN_AVAILABLE}
          onClick={() => void signIn()}
        >
          {busy ?? t("invite-continue", { defaultValue: "Continue" })}
        </button>
        {busy && (
          <button
            type="button"
            className="sb-discover-create-link"
            onClick={() => {
              stop.current?.abort();
              setBusy(null);
            }}
          >
            {t("cancel", { defaultValue: "Cancel" })}
          </button>
        )}
        <p className="sb-small sb-muted sb-invite-fineprint">
          {t("invite-continue-hint", {
            defaultValue:
              "A small window opens: continue with Google or your email. New here? That creates your account.",
          })}{" "}
          <button
            type="button"
            className="sb-discover-create-link"
            onClick={() => (state.ui.pane.value = "account")}
          >
            {t("invite-other-ways", { defaultValue: "Other ways to sign in" })}
          </button>
        </p>
      </Frame>
    );

  if (self)
    return (
      <Frame
        title={t("invite-yours", {
          defaultValue: "This is your own invitation",
        })}
        onClose={close}
      >
        <p className="sb-small">
          {t("friend-invite-self", {
            defaultValue: "This is your own friend link — send it to a friend.",
          })}
        </p>
      </Frame>
    );

  // 3 · Done: friends already, or the add went through.
  const w = friendship.waiting.value;
  const landed = standing === "friend" || (added && !!w?.landed);
  if (standing === "friend" || added)
    return (
      <Frame
        title={
          landed
            ? t("invite-now-friends", {
                name,
                defaultValue: "You and {{name}} are friends",
              })
            : t("invite-adding", { name, defaultValue: "Adding {{name}}…" })
        }
        onClose={close}
      >
        <div className="sb-invite-who">
          <Initial name={name} />
          <p className="sb-invite-lead">
            {landed
              ? t("invite-done-lead", {
                  name,
                  defaultValue:
                    "{{name}} will see you joined. Share a note, start a plan together, or just start reading.",
                })
              : t("friend-confirm-window", {
                  name,
                  defaultValue:
                    "A small window opened. Tap “Yes, add them” there to add {{name}}. It closes by itself.",
                })}
          </p>
        </div>
        <button
          type="button"
          className="sb-note-button sb-note-button-primary sb-invite-continue"
          onClick={close}
        >
          {t("invite-start-reading", { defaultValue: "Start reading" })}
        </button>
      </Frame>
    );

  // 2 · Signed in: welcome, and one tap to add the person who invited you.
  return (
    <Frame
      title={
        myName
          ? t("invite-welcome-in", {
              name: myName,
              defaultValue: "Welcome, {{name}}!",
            })
          : t("invite-welcome-in-plain", { defaultValue: "Welcome!" })
      }
      onClose={close}
    >
      <div className="sb-invite-who">
        <Initial name={name} />
        <p className="sb-invite-lead">
          {t("invite-add-lead", {
            name,
            defaultValue:
              "{{name}} invited you. Add them as a friend to read together.",
          })}
        </p>
      </div>
      {note}
      <div className="sb-note-card-actions">
        <button
          type="button"
          className="sb-note-button sb-note-button-primary sb-invite-continue"
          onClick={add}
        >
          {t("friend-invite-accept", {
            name,
            defaultValue: "Add {{name}} as a friend",
          })}
        </button>
        <button type="button" className="sb-note-button" onClick={close}>
          {t("not-now", { defaultValue: "Not now" })}
        </button>
      </div>
    </Frame>
  );
}
