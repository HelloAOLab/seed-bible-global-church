// ACCOUNT — the Home sign-in (popup / redirect / quick connect / dev reader) from the hello page, now a side pane,
// plus where the reader's marks stand: on this device only, or in their Library through their own agent.
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import type { QuickConnectIdentity } from "@agenticprimitives/connect-client";
import type { ReaderState } from "../../state";
import { useI18n, AVAILABLE_LANGUAGES, setLanguage } from "../../i18n";
import { listDevReaders, type DevReader } from "../../api";
import {
  DEFAULT_ESTATE,
  DEV_READER_AVAILABLE,
  HOME_SIGNIN_AVAILABLE,
  CLIENT_ID,
  connectAsSamplePerson,
  connectViaHome,
  listSamplePeople,
  signInAsDevReader,
} from "../../session";
import { TOWN, estateById } from "../../../../../estate/faithnet";

const progress = signal("");
const samplePeople = signal<QuickConnectIdentity[]>([]);
const devReaders = signal<DevReader[]>([]);
const error = signal("");

export function AccountPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const s = state.session.value;
  const estate = estateById(DEFAULT_ESTATE)!;
  const report = (e: unknown) =>
    (error.value = e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (s) return;
    listSamplePeople(DEFAULT_ESTATE).then((p) => (samplePeople.value = p));
    if (DEV_READER_AVAILABLE)
      listDevReaders().then((r) => (devReaders.value = r));
  }, [s]);

  const onHome = async () => {
    error.value = "";
    try {
      const out = await connectViaHome(
        DEFAULT_ESTATE,
        (m) => (progress.value = m)
      );
      if (out) await state.signIn(out);
    } catch (e) {
      report(e);
    } finally {
      progress.value = "";
    }
  };

  const pending = state.outbox.pending.value;

  return (
    <section
      className="sb-pane sb-account-pane"
      aria-label={t("account-settings", { defaultValue: "Account settings" })}
    >
      <header className="sb-pane-header">
        <h2>{t("account-settings", { defaultValue: "Account settings" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      {error.value && <p className="sb-pane-error">{error.value}</p>}

      {s ? (
        <div className="sb-account-card">
          <p>
            <strong>{s.name || s.sub}</strong>
            <br />
            <span className="sb-muted sb-small">{s.sub}</span>
          </p>
          <p className="sb-small">
            {s.wire
              ? t("account-wire-held", {
                  defaultValue:
                    "Your highlights, notes and bookmarks go to your Library through your own agent.",
                })
              : (s.wireNote ??
                t("account-no-wire", {
                  defaultValue: "No wire: your marks stay on this device.",
                }))}
          </p>
          <p className="sb-small sb-muted">
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
            {state.outbox.lastError.value && (
              <> · {state.outbox.lastError.value}</>
            )}
          </p>
          {state.outbox.lastError.value &&
            /does not offer|playbook|assign|archetype/i.test(
              state.outbox.lastError.value
            ) && (
              <p className="sb-small">
                {t("first-run-playbook", {
                  defaultValue:
                    "Your agent has not been given the Seed Bible reader behaviour yet. Assign it at your Home, then tap Sync now.",
                })}{" "}
                <a href={`${estate.home}/you`} target="_blank" rel="noreferrer">
                  {t("open-home", { defaultValue: "Open your Home" })}
                </a>
              </p>
            )}
          <div className="sb-note-card-actions">
            {pending > 0 && (
              <button
                className="sb-note-button"
                onClick={() => void state.outbox.flush()}
              >
                {t("sync-now", { defaultValue: "Sync now" })}
              </button>
            )}
            <button
              className="sb-note-button"
              onClick={() => void state.signOut()}
            >
              {t("sign-out", { defaultValue: "Sign out" })}
            </button>
          </div>
        </div>
      ) : (
        <div className="sb-account-card">
          <p className="sb-small sb-muted">
            {TOWN.label} · {estate.label} ·{" "}
            <a href={estate.home}>{estate.homeHost}</a>
          </p>
          <p className="sb-small">
            {t("account-signin-blurb", {
              defaultValue:
                "Sign in with your Home to keep your marks in your Library. This page holds no key; your Home does the ceremony.",
            })}
          </p>
          <button
            className="sb-note-button sb-note-button-primary"
            onClick={() => void onHome()}
            disabled={!HOME_SIGNIN_AVAILABLE}
          >
            {t("sign-in-with", {
              name: estate.label,
              defaultValue: `Sign in with ${estate.label}`,
            })}
          </button>
          {!HOME_SIGNIN_AVAILABLE && (
            <p className="sb-small sb-muted">
              Not registered yet: the Home needs the client{" "}
              <code>{CLIENT_ID}</code> with this origin (set{" "}
              <code>VITE_CONNECT_DELEGATE</code>).
            </p>
          )}
          {progress.value && (
            <p className="sb-small sb-muted">{progress.value}</p>
          )}
          {samplePeople.value.length > 0 && (
            <details open>
              <summary>
                {t("try-sample-people", {
                  defaultValue: "Or try it as one of the Home's sample people",
                })}
              </summary>
              <ul className="sb-people">
                {samplePeople.value.map((p) => (
                  <li key={p.handle}>
                    <button
                      className="sb-note-button"
                      onClick={() => {
                        error.value = "";
                        connectAsSamplePerson(DEFAULT_ESTATE, p.handle).then(
                          (out) => state.signIn(out),
                          report
                        );
                      }}
                    >
                      {p.name}
                    </button>
                    <span className="sb-muted sb-small"> {p.blurb}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {devReaders.value.length > 0 && (
            <details open>
              <summary>Local dev: the seed demo reader</summary>
              <ul className="sb-people">
                {devReaders.value.map((r) => (
                  <li key={r.handle}>
                    <button
                      className="sb-note-button"
                      onClick={() =>
                        void state.signIn(
                          signInAsDevReader(r.handle, r.name, r.sa)
                        )
                      }
                    >
                      {r.name}
                    </button>
                    <span className="sb-muted sb-small">
                      {" "}
                      dev reader · {r.sa}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="sb-account-card">
        <label className="sb-small">
          {t("church-theme", { defaultValue: "Church theme" })}{" "}
          <select
            value={state.customizations.selected.value?.descriptorId ?? ""}
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value;
              const entry =
                state.customizations.available.value.find(
                  (a) => a.offering.descriptorId === id
                ) ?? null;
              void state.customizations.select(entry);
            }}
          >
            <option value="">
              {t("church-theme-none", { defaultValue: "None (Seed Bible)" })}
            </option>
            {state.customizations.available.value.map((a) => (
              <option
                key={a.offering.descriptorId}
                value={a.offering.descriptorId}
              >
                {a.customization.label} · {a.offering.shelf}
              </option>
            ))}
            {state.customizations.selected.value &&
              !state.customizations.available.value.some(
                (a) =>
                  a.offering.descriptorId ===
                  state.customizations.selected.value?.descriptorId
              ) && (
                <option
                  value={state.customizations.selected.value.descriptorId}
                >
                  {state.customizations.selected.value.label}
                </option>
              )}
          </select>{" "}
          <button
            type="button"
            className="sb-pane-close"
            aria-label={t("refresh", { defaultValue: "Refresh" })}
            onClick={() => void state.customizations.refresh()}
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
        </label>
        <label className="sb-small">
          {t("language", { defaultValue: "Language" })}{" "}
          <select
            value={language}
            onChange={(e) =>
              void setLanguage((e.target as HTMLSelectElement).value)
            }
          >
            {AVAILABLE_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="sb-small">
          {t("scripture-settings-font-size-example", { defaultValue: "A" })}{" "}
          <select
            value={state.settings.fontSize.value}
            onChange={(e) =>
              (state.settings.fontSize.value = (e.target as HTMLSelectElement)
                .value as "xs" | "s" | "m" | "l" | "xl")
            }
          >
            {["xs", "s", "m", "l", "xl"].map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["showVerseNumbers", "Verse numbers"],
            ["showHeadings", "Headings"],
            ["showFootnotes", "Footnotes"],
            ["showRedLettering", "Words of Jesus in red"],
            ["showHighlights", "Highlights"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="sb-small sb-check">
            <input
              type="checkbox"
              checked={state.settings.scripture.value[k]}
              onChange={(e) =>
                (state.settings.scripture.value = {
                  ...state.settings.scripture.value,
                  [k]: (e.target as HTMLInputElement).checked,
                })
              }
            />{" "}
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}
