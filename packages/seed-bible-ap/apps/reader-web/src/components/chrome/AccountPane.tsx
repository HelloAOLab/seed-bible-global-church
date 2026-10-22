import { Avatar } from "./ConnectedChip";
import type { Connector, Org } from "../../backend/ReaderBackend";
// ACCOUNT — the Home sign-in (popup / redirect / quick connect / dev reader) from the hello page, now a side pane,
// plus where the reader's marks stand: on this device only, or in their Library through their own agent.
import { useEffect, useState } from "preact/hooks";
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

/** The reader's profile: a name, a line, a picture from the gallery; published to the public shelf for friends. */
function ProfileCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const p = state.profile.mine.value;
  const [name, setName] = useState(p?.displayName ?? "");
  const [about, setAbout] = useState(p?.about ?? "");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) {
      setName(p?.displayName ?? "");
      setAbout(p?.about ?? "");
    }
  }, [p?.displayName, p?.about]);
  const published = !!p && state.publishing.isPublished(p["@id"]);
  const canPublish = !!state.session.value?.wire;
  return (
    <div className="sb-account-card sb-profile-card">
      <p className="sb-small">
        <strong>{t("your-profile", { defaultValue: "Your profile" })}</strong>
      </p>
      <div className="sb-profile-row">
        {p?.picture ? (
          <img className="sb-profile-picture" src={p.picture} alt="" />
        ) : (
          <span className="sb-profile-picture sb-profile-picture-empty material-symbols-outlined">
            person
          </span>
        )}
        <label className="sb-note-button">
          {state.files.uploading.value
            ? "…"
            : t("profile-picture", { defaultValue: "Picture" })}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f)
                void state.files
                  .upload(f)
                  .then((img) => state.profile.save({ picture: img.url }))
                  .catch(() => {});
            }}
          />
        </label>
      </div>
      <form
        className="sb-item-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void state.profile
            .save({ displayName: name, about })
            .then(() => setDirty(false));
        }}
      >
        <input
          className="sb-note-editor"
          placeholder={t("profile-name", { defaultValue: "Display name" })}
          value={name}
          onInput={(e) => {
            setName((e.target as HTMLInputElement).value);
            setDirty(true);
          }}
        />
        <input
          className="sb-note-editor"
          placeholder={t("profile-about", { defaultValue: "A line about you" })}
          value={about}
          onInput={(e) => {
            setAbout((e.target as HTMLInputElement).value);
            setDirty(true);
          }}
        />
        <div className="sb-note-card-actions">
          <button
            type="submit"
            className="sb-note-button sb-note-button-primary"
            disabled={!dirty}
          >
            {t("save", { defaultValue: "Save" })}
          </button>
          {canPublish && p && (
            <button
              type="button"
              className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
              disabled={state.publishing.busy.value === p["@id"]}
              onClick={() =>
                void (
                  published
                    ? state.publishing.withdrawWork(p["@id"], "profile")
                    : state.publishing.publishProfile(p)
                ).catch(() => {})
              }
            >
              {published
                ? t("published", { defaultValue: "Published" })
                : t("publish", { defaultValue: "Publish" })}
            </button>
          )}
        </div>
      </form>
      <p className="sb-small sb-muted">
        {t("profile-note", {
          defaultValue:
            "Private until you publish it; published, your friends see the name, line and picture in their Today.",
        })}
      </p>
    </div>
  );
}

/** The MCP servers the reader attached at their Home — listed, never called from here (reads only, and at the Home). */
function ConnectorsCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const estate = estateById(DEFAULT_ESTATE)!;
  useEffect(() => {
    let live = true;
    state.backend
      .connectors()
      .then((c) => live && setRows(c))
      .catch(
        (e: unknown) =>
          live && setErr(e instanceof Error ? e.message : String(e))
      );
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="sb-account-card">
      <p className="sb-small">
        <strong>
          {t("connected-sources", { defaultValue: "Connected sources" })}
        </strong>
      </p>
      {err && <p className="sb-small sb-muted">{err}</p>}
      {rows === null && !err && (
        <p className="sb-small sb-muted">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="sb-small sb-muted">
          {t("connectors-none", {
            defaultValue: "No MCP servers are connected to your agent.",
          })}
        </p>
      )}
      {rows?.map((c) => (
        <div key={c.id} className="sb-connector">
          <div>
            <strong>{c.name}</strong>{" "}
            <span className="sb-small sb-muted">{c.server ?? c.url}</span>
          </div>
          <div className="sb-small sb-muted">
            {c.tools
              .filter((x) => x.kind === "read")
              .map((x) => x.name)
              .join(", ") ||
              t("connectors-no-reads", { defaultValue: "no reads" })}
            {c.tools.some((x) => x.kind !== "read")
              ? ` · ${t("connectors-acts-hidden", { count: c.tools.filter((x) => x.kind !== "read").length, defaultValue: `${c.tools.filter((x) => x.kind !== "read").length} act(s) not offered here` })}`
              : ""}
          </div>
        </div>
      ))}
      <p className="sb-small sb-muted">
        {t("connectors-note", {
          defaultValue:
            "Attached at your Home; this reader only lists them and never calls them.",
        })}{" "}
        <a href={`${estate.home}/apps`} target="_blank" rel="noreferrer">
          {t("manage-at-home", { defaultValue: "Manage at your Home" })}
        </a>
      </p>
    </div>
  );
}

/** Whom the reader publishes as: themselves, or a church they steward (the slice lands on the church's shelf). */
function PublishAsCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  useEffect(() => {
    let live = true;
    state.backend
      .orgs()
      .then((o) => live && setOrgs(o))
      .catch(() => live && setOrgs([]));
    return () => {
      live = false;
    };
  }, []);
  if (!orgs || !orgs.length) return null;
  const current = state.publishing.publishAs.value?.agent ?? "";
  return (
    <div className="sb-account-card">
      <label className="sb-small sb-account-row">
        <span>{t("publish-as", { defaultValue: "Publish as" })}</span>
        <select
          value={current}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            const org = orgs.find((o) => o.agent === v);
            void state.publishing.setPublishAs(
              org ? { agent: org.agent, name: org.name } : null
            );
          }}
        >
          <option value="">{t("publish-as-me", { defaultValue: "Me" })}</option>
          {orgs.map((o) => (
            <option key={o.agent} value={o.agent}>
              {o.name ?? o.agent}
            </option>
          ))}
        </select>
      </label>
      <p className="sb-small sb-muted">
        {t("publish-as-note", {
          defaultValue:
            "As a church you steward, what you publish — notes, playlists, plans, themes — lands on the church's shelf and reaches everyone who follows it.",
        })}
      </p>
    </div>
  );
}

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
          <div className="sb-account-who">
            <Avatar state={state} size="m" />
            <div className="sb-account-who-text">
              <strong>
                {state.profile.mine.value?.displayName || s.name || s.sub}
              </strong>
              <span className="sb-muted sb-small sb-account-sub" title={s.sub}>
                {s.sub.replace(/^eip155:\d+:/, "").slice(0, 10)}… ·{" "}
                {estate.label}
              </span>
            </div>
          </div>
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
                    "Your agent does not offer the reader's behaviour yet. Open your Home once — it gives your agent the behaviour by itself — then come back here: the reader retries on its own.",
                })}{" "}
                <a href={`${estate.home}/`} target="_blank" rel="noreferrer">
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
        <div className="sb-account-card sb-signin-card">
          <p className="sb-signin-title">
            {t("account-signin-title", {
              defaultValue: "Keep your marks in your Library",
            })}
          </p>
          <p className="sb-small sb-muted">
            {t("account-signin-blurb", {
              defaultValue:
                "Sign in with your Home. This page holds no key; your Home does the ceremony.",
            })}
          </p>
          <button
            className="sb-note-button sb-note-button-primary sb-signin-button"
            onClick={() => void onHome()}
            disabled={!HOME_SIGNIN_AVAILABLE}
          >
            {t("sign-in-with", {
              name: estate.label,
              defaultValue: `Sign in with ${estate.label}`,
            })}
          </button>
          <p className="sb-small sb-muted sb-signin-estate">
            {TOWN.label} · {estate.label} ·{" "}
            <a href={estate.home}>{estate.homeHost}</a>
          </p>
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
            <details>
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
            [
              "lineHeight",
              "Line height",
              [
                ["compact", "Compact"],
                ["normal", "Normal"],
                ["relaxed", "Relaxed"],
              ],
            ],
            [
              "margins",
              "Margins",
              [
                ["narrow", "Narrow"],
                ["normal", "Normal"],
                ["wide", "Wide"],
              ],
            ],
            [
              "uiScale",
              "Interface size",
              [
                ["s", "Small"],
                ["m", "Normal"],
                ["l", "Large"],
              ],
            ],
          ] as const
        ).map(([k, label, opts]) => (
          <label key={k} className="sb-small sb-account-row">
            <span>{t(`setting-${k}`, { defaultValue: label })}</span>
            <select
              value={state.settings[k].value}
              onChange={(e) =>
                ((state.settings[k] as { value: string }).value = (
                  e.target as HTMLSelectElement
                ).value)
              }
            >
              {opts.map(([v, name]) => (
                <option key={v} value={v}>
                  {t(`setting-${k}-${v}`, { defaultValue: name })}
                </option>
              ))}
            </select>
          </label>
        ))}
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

      {state.session.value && <ProfileCard state={state} />}
      {state.session.value && <PublishAsCard state={state} />}
      {state.session.value && <ConnectorsCard state={state} />}

      <div className="sb-account-card">
        <p className="sb-small">
          <strong>{t("listening", { defaultValue: "Listening" })}</strong>
        </p>
        <label className="sb-small sb-check">
          <input
            type="checkbox"
            checked={state.listening.autoContinue.value}
            onChange={(e) =>
              void state.listening.setAutoContinue(
                (e.target as HTMLInputElement).checked
              )
            }
          />{" "}
          {t("audio-auto-continue", {
            defaultValue:
              "When a chapter's recording ends, play the next chapter",
          })}
        </label>
        {state.audio.readers.value.length > 1 && (
          <label className="sb-small sb-account-row">
            <span>{t("audio-reader", { defaultValue: "Reader" })}</span>
            <select
              value={state.audio.reader.value ?? ""}
              onChange={(e) =>
                void state.listening.chooseReader(
                  (e.target as HTMLSelectElement).value
                )
              }
            >
              {state.audio.readers.value.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {state.session.value && (
        <div className="sb-account-card">
          <label className="sb-small sb-check">
            <input
              type="checkbox"
              checked={state.presence.share.value}
              onChange={(e) =>
                void state.presence.setShare(
                  (e.target as HTMLInputElement).checked
                )
              }
            />{" "}
            {t("presence-share", {
              defaultValue: "Let friends see what I am reading right now",
            })}
          </label>
          <p className="sb-small sb-muted">
            {t("presence-share-note", {
              defaultValue:
                "Only people who have added you back see it, and only while this tab is open; it fades by itself.",
            })}
          </p>
        </div>
      )}

      <div className="sb-account-card">
        <p className="sb-small">
          <strong>{t("extensions", { defaultValue: "Extensions" })}</strong>
        </p>
        {state.extensions.registered.value.map((ext) => (
          <label key={ext.id} className="sb-small sb-check">
            <input
              type="checkbox"
              checked={state.extensions.enabled.value.has(ext.id)}
              onChange={(e) =>
                void state.extensions.setEnabled(
                  ext.id,
                  (e.target as HTMLInputElement).checked
                )
              }
            />{" "}
            {ext.label}
            {ext.description ? (
              <span className="sb-muted"> — {ext.description}</span>
            ) : null}
            {state.extensions.errors.value[ext.id] ? (
              <span className="sb-pane-error">
                {" "}
                ({state.extensions.errors.value[ext.id]})
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </section>
  );
}
