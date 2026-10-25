// THE SESSION PANE — start or join a live reading, who is here and where, the share link, roles (host), the way to
// the chat (the floating chat panel, components/sessions/ChatPanel.tsx), settings, and the end button.
import { SessionQRCode } from "./SessionQRCode";
import { HuddleCard } from "./HuddleCall";
import { useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { requestEndSession } from "./SessionSettings";
import { standingOf } from "../../state/social/friendship";

/**
 * The old reader's Add friend on a session participant: where you stand with them (Friends, Requested), their
 * request to accept, or one to send. Nothing for yourself, for guests (no account), or while you're a guest.
 */
function ParticipantFriend(props: {
  state: ReaderState;
  agent: string;
  name: string;
}) {
  const { state, agent, name } = props;
  const { t } = useI18n();
  const standing = standingOf(state.today.friendsView.value, agent);
  if (standing === "friend" || standing === "you-asked")
    return (
      <span className="sb-participant-friend-status">
        {standing === "friend"
          ? t("friends", { defaultValue: "Friends" })
          : t("friend-status-requested", { defaultValue: "Requested" })}
      </span>
    );
  const asked = standing === "asked-you";
  return (
    <button
      type="button"
      className="sb-session-participant-action"
      aria-label={
        asked
          ? t("accept-friend-user", {
              name,
              defaultValue: "Accept {{name}}'s friend request",
            })
          : t("add-friend-user", {
              name,
              defaultValue: "Add {{name}} as a friend",
            })
      }
      onClick={() => state.friendship.add(agent, name)}
    >
      {asked
        ? t("accept", { defaultValue: "Accept" })
        : t("add-friend-button", { defaultValue: "Add friend" })}
    </button>
  );
}

export function SessionPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const live = state.live;
  const signedIn = !!state.session.value;
  const [joinId, setJoinId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const s = live.state.value;
  // The session's own voice (the peer mesh) is for guests, and for anyone where the estate's call is not offered.
  const mesh = !signedIn || !!live.guest.value || !state.huddle.available.value;

  const copy = async () => {
    const link = live.shareLink.value;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the link is shown */
    }
  };

  return (
    <section
      className="sb-pane sb-session-pane"
      aria-label={t("live-session", { defaultValue: "Live session" })}
    >
      <header className="sb-pane-header">
        <h2>{t("live-session", { defaultValue: "Live session" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      {live.error.value && <p className="sb-pane-error">{live.error.value}</p>}

      {!live.active.value && (
        <div className="sb-account-card">
          {!signedIn && (
            <p className="sb-small">
              {t("session-sign-in", {
                defaultValue: "Sign in to read together.",
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
          <p className="sb-small sb-muted">
            {t("session-start-blurb", {
              defaultValue:
                "Start a session on the chapter you have open: you lead, friends follow you, and everyone sees your marks for the session.",
            })}
          </p>
          <button
            className="sb-note-button sb-note-button-primary"
            disabled={!signedIn}
            onClick={() => void live.start().catch(() => {})}
          >
            {t("session-start", { defaultValue: "Start a session here" })}
          </button>
          {!signedIn && (
            <form
              className="sb-session-join"
              onSubmit={(e) => {
                e.preventDefault();
                const id =
                  (joinId.trim() || state.ui.pendingJoin.value?.sessionId) ??
                  "";
                const code =
                  (joinCode.trim() || state.ui.pendingJoin.value?.code) ?? "";
                if (id && code)
                  void live
                    .joinAsGuest(id, code, guestName.trim() || "Guest")
                    .then(() => (state.ui.pendingJoin.value = null))
                    .catch(() => {});
              }}
            >
              <p className="sb-small">
                {t("session-guest-blurb", {
                  defaultValue:
                    "No Home? Join as a guest with the Session ID and Code the leader sent you: you follow along and chat; nothing of yours is kept.",
                })}
              </p>
              <input
                className="sb-note-editor"
                placeholder={t("session-guest-name", {
                  defaultValue: "Your name",
                })}
                value={guestName}
                onInput={(e) =>
                  setGuestName((e.target as HTMLInputElement).value)
                }
              />
              {!state.ui.pendingJoin.value && (
                <>
                  <input
                    className="sb-note-editor"
                    placeholder={t("session-id", {
                      defaultValue: "Session id",
                    })}
                    value={joinId}
                    onInput={(e) =>
                      setJoinId((e.target as HTMLInputElement).value)
                    }
                  />
                  <input
                    className="sb-note-editor"
                    placeholder={t("session-code", {
                      defaultValue: "Share code",
                    })}
                    value={joinCode}
                    onInput={(e) =>
                      setJoinCode((e.target as HTMLInputElement).value)
                    }
                  />
                </>
              )}
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
              >
                {t("session-join-guest", { defaultValue: "Join as a guest" })}
              </button>
            </form>
          )}
          <form
            className="sb-session-join"
            onSubmit={(e) => {
              e.preventDefault();
              if (joinId.trim())
                void live
                  .join(joinId.trim(), joinCode.trim() || undefined)
                  .catch(() => {});
            }}
          >
            <input
              className="sb-note-editor"
              placeholder={t("session-id", { defaultValue: "Session ID" })}
              value={joinId}
              onInput={(e) => setJoinId((e.target as HTMLInputElement).value)}
            />
            <input
              className="sb-note-editor"
              placeholder={t("session-code", { defaultValue: "Code" })}
              value={joinCode}
              onInput={(e) => setJoinCode((e.target as HTMLInputElement).value)}
            />
            <button
              type="submit"
              className="sb-note-button"
              disabled={!signedIn || !joinId.trim()}
            >
              {t("session-join", { defaultValue: "Join" })}
            </button>
          </form>
        </div>
      )}

      {live.active.value && s && (
        <>
          <div className="sb-account-card">
            <p className="sb-small">
              <strong>
                {s.passage
                  ? `${s.passage.bookId === state.reading.bookId.value ? state.reading.bookName.value : s.passage.bookId} ${s.passage.chapterNumber} · ${s.passage.translationId}`
                  : ""}
              </strong>
              <br />
              <span className="sb-muted">
                {live.connected.value
                  ? t("session-connected", { defaultValue: "Connected" })
                  : t("session-connecting", {
                      defaultValue: "Connecting…",
                    })}{" "}
                ·{" "}
                {t("session-role", {
                  role: live.myRole.value,
                  defaultValue: `you are ${live.myRole.value}`,
                })}
              </span>
            </p>
            {/* What a friend needs to join, named plainly: the session's id and its code, each with Copy. */}
            <dl className="sb-session-ids">
              <dt>{t("session-id", { defaultValue: "Session ID" })}</dt>
              <dd>
                <code className="sb-session-id">{live.sessionId.value}</code>
                <CopyButton text={live.sessionId.value ?? ""} />
              </dd>
              {live.code.value && (
                <>
                  <dt>{t("session-code", { defaultValue: "Code" })}</dt>
                  <dd>
                    <code className="sb-session-code">{live.code.value}</code>
                    <CopyButton text={live.code.value} />
                  </dd>
                </>
              )}
            </dl>
            {live.shareLink.value && (
              <>
                <p className="sb-small sb-muted">
                  {t("session-share-how", {
                    defaultValue:
                      "Send friends the link (it carries both), or have them open Live session and enter the Session ID and Code.",
                  })}
                </p>
                <div className="sb-note-card-actions">
                  <button
                    className="sb-note-button"
                    onClick={() => void copy()}
                  >
                    {copied
                      ? t("copied", { defaultValue: "Copied" })
                      : t("copy-link", { defaultValue: "Copy link" })}
                  </button>
                  <button
                    className="sb-note-button"
                    aria-expanded={showQr}
                    onClick={() => setShowQr((v) => !v)}
                  >
                    {t("session-qr", { defaultValue: "QR code" })}
                  </button>
                </div>
              </>
            )}
            {live.shareLink.value && showQr && (
              <SessionQRCode url={live.shareLink.value} />
            )}
            {live.recordRef.value && (
              <p className="sb-small sb-muted" title={live.recordRef.value}>
                {t("session-record-saved", {
                  defaultValue:
                    "A record of this session is kept in your Library.",
                })}
              </p>
            )}
            <HuddleCard state={state} />
            {mesh && (
              <div className="sb-note-card-actions sb-voice-controls">
                {!state.voice.on.value ? (
                  <button
                    className="sb-note-button"
                    onClick={() => void state.voice.join().catch(() => {})}
                  >
                    <span className="material-symbols-outlined">mic</span>{" "}
                    {t("voice-join", { defaultValue: "Join voice" })}
                  </button>
                ) : (
                  <>
                    <button
                      className="sb-note-button"
                      onClick={() =>
                        state.setVoiceMuted(!state.voice.muted.value)
                      }
                    >
                      <span className="material-symbols-outlined">
                        {state.voice.muted.value ? "mic_off" : "mic"}
                      </span>{" "}
                      {state.voice.muted.value
                        ? t("voice-unmute", { defaultValue: "Unmute" })
                        : t("voice-mute", { defaultValue: "Mute" })}
                    </button>
                    <button
                      className="sb-note-button"
                      onClick={() => void state.voice.leave()}
                    >
                      {t("voice-leave", { defaultValue: "Leave voice" })}
                    </button>
                  </>
                )}
              </div>
            )}
            {mesh && state.voice.on.value && (
              <p className="sb-small sb-muted">
                {t("voice-note", {
                  count: state.voice.connected.value.length,
                  defaultValue: `Voice is peer to peer between the devices on it (${state.voice.connected.value.length} connected); no server hears it. Some networks will not connect without a relay.`,
                })}
                {state.voice.error.value ? ` · ${state.voice.error.value}` : ""}
              </p>
            )}
            {Object.entries(state.voice.remote.value).map(([agent, stream]) => (
              <audio
                key={agent}
                autoPlay
                ref={(el) => {
                  if (el && el.srcObject !== stream) el.srcObject = stream;
                }}
              />
            ))}
            {live.isHost.value && (
              <label className="sb-small sb-check">
                <input
                  type="checkbox"
                  checked={s.allowGuests !== false}
                  onChange={(e) =>
                    void live.setGuests((e.target as HTMLInputElement).checked)
                  }
                />{" "}
                {t("session-allow-guests", {
                  defaultValue:
                    "Let guests (no Home) join with the Session ID and Code",
                })}
              </label>
            )}
            <div className="sb-note-card-actions">
              <button
                className="sb-note-button"
                onClick={() => (state.ui.sessionSettings.value = true)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>{" "}
                {t("session-settings", { defaultValue: "Session settings" })}
              </button>
              {live.isHost.value ? (
                <button
                  className="sb-note-button sb-note-button-danger"
                  onClick={() => requestEndSession(state)}
                >
                  {t("session-end", { defaultValue: "End session" })}
                </button>
              ) : (
                <button className="sb-note-button" onClick={() => live.leave()}>
                  {t("session-leave", { defaultValue: "Leave" })}
                </button>
              )}
            </div>
          </div>

          <div className="sb-content-section">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("session-participants", { defaultValue: "Here" })}
              </h3>
            </div>
            {s.participants.map((p) => {
              const where = live.presence.value[p.agent]?.verse;
              return (
                <div key={p.agent} className="sb-friends-row">
                  <span className="sb-friends-person-text">
                    <span className="sb-friends-person-name">
                      {p.name}
                      {p.agent === live.me.value
                        ? ` (${t("you", { defaultValue: "you" })})`
                        : ""}
                    </span>
                    <span className="sb-friends-person-subtitle">
                      {p.role}
                      {p.guest
                        ? ` · ${t("session-guest", { defaultValue: "guest" })}`
                        : ""}
                      {p.voice
                        ? ` · ${t("session-on-voice", { defaultValue: "on voice" })}`
                        : ""}
                      {where
                        ? ` · ${t("session-at-verse", { verse: where, defaultValue: `at verse ${where}` })}`
                        : ""}
                    </span>
                  </span>
                  {signedIn &&
                    !live.guest.value &&
                    !p.guest &&
                    p.agent !== live.me.value && (
                      <ParticipantFriend
                        state={state}
                        agent={p.agent}
                        name={p.name}
                      />
                    )}
                  {live.isHost.value && p.agent !== live.me.value && (
                    <select
                      className="sb-session-role-select"
                      value={p.role}
                      onChange={(e) =>
                        void live.setRole(
                          p.agent,
                          (e.target as HTMLSelectElement).value as
                            | "leader"
                            | "navigator"
                            | "decorator"
                            | "reader"
                        )
                      }
                    >
                      {[
                        "reader",
                        "navigator",
                        "decorator",
                        ...(p.guest ? [] : ["leader"]),
                      ].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sb-note-card-actions">
            <button
              className="sb-note-button"
              onClick={() => {
                state.ui.chatView.value = "session";
                state.ui.chatOpen.value = true;
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                chat_bubble_outline
              </span>{" "}
              {t("open-chat", { defaultValue: "Open chat" })}
              {live.unread.value.length > 0
                ? ` (${live.unread.value.length})`
                : ""}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Copy one value; says Copied for a moment. */
function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="sb-note-button sb-session-copy"
      disabled={!text}
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => {})
      }
    >
      {done
        ? t("copied", { defaultValue: "Copied" })
        : t("copy", { defaultValue: "Copy" })}
    </button>
  );
}
