// SESSION SETTINGS — the old reader's (packages/seed-bible components/Tabs: SessionSettingsModalContent and
// SessionCloseConfirmModalContent). The window shows the session's link and QR code, the host's settings (only the
// host navigates / highlights, how long a highlight stays, whose verse taps flare, one translation for everyone) and
// who is here, with Host and Co-host badges and Make co-host. Everyone sees the settings; the host and co-hosts change
// them. Ending as host asks first when others are here: end it for everyone, or hand it to someone to keep it going.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { SessionQRCode } from "./SessionQRCode";
import { colorOf } from "./PresenceGutter";

const CLOSE_CONFIRM_DISMISSED_KEY = "sb-session-close-confirm-dismissed";
const DURATIONS: Array<{ label: string; value: number | null }> = [
  { label: "∞", value: null },
  { label: "8s", value: 8 },
  { label: "16s", value: 16 },
  { label: "20s", value: 20 },
];

function closeConfirmDismissed(): boolean {
  try {
    return localStorage.getItem(CLOSE_CONFIRM_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Who the host can hand the session to: someone here now, with a Home (a guest cannot keep a session). */
function handOverCandidates(state: ReaderState) {
  const s = state.live.state.value;
  return (s?.participants ?? []).filter(
    (p) => p.agent !== state.live.me.value && !p.guest && p.connections > 0
  );
}

/** The host's End session: straight to ending when nobody could take over (or they asked not to be asked). */
export function requestEndSession(state: ReaderState) {
  if (handOverCandidates(state).length === 0 || closeConfirmDismissed())
    void state.live.end();
  else state.ui.sessionClose.value = true;
}

function useEsc(close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

function Window(props: {
  title: string;
  onClose: () => void;
  children: preact.ComponentChildren;
}) {
  const { t } = useI18n();
  useEsc(props.onClose);
  return (
    <div className="sb-footnote-modal-overlay" onClick={props.onClose}>
      <div
        className="sb-footnote-modal"
        role="dialog"
        aria-label={props.title}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{props.title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={props.onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">{props.children}</div>
      </div>
    </div>
  );
}

export function SessionSettingsWindow({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const live = state.live;
  const [copied, setCopied] = useState(false);
  const s = live.state.value;
  if (!state.ui.sessionSettings.value || !s || !live.active.value) return null;
  const close = () => (state.ui.sessionSettings.value = false);
  const settings = live.settings.value;
  const canChange = live.isHostLike.value;
  const url = live.shareLink.value;
  const set = (patch: Parameters<typeof live.setSettings>[0]) =>
    void live.setSettings(patch).catch(() => {});
  const roleRank = (agent: string) =>
    s.host?.agent === agent ? 0 : (s.coHosts ?? []).includes(agent) ? 1 : 2;
  const people = [...s.participants]
    .filter((p) => p.connections > 0 || p.agent === s.host?.agent)
    .sort((a, b) => roleRank(a.agent) - roleRank(b.agent));

  return (
    <Window
      title={t("session-settings", { defaultValue: "Session settings" })}
      onClose={close}
    >
      <div className="sb-session-settings">
        <div className="sb-session-settings-scroll">
          {url && (
            <>
              <div className="sb-session-settings-url">
                <span className="sb-session-settings-label">
                  {t("session-url", { defaultValue: "Session URL" })}
                </span>
                <div className="sb-session-settings-url-row">
                  <span className="sb-session-settings-url-value" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    className="sb-session-settings-copy-url"
                    aria-label={t("copy", { defaultValue: "Copy" })}
                    title={
                      copied
                        ? t("copied", { defaultValue: "Copied" })
                        : t("copy", { defaultValue: "Copy" })
                    }
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(url)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        })
                        .catch(() => {})
                    }
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      {copied ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>
              <SessionQRCode url={url} />
            </>
          )}

          {!canChange && (
            <p className="sb-session-settings-note">
              {t("session-settings-host-only_note", {
                defaultValue:
                  "Only the session host can change these settings.",
              })}
            </p>
          )}

          <div className="sb-session-settings-section">
            <div className="sb-session-settings-section-title">
              {t("session-settings-section-navigation", {
                defaultValue: "Navigation",
              })}
            </div>
            <div className="sb-session-settings-row">
              <label
                className="sb-session-settings-label"
                htmlFor="sb-session-only-host-navigate"
              >
                {t("session-settings-host-only_navigate", {
                  defaultValue: "Only host can navigate",
                })}
              </label>
              <input
                id="sb-session-only-host-navigate"
                type="checkbox"
                checked={settings.hostOnlyNavigate}
                disabled={!canChange}
                onChange={(e) =>
                  set({
                    hostOnlyNavigate: (e.currentTarget as HTMLInputElement)
                      .checked,
                  })
                }
              />
            </div>
            <p className="sb-session-settings-description">
              {settings.hostOnlyNavigate
                ? t("session-settings-navigate-desc_host", {
                    defaultValue:
                      "Only the host can change the passage for everyone.",
                  })
                : t("session-settings-navigate-desc_all", {
                    defaultValue:
                      "Everyone in the session can change the passage.",
                  })}
            </p>

            <div className="sb-session-settings-row">
              <label
                className="sb-session-settings-label"
                htmlFor="sb-session-only-host-highlight"
              >
                {t("session-settings-host-only_highlight", {
                  defaultValue: "Only host can highlight",
                })}
              </label>
              <input
                id="sb-session-only-host-highlight"
                type="checkbox"
                checked={settings.hostOnlyHighlight}
                disabled={!canChange}
                onChange={(e) =>
                  set({
                    hostOnlyHighlight: (e.currentTarget as HTMLInputElement)
                      .checked,
                  })
                }
              />
            </div>
            <p className="sb-session-settings-description">
              {settings.hostOnlyHighlight
                ? t("session-settings-highlight-desc_host", {
                    defaultValue: "Only the host can highlight for everyone.",
                  })
                : t("session-settings-highlight-desc_all", {
                    defaultValue: "Everyone in the session can highlight.",
                  })}
            </p>

            <div className="sb-session-settings-duration">
              <div className="sb-session-settings-duration-title">
                {t("session-settings-highlight-duration", {
                  defaultValue: "Highlight for",
                })}
              </div>
              <div
                className="sb-session-settings-duration-options"
                role="radiogroup"
              >
                {DURATIONS.map((d) => {
                  const on = settings.highlightSeconds === d.value;
                  return (
                    <button
                      key={d.label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`sb-session-settings-duration-option${on ? " sb-session-settings-duration-option-selected" : ""}`}
                      disabled={!canChange}
                      onClick={() => set({ highlightSeconds: d.value })}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sb-session-settings-section">
              <div className="sb-session-settings-label">
                {t("session-settings-verse-effects", {
                  defaultValue: "Verse selection effects",
                })}
              </div>
              <div
                className="sb-session-settings-duration-options"
                role="group"
                aria-label={t("session-settings-verse-effects", {
                  defaultValue: "Verse selection effects",
                })}
              >
                {(["hosts-only", "everyone", "none"] as const).map((v) => {
                  const on = settings.selectionEffects === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      disabled={!canChange}
                      className={`sb-session-settings-duration-option${on ? " sb-session-settings-duration-option-selected" : ""}`}
                      onClick={() => set({ selectionEffects: v })}
                    >
                      {v === "hosts-only"
                        ? t("session-settings-verse-effects-hosts-only", {
                            defaultValue: "Hosts only",
                          })
                        : v === "everyone"
                          ? t("session-settings-verse-effects-everyone", {
                              defaultValue: "Everyone",
                            })
                          : t("session-settings-verse-effects-none", {
                              defaultValue: "None",
                            })}
                    </button>
                  );
                })}
              </div>
              <p className="sb-session-settings-description">
                {settings.selectionEffects === "hosts-only"
                  ? t("session-settings-verse-effects-desc-hosts", {
                      defaultValue: "Show effects when a host selects a verse.",
                    })
                  : settings.selectionEffects === "everyone"
                    ? t("session-settings-verse-effects-desc-everyone", {
                        defaultValue:
                          "Show effects when anyone selects a verse.",
                      })
                    : t("session-settings-verse-effects-desc-none", {
                        defaultValue:
                          "Verse selection effects are turned off for everyone.",
                      })}
              </p>
            </div>
          </div>

          <div className="sb-session-settings-section">
            <div className="sb-session-settings-section-title">
              {t("session-settings-section-sharing", {
                defaultValue: "Sharing",
              })}
            </div>
            <div className="sb-session-settings-row">
              <label
                className="sb-session-settings-label"
                htmlFor="sb-session-share-translation"
              >
                {t("session-settings-share-translation", {
                  defaultValue: "Share translation",
                })}
              </label>
              <input
                id="sb-session-share-translation"
                type="checkbox"
                checked={settings.shareTranslation}
                disabled={!canChange}
                onChange={(e) =>
                  set({
                    shareTranslation: (e.currentTarget as HTMLInputElement)
                      .checked,
                  })
                }
              />
            </div>
            <p className="sb-session-settings-description">
              {settings.shareTranslation
                ? t("session-settings-share-translation-desc_shared", {
                    defaultValue:
                      "Everyone reads the same translation. Changing it updates it for everyone.",
                  })
                : t("session-settings-share-translation-desc_unique", {
                    defaultValue:
                      "Each person keeps their own translation. Changing yours won't affect others.",
                  })}
            </p>
          </div>

          <div className="sb-session-settings-section">
            <div className="sb-session-settings-section-title">
              {t("session-settings-section-participants", {
                defaultValue: "Participants",
              })}
            </div>
            <ul className="sb-session-participants">
              {people.map((p) => {
                const host = s.host?.agent === p.agent;
                const coHost = !host && (s.coHosts ?? []).includes(p.agent);
                return (
                  <li key={p.agent} className="sb-session-participant">
                    <span
                      className="sb-session-participant-avatar"
                      style={{ backgroundColor: colorOf(p.agent) }}
                      aria-hidden="true"
                    >
                      <span className="material-symbols-outlined">person</span>
                    </span>
                    <span
                      className="sb-session-participant-name"
                      title={p.name}
                    >
                      {p.name}
                      {p.agent === live.me.value
                        ? ` (${t("you", { defaultValue: "you" })})`
                        : ""}
                      {host && (
                        <span className="sb-session-participant-badge">
                          {t("host", { defaultValue: "Host" })}
                        </span>
                      )}
                      {coHost && (
                        <span className="sb-session-participant-badge">
                          {t("co-host", { defaultValue: "Co-host" })}
                        </span>
                      )}
                    </span>
                    {canChange && !host && !p.guest && (
                      <button
                        type="button"
                        className={`sb-session-participant-action${coHost ? " sb-session-participant-action-active" : ""}`}
                        onClick={() =>
                          void live.setCoHost(p.agent, !coHost).catch(() => {})
                        }
                      >
                        {coHost
                          ? t("remove-co-host", {
                              defaultValue: "Remove co-host",
                            })
                          : t("make-co-host", { defaultValue: "Make co-host" })}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="sb-session-settings-actions">
          {live.isHost.value ? (
            <button
              type="button"
              className="sb-session-settings-end"
              onClick={() => {
                close();
                requestEndSession(state);
              }}
            >
              {t("end-session", { defaultValue: "End Session" })}
            </button>
          ) : (
            <button
              type="button"
              className="sb-session-settings-end"
              onClick={() => {
                close();
                live.leave();
              }}
            >
              {t("session-leave", { defaultValue: "Leave" })}
            </button>
          )}
          <button
            type="button"
            className="sb-session-settings-cancel"
            onClick={close}
          >
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>
    </Window>
  );
}

export function SessionCloseConfirm({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  if (!state.ui.sessionClose.value || !state.live.active.value) return null;
  const close = () => (state.ui.sessionClose.value = false);
  const remember = () => {
    if (!dontAsk) return;
    try {
      localStorage.setItem(CLOSE_CONFIRM_DISMISSED_KEY, "true");
    } catch {
      // Storage blocked: it asks again next time.
    }
  };
  const candidates = handOverCandidates(state);
  return (
    <Window
      title={t("session-end-title", { defaultValue: "End the session?" })}
      onClose={close}
    >
      <div className="sb-session-close-confirm">
        <p className="sb-session-close-confirm-message">
          {t("session-close-confirm-message", {
            defaultValue: "Closing this will end the session for everyone.",
          })}
        </p>
        {picking ? (
          <div className="sb-session-cohost-picker">
            <div className="sb-session-cohost-instructions">
              {t("appoint-co-host-instructions", {
                defaultValue: "Choose someone to keep the session running:",
              })}
            </div>
            {candidates.map((p) => (
              <button
                key={p.agent}
                type="button"
                className="sb-session-cohost-option"
                onClick={() => {
                  remember();
                  close();
                  void state.live.handOver(p.agent).catch(() => {});
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <>
            <label className="sb-session-close-confirm-dontshow">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) =>
                  setDontAsk((e.currentTarget as HTMLInputElement).checked)
                }
              />
              <span>
                {t("dont-show-again", {
                  defaultValue: "Don't show this again",
                })}
              </span>
            </label>
            <div className="sb-session-close-confirm-actions">
              <button
                type="button"
                className="sb-session-settings-cancel"
                onClick={() => setPicking(true)}
              >
                {t("appoint-co-host", { defaultValue: "Appoint a co-host" })}
              </button>
              <button
                type="button"
                className="sb-session-settings-end"
                onClick={() => {
                  remember();
                  close();
                  void state.live.end();
                }}
              >
                {t("end-session-for-everyone", {
                  defaultValue: "End session",
                })}
              </button>
            </div>
          </>
        )}
      </div>
    </Window>
  );
}
