// WHO IS HERE, ON A PHONE — the old reader's MobileSessionParticipants: in the chapter's top bar of the session's
// tab, an overlapping stack of the first few people (host first, the host and co-hosts ringed) and "+N"; a tap opens
// a sheet listing everyone with their badge, with Session settings and Share session.
import { useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { colorOf } from "./PresenceGutter";

const MAX_STACK = 3;

function Face(props: { agent: string; name: string; self: boolean }) {
  return (
    <span
      className={`sb-tab-user-icon sb-tab-user-icon-animal${props.self ? " sb-tab-user-icon-self" : ""}`}
      title={props.name}
      style={{
        borderColor: colorOf(props.agent),
        backgroundColor: colorOf(props.agent),
      }}
    >
      <span className="material-symbols-outlined">person</span>
    </span>
  );
}

export function SessionPeopleStack({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const s = state.live.state.value;
  if (!s) return null;
  const me = state.live.me.value;
  const rank = (agent: string) =>
    s.host?.agent === agent ? 0 : (s.coHosts ?? []).includes(agent) ? 1 : 2;
  const people = s.participants
    .filter((p) => p.connections > 0)
    .sort((a, b) => rank(a.agent) - rank(b.agent));
  if (!people.length) return null;
  const stack = people.slice(0, MAX_STACK);
  const more = people.length - stack.length;
  const close = () => setOpen(false);
  const label = t("participants", { defaultValue: "Participants" });

  return (
    <>
      <button
        type="button"
        className="sb-session-participants-stack"
        aria-label={label}
        title={label}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {stack.map((p) => (
          <span
            key={p.agent}
            className={`sb-session-participants-stack-item${rank(p.agent) < 2 ? " sb-session-participants-stack-item-lead" : ""}`}
          >
            <Face agent={p.agent} name={p.name} self={p.agent === me} />
          </span>
        ))}
        {more > 0 && (
          <span className="sb-session-participants-stack-more">+{more}</span>
        )}
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="sb-mobile-settings-sheet-overlay"
              onClick={close}
              aria-hidden="true"
            />
            <div
              className="sb-mobile-settings-sheet sb-session-participants-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={label}
            >
              <div className="sb-mobile-settings-sheet-header">
                <div className="sb-mobile-settings-sheet-title">
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: 22 }}
                  >
                    group
                  </span>
                  <span>{label}</span>
                </div>
                <button
                  type="button"
                  className="sb-mobile-settings-sheet-close"
                  aria-label={t("close", { defaultValue: "Close" })}
                  onClick={close}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="sb-mobile-settings-sheet-body">
                <ul className="sb-session-participants-list">
                  {people.map((p) => {
                    const r = rank(p.agent);
                    const role =
                      r === 0
                        ? t("host", { defaultValue: "Host" })
                        : r === 1
                          ? t("co-host", { defaultValue: "Co-host" })
                          : null;
                    return (
                      <li
                        key={p.agent}
                        className="sb-session-participants-list-item"
                      >
                        <span className="sb-tab-user">
                          <Face
                            agent={p.agent}
                            name={p.name}
                            self={p.agent === me}
                          />
                          {role && (
                            <span
                              className={`sb-tab-user-role sb-tab-user-role-${r === 1 ? "cohost" : "host"}`}
                            >
                              {role}
                            </span>
                          )}
                        </span>
                        <span className="sb-session-participants-list-name">
                          {p.name}
                          {p.agent === me
                            ? ` (${t("you", { defaultValue: "you" })})`
                            : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="sb-mobile-settings-sheet-divider" />
              <button
                type="button"
                className="sb-session-participants-settings-button"
                onClick={() => {
                  close();
                  state.ui.sessionSettings.value = true;
                }}
              >
                <span
                  className="material-symbols-outlined sb-session-participants-settings-icon"
                  aria-hidden="true"
                >
                  settings
                </span>
                <span className="sb-session-participants-settings-label">
                  {t("session-settings", { defaultValue: "Session settings" })}
                </span>
                <span
                  className="material-symbols-outlined sb-session-participants-settings-chevron rtl-mirror"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
              <button
                type="button"
                className="sb-session-participants-share-button"
                onClick={() => {
                  close();
                  const url = state.live.shareLink.value;
                  if (url)
                    state.ui.share.value = {
                      title: t("share-session", {
                        defaultValue: "Share session",
                      }),
                      url,
                    };
                }}
              >
                <span
                  className="material-symbols-outlined sb-session-participants-share-icon"
                  aria-hidden="true"
                >
                  share
                </span>
                <span className="sb-session-participants-share-label">
                  {t("share-session", { defaultValue: "Share session" })}
                </span>
                <span
                  className="material-symbols-outlined sb-session-participants-share-chevron rtl-mirror"
                  aria-hidden="true"
                >
                  chevron_right
                </span>
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
