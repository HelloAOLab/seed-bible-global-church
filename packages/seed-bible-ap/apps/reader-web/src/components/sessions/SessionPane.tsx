// THE SESSION PANE — start or join a live reading, who is here and where, the share link, roles (host), chat,
// and the end button. Participants and the room's decorations show in the reader; this is the roster and the chat.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function SessionPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const live = state.live;
  const signedIn = !!state.session.value;
  const [text, setText] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const s = live.state.value;

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [live.chat.value.length]);

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
              })}
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
              placeholder={t("session-id", { defaultValue: "Session id" })}
              value={joinId}
              onInput={(e) => setJoinId((e.target as HTMLInputElement).value)}
            />
            <input
              className="sb-note-editor"
              placeholder={t("session-code", { defaultValue: "Share code" })}
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
                  ? `${s.passage.bookId} ${s.passage.chapterNumber} · ${s.passage.translationId}`
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
            {live.shareLink.value && (
              <p className="sb-small">
                {t("session-share", { defaultValue: "Share code" })}{" "}
                <code>{live.code.value}</code>{" "}
                <button className="sb-note-button" onClick={() => void copy()}>
                  {copied
                    ? t("copied", { defaultValue: "Copied" })
                    : t("copy-link", { defaultValue: "Copy link" })}
                </button>
              </p>
            )}
            {live.recordRef.value && (
              <p className="sb-small sb-muted">
                {t("session-record-kept", {
                  defaultValue: "The record is in your Library:",
                })}{" "}
                {live.recordRef.value}
              </p>
            )}
            <div className="sb-note-card-actions">
              {live.isHost.value ? (
                <button
                  className="sb-note-button sb-note-button-danger"
                  onClick={() => void live.end()}
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
                      {where
                        ? ` · ${t("session-at-verse", { verse: where, defaultValue: `at verse ${where}` })}`
                        : ""}
                    </span>
                  </span>
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
                      {["reader", "navigator", "decorator", "leader"].map(
                        (r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        )
                      )}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sb-content-section">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">
                {t("session-chat", { defaultValue: "Chat" })}
              </h3>
            </div>
            <div className="sb-session-chat" ref={log}>
              {live.chat.value.map((m) => (
                <div
                  key={m.seq}
                  className={`sb-session-chat-line${m.by === live.me.value ? " sb-session-chat-mine" : ""}`}
                >
                  <span className="sb-session-chat-name">{m.name}</span>{" "}
                  <span className="sb-session-chat-text">{m.text}</span>
                </div>
              ))}
            </div>
            <form
              className="sb-session-say"
              onSubmit={(e) => {
                e.preventDefault();
                const v = text.trim();
                if (!v) return;
                void live.say(v);
                setText("");
              }}
            >
              <input
                className="sb-note-editor"
                value={text}
                placeholder={t("session-say", {
                  defaultValue: "Say something…",
                })}
                onInput={(e) => setText((e.target as HTMLInputElement).value)}
              />
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
                disabled={!text.trim()}
              >
                {t("send", { defaultValue: "Send" })}
              </button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
