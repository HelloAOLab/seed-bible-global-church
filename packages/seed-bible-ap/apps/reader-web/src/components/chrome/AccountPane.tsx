import { Avatar } from "./ConnectedChip";
import { ThemeThumbnail } from "./ThemePreview";
import { DARK_THEME, LIGHT_THEME } from "../../state/chrome/theme";
import { themeFromVariant } from "../../state/chrome/customizations";
import {
  TEXT_FONTS,
  TEXT_SECTIONS,
  type SectionStyle,
  type TextSection,
  type TextStyle,
} from "../../state/chrome/textStyle";
import { PictureField } from "../library/PictureField";
import { PROFILE_PICTURE } from "../../state/library/crop";
import { toolbarActions } from "../reader/ReaderToolbar";
import { ordered } from "../../state/chrome/toolbarLayout";
import { wakeLockSupported } from "../../state/chrome/wakeLock";
import type { Connector, Org } from "../../backend/ReaderBackend";
// ACCOUNT — the Home sign-in (popup / redirect / quick connect / dev reader) from the hello page, now a side pane,
// plus where the reader's marks stand: on this device only, or in their Library through their own agent.
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import type { QuickConnectIdentity } from "@agenticprimitives/connect-client";
import { NEEDS_HOME, type ReaderState } from "../../state";
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
import type {
  BookOrder,
  FontSize,
  SelectionEffects,
} from "../../state/chrome/settings";

const progress = signal("");
const samplePeople = signal<QuickConnectIdentity[]>([]);
const devReaders = signal<DevReader[]>([]);
const error = signal("");

/** What to do when the person's agent refuses one of the reader's acts because its playbook predates it (the Home
 *  gives the agent the missing behaviour the next time it is opened): said in words, with the way there. */
export function NeedsHomeHint({ error }: { error: string | null | undefined }) {
  const { t } = useI18n();
  if (!error || !NEEDS_HOME.test(error)) return null;
  return (
    <p className="sb-small sb-needs-home">
      {t("first-run-playbook", {
        defaultValue:
          "Your agent does not offer the reader's behaviour yet. Open your Home once — it gives your agent the behaviour by itself — then come back here: the reader retries on its own.",
      })}{" "}
      <a
        href={`${estateById(DEFAULT_ESTATE)!.home}/`}
        target="_blank"
        rel="noreferrer"
      >
        {t("open-home", { defaultValue: "Open your Home" })}
      </a>
    </p>
  );
}

/** The reader's profile: a name, a line, a picture from the gallery; published to the public shelf for friends. */
export function ProfileCard({ state }: { state: ReaderState }) {
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
  // What became of the last save: the device copy is at once, the Library's takes a few seconds (or fails).
  const [status, setStatus] = useState<"saving" | "saved" | "failed" | null>(
    null
  );
  const save = async (patch: Parameters<typeof state.profile.save>[0]) => {
    setStatus("saving");
    await state.profile.save(patch);
    const failed = !!state.profile.error.value;
    setStatus(failed ? "failed" : "saved");
    if (!failed)
      setTimeout(() => setStatus((s) => (s === "saved" ? null : s)), 4000);
    return !failed;
  };
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
        <PictureField
          state={state}
          target={PROFILE_PICTURE}
          label={t("profile-picture", { defaultValue: "Picture" })}
          cropTitle={t("crop-your-photo", { defaultValue: "Crop your photo" })}
          onPicked={(url) => save({ picture: url })}
        />
      </div>
      <form
        className="sb-item-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ displayName: name, about }).then(
            (ok) => ok && setDirty(false)
          );
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
        {/* The old reader's Description: up to 300 characters, counted. */}
        <textarea
          className="sb-note-editor"
          rows={3}
          maxLength={300}
          aria-label={t("profile-description", { defaultValue: "Description" })}
          placeholder={t("profile-about", { defaultValue: "A line about you" })}
          value={about}
          onInput={(e) => {
            setAbout((e.target as HTMLTextAreaElement).value);
            setDirty(true);
          }}
        />
        <span className="sb-small sb-muted sb-profile-about-count">
          {t("characters-of", {
            count: about.length,
            max: 300,
            defaultValue: "{{count}}/{{max}}",
          })}
        </span>
        <div className="sb-note-card-actions">
          <button
            type="submit"
            className="sb-note-button sb-note-button-primary"
            // After a failed send, Save tries again even with nothing changed.
            disabled={(!dirty && status !== "failed") || status === "saving"}
          >
            {status === "saving"
              ? t("saving", { defaultValue: "Saving…" })
              : t("save", { defaultValue: "Save" })}
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
      <p
        className={`sb-small${status === "failed" || state.publishing.error.value ? " sb-pane-error" : " sb-muted"}`}
        role="status"
      >
        {status === "saving" &&
          (state.session.value
            ? t("profile-saving", {
                defaultValue: "Saving to your Library…",
              })
            : t("saving", { defaultValue: "Saving…" }))}
        {status === "saved" &&
          (state.session.value
            ? t("profile-saved", {
                defaultValue: "✓ Saved to your Library",
              })
            : t("profile-saved-device", {
                defaultValue:
                  "✓ Saved on this device — sign in to keep it in your Library",
              }))}
        {state.publishing.busy.value === p?.["@id"] &&
          t("profile-publishing", {
            defaultValue: "Publishing to your shelf…",
          })}
        {state.publishing.error.value &&
          state.publishing.busy.value === null &&
          t("profile-publish-failed", {
            defaultValue: "Not published: {{reason}}",
            reason: state.publishing.error.value,
          })}
        {status === "failed" &&
          (NEEDS_HOME.test(state.profile.error.value ?? "")
            ? t("profile-save-needs-home", {
                defaultValue:
                  "Saved on this device, but not yet in your Library.",
              })
            : t("profile-save-failed", {
                defaultValue:
                  "Saved on this device, but not yet in your Library: {{reason}} Tap Save to try again.",
                reason: state.profile.error.value ?? "",
              }))}
      </p>
      {status === "failed" && (
        <NeedsHomeHint error={state.profile.error.value} />
      )}
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
export function ConnectorsCard({ state }: { state: ReaderState }) {
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
export function PublishAsCard({ state }: { state: ReaderState }) {
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
        <strong>{t("publish-as", { defaultValue: "Publish as" })}</strong>
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

/** Account → Toolbar: which buttons sit in the bottom toolbar (the rest are under More), and in what order (the old
 *  toolbar customizer). */
export function TextStyleCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const style = state.settings.textStyle.value;
  const set = (s: TextSection, patch: SectionStyle) => {
    const next: SectionStyle = { ...style[s], ...patch };
    for (const k of Object.keys(next) as Array<keyof SectionStyle>)
      if (next[k] === undefined || next[k] === false || next[k] === "")
        delete next[k];
    const all: TextStyle = { ...style, [s]: next };
    if (!Object.keys(next).length) delete all[s];
    state.settings.textStyle.value = all;
  };
  const sectionName = (s: TextSection) =>
    s === "bookTitle"
      ? t("text-section-bookTitle", { defaultValue: "Book title" })
      : s === "heading"
        ? t("text-section-heading", { defaultValue: "Headings" })
        : t("text-section-verse", { defaultValue: "Verses" });
  return (
    <div className="sb-account-card sb-text-style-card">
      <p className="sb-small">
        <strong>{t("text-style", { defaultValue: "Text" })}</strong>{" "}
        <span className="sb-muted">
          {t("text-style-hint", {
            defaultValue: "The font of the book title, headings and verses.",
          })}
        </span>
      </p>
      {TEXT_SECTIONS.map((s) => {
        const v = style[s] ?? {};
        const name = sectionName(s);
        return (
          <div key={s} className="sb-text-style-row">
            <span className="sb-small sb-text-style-name">{name}</span>
            <select
              className="sb-note-editor"
              aria-label={t("text-font-of", {
                defaultValue: "Font of {{what}}",
                what: name,
              })}
              value={v.font ?? ""}
              onChange={(e) =>
                set(s, {
                  font: (e.target as HTMLSelectElement).value || undefined,
                })
              }
            >
              <option value="">
                {t("text-font-default", { defaultValue: "Default" })}
              </option>
              {TEXT_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="sb-note-editor"
              aria-label={t("text-weight-of", {
                defaultValue: "Weight of {{what}}",
                what: name,
              })}
              value={v.weight ?? ""}
              onChange={(e) =>
                set(s, {
                  weight:
                    ((e.target as HTMLSelectElement)
                      .value as SectionStyle["weight"]) || undefined,
                })
              }
            >
              <option value="">
                {t("text-font-default", { defaultValue: "Default" })}
              </option>
              <option value="700">{t("bold", { defaultValue: "bold" })}</option>
              <option value="400">
                {t("regular", { defaultValue: "regular" })}
              </option>
              <option value="300">
                {t("light", { defaultValue: "light" })}
              </option>
            </select>
            <label className="sb-small sb-check">
              <input
                type="checkbox"
                checked={v.italic === true}
                onChange={(e) =>
                  set(s, { italic: (e.target as HTMLInputElement).checked })
                }
              />{" "}
              {t("italic", { defaultValue: "Italic" })}
            </label>
          </div>
        );
      })}
      <div className="sb-note-card-actions">
        <button
          className="sb-note-button"
          disabled={!Object.keys(style).length}
          onClick={() => (state.settings.textStyle.value = {})}
        >
          {t("toolbar-reset", { defaultValue: "Reset" })}
        </button>
      </div>
    </div>
  );
}

export function ToolbarCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const actions = toolbarActions(state, t, {
    togglePane: () => undefined,
    dark: state.settings.resolvedTheme().id === "dark",
    notes: 0,
  });
  const ids = actions.map((a) => a.id);
  const layout = state.toolbar.layout.value;
  const list = ordered(ids, layout);
  return (
    <div className="sb-account-card sb-toolbar-card">
      <p className="sb-small">
        <strong>{t("toolbar-customize", { defaultValue: "Toolbar" })}</strong>{" "}
        <span className="sb-muted">
          {t("toolbar-customize-hint", {
            defaultValue:
              "Choose which tools sit in the toolbar, and their order. The others are under More.",
          })}
        </span>
      </p>
      <ul className="sb-toolbar-list">
        {list.map((id, i) => {
          const a = actions.find((x) => x.id === id)!;
          return (
            <li key={id} className="sb-toolbar-list-row">
              <label className="sb-small sb-check">
                <input
                  type="checkbox"
                  checked={!layout.hidden.includes(id)}
                  onChange={(e) =>
                    state.toolbar.setHidden(
                      id,
                      !(e.target as HTMLInputElement).checked
                    )
                  }
                />{" "}
                <span className="material-symbols-outlined" aria-hidden="true">
                  {a.icon}
                </span>{" "}
                {a.label}
              </label>
              <button
                type="button"
                className="sb-pane-close"
                aria-label={
                  t("move-up", { defaultValue: "Move up" }) + ` ${a.label}`
                }
                disabled={i === 0}
                onClick={() => state.toolbar.move(ids, id, -1)}
              >
                <span className="material-symbols-outlined">arrow_upward</span>
              </button>
              <button
                type="button"
                className="sb-pane-close"
                aria-label={
                  t("move-down", { defaultValue: "Move down" }) + ` ${a.label}`
                }
                disabled={i === list.length - 1}
                onClick={() => state.toolbar.move(ids, id, 1)}
              >
                <span className="material-symbols-outlined">
                  arrow_downward
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="sb-note-button"
        onClick={() => state.toolbar.reset()}
      >
        {t("toolbar-reset", { defaultValue: "Reset" })}
      </button>
    </div>
  );
}

/** Account settings: signing in (the Home, the sample people), or who is signed in, where the marks stand, sync and sign out. */
export function AccountCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
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

  // The old reader's sign-in asks for the terms first; a lapsed sign-in being renewed already agreed.
  const [agreed, setAgreed] = useState(false);
  const needAgreement = () => {
    if (s || agreed) return false;
    error.value = t("login-error-terms-required", {
      defaultValue: "Please agree to the terms of service to continue.",
    });
    return true;
  };
  const openPolicy = (
    p: "terms-of-service" | "privacy-policy" | "code-of-conduct"
  ) => {
    state.ui.policy.value = p;
    state.ui.pane.value = "about";
  };
  const onHome = async () => {
    if (needAgreement()) return;
    error.value = "";
    try {
      const out = await connectViaHome(
        DEFAULT_ESTATE,
        (m) => (progress.value = m)
      );
      if (out) await state.signIn(out, { announce: true });
    } catch (e) {
      report(e);
    } finally {
      progress.value = "";
    }
  };

  const pending = state.outbox.pending.value;
  return (
    <>
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
          {/* The old reader's "Your ID is:" with Copy: the whole address, for a friend to add you by. */}
          <p className="sb-small sb-account-id">
            {t("your-id-is", { defaultValue: "Your ID is:" })}{" "}
            <code className="sb-account-id-value">
              {s.sub.replace(/^eip155:\d+:/, "")}
            </code>{" "}
            <button
              type="button"
              className="sb-note-button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(s.sub.replace(/^eip155:\d+:/, ""))
                  .then(() => (state.ui.toast.value = { key: "copied" }))
                  .catch(() => undefined)
              }
            >
              {t("copy", { defaultValue: "Copy" })}
            </button>
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
          {state.sessionTrouble.value && (
            <p className="sb-small sb-pane-error">
              {state.sessionTrouble.value === "expired"
                ? t("session-expired", {
                    defaultValue:
                      "Your sign-in has lapsed. Your marks are safe on this device; sign in again and they go to your Library.",
                  })
                : t("wire-lapsed", {
                    defaultValue:
                      "Your agent no longer accepts the reader's permission. Sign in again to grant it; nothing on this device is lost.",
                  })}{" "}
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() => void onHome()}
                disabled={!HOME_SIGNIN_AVAILABLE}
              >
                {t("connect-again", { defaultValue: "Sign in again" })}
              </button>
            </p>
          )}
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
          <NeedsHomeHint error={state.outbox.lastError.value} />
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
          <label className="sb-login-terms" htmlFor="sb-login-terms">
            <input
              id="sb-login-terms"
              className="sb-login-terms-checkbox"
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed((e.currentTarget as HTMLInputElement).checked);
                error.value = "";
              }}
            />
            <span className="sb-login-terms-text">
              {t("login-agree-prefix", { defaultValue: "I agree to the" })}{" "}
              <a
                className="sb-login-link"
                href="?terms=open"
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPolicy("terms-of-service");
                }}
              >
                {t("terms-of-service", { defaultValue: "Terms of service" })}
              </a>
            </span>
          </label>
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
          <div className="sb-login-legal">
            <a
              className="sb-login-link"
              href="?privacy=open"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                openPolicy("privacy-policy");
              }}
            >
              {t("privacy-policy", { defaultValue: "Privacy policy" })}
            </a>
            <a
              className="sb-login-link"
              href="?conduct=open"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                openPolicy("code-of-conduct");
              }}
            >
              {t("code-of-conduct", { defaultValue: "Code of conduct" })}
            </a>
            <a
              className="sb-login-link"
              href="?terms=open"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                openPolicy("terms-of-service");
              }}
            >
              {t("terms-of-service", { defaultValue: "Terms of service" })}
            </a>
          </div>
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
                        if (needAgreement()) return;
                        error.value = "";
                        connectAsSamplePerson(DEFAULT_ESTATE, p.handle).then(
                          (out) => state.signIn(out, { announce: true }),
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
                          signInAsDevReader(r.handle, r.name, r.sa),
                          { announce: true }
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
    </>
  );
}

/** Customize: the church theme and its variant. */
export function ChurchThemeFields({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  // The Church theme list is the registry's: read it again whenever this opens, so a theme published a moment ago
  // (yours or anyone's) is there to pick without pressing refresh.
  useEffect(
    () => void state.customizations.refresh().catch(() => undefined),
    []
  );
  return (
    <>
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
              <option value={state.customizations.selected.value.descriptorId}>
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
      {(() => {
        const sel = state.customizations.selected.value;
        const c = state.customizations.current.value;
        if (!sel || !c || c.hasVariant.length < 2) return null;
        return (
          <div
            className="sb-variant-gallery"
            role="radiogroup"
            aria-label={t("variant-gallery", { defaultValue: "Variant" })}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!sel.variantId}
              className={`sb-variant-option${!sel.variantId ? " sb-variant-option-on" : ""}`}
              onClick={() => {
                const entry = state.customizations.available.value.find(
                  (x) => x.offering.descriptorId === sel.descriptorId
                );
                if (entry) void state.customizations.select(entry);
              }}
            >
              <span
                className="sb-cz-theme-thumb sb-variant-auto material-symbols-outlined"
                aria-hidden="true"
              >
                contrast
              </span>
              <span className="sb-small">
                {t("variant-automatic", { defaultValue: "Automatic" })}
              </span>
            </button>
            {c.hasVariant.map((v) => (
              <button
                key={v["@id"]}
                type="button"
                role="radio"
                aria-checked={sel.variantId === v["@id"]}
                className={`sb-variant-option${sel.variantId === v["@id"] ? " sb-variant-option-on" : ""}`}
                onClick={() => {
                  const entry = state.customizations.available.value.find(
                    (x) => x.offering.descriptorId === sel.descriptorId
                  );
                  if (entry) void state.customizations.select(entry, v["@id"]);
                }}
              >
                <ThemeThumbnail theme={themeFromVariant(c, v)} />
                <span className="sb-small">{v.label}</span>
              </button>
            ))}
          </div>
        );
      })()}
    </>
  );
}

/** The interface language. */
export function LanguageField({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  return (
    <>
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
    </>
  );
}

/** Display: text size, line height, margins, interface size, and what the chapter shows. */
export function ReadingFields({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <>
      <label className="sb-small">
        {t("scripture-settings-font-size-example", { defaultValue: "A" })}{" "}
        <select
          value={state.settings.fontSize.value}
          onChange={(e) =>
            (state.settings.fontSize.value = (e.target as HTMLSelectElement)
              .value as FontSize)
          }
        >
          {(["xs", "s", "m", "l", "xl", "xxl"] as const).map((f) => (
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
              ["loose", "Loose"],
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
              ["xl", "Extra large"],
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
      <label className="sb-small sb-account-row">
        <span>{t("book-order", { defaultValue: "Book order" })}</span>
        <select
          value={state.settings.bookOrder.value}
          onChange={(e) =>
            (state.settings.bookOrder.value = (e.target as HTMLSelectElement)
              .value as BookOrder)
          }
        >
          <option value="traditional">
            {t("traditional", { defaultValue: "Traditional" })}
          </option>
          <option value="tanakh">
            {t("tanakh", { defaultValue: "Tanakh" })}
          </option>
        </select>
      </label>
      <label className="sb-small sb-check">
        <input
          type="checkbox"
          checked={state.settings.showDiscovered.value}
          onChange={(e) =>
            (state.settings.showDiscovered.value = (
              e.target as HTMLInputElement
            ).checked)
          }
        />{" "}
        {t("show-discovered-content", {
          defaultValue: "Show discovered content",
        })}
      </label>
      <label className="sb-small sb-account-row">
        <span>
          {t("verse-selection-effects", {
            defaultValue: "Verse selection effects",
          })}
        </span>
        <select
          value={state.settings.selectionEffects.value}
          onChange={(e) =>
            (state.settings.selectionEffects.value = (
              e.target as HTMLSelectElement
            ).value as SelectionEffects)
          }
        >
          <option value="default">
            {t("verse-selection-effects-default", { defaultValue: "Default" })}
          </option>
          <option value="enabled">
            {t("verse-selection-effects-enabled", { defaultValue: "Enabled" })}
          </option>
          <option value="disabled">
            {t("verse-selection-effects-disabled", {
              defaultValue: "Disabled",
            })}
          </option>
        </select>
      </label>
    </>
  );
}

/** Listening: keep the screen on, play on into the next chapter, the recording's reader. */
export function ListeningCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <>
      <div className="sb-account-card">
        <p className="sb-small">
          <strong>{t("listening", { defaultValue: "Listening" })}</strong>
        </p>
        {wakeLockSupported() && (
          <label className="sb-small sb-check">
            <input
              type="checkbox"
              checked={state.settings.keepScreenAwake.value}
              onChange={(e) =>
                (state.settings.keepScreenAwake.value = (
                  e.target as HTMLInputElement
                ).checked)
              }
            />{" "}
            {t("keep-screen-awake", {
              defaultValue: "Keep the screen on while the reader is open",
            })}
          </label>
        )}
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
    </>
  );
}

/** Sharing what you are reading now with friends (signed in). */
export function PresenceCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  if (!state.session.value) return null;
  return (
    <div className="sb-account-card">
      <label className="sb-small sb-check">
        <input
          type="checkbox"
          checked={state.presence.share.value}
          onChange={(e) =>
            void state.presence.setShare((e.target as HTMLInputElement).checked)
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
      {state.invites.findable.value !== null && (
        <>
          <label className="sb-small sb-check">
            <input
              type="checkbox"
              checked={state.invites.findable.value}
              onChange={(e) =>
                void state.invites.setFindable(
                  (e.target as HTMLInputElement).checked
                )
              }
            />{" "}
            {t("findable-by-email", {
              defaultValue: "Let people who have my email find me",
            })}
          </label>
          <p className="sb-small sb-muted">
            {t("findable-by-email-note", {
              defaultValue:
                "A friend who invites your email address reaches you here. Your address is never shown to anyone.",
            })}
          </p>
        </>
      )}
    </div>
  );
}

/** Launch tutorial: the introduction tour, and contextual tours turned back on. */
export function TutorialsCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <>
      <div className="sb-account-card">
        <p className="sb-small">
          <strong>{t("tutorials", { defaultValue: "Tutorials" })}</strong>{" "}
          <span className="sb-muted">
            {state.tours.off.value
              ? t("tutorials-off", { defaultValue: "Turned off." })
              : t("tutorials-on", {
                  defaultValue:
                    "Short tours show the first time you use a feature.",
                })}
          </span>
        </p>
        <div className="sb-note-card-actions">
          <button
            className="sb-note-button"
            onClick={() => {
              state.ui.pane.value = "none";
              state.tours.start("introduction");
            }}
          >
            {t("onboarding-tour", { defaultValue: "Take the tour" })}
          </button>
          <button
            className="sb-note-button"
            onClick={() => state.tours.turnOn()}
          >
            {t("tutorials-again", { defaultValue: "Show tutorials again" })}
          </button>
        </div>
      </div>
    </>
  );
}

/** Extensions: each one switched on or off. */
export function ExtensionsCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const ext = state.extensions;
  const [tab, setTab] = useState<"installed" | "available">("installed");
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const all = ext.registered.value;
  const installed = all.filter((r) => ext.enabled.value.has(r.id));
  const available = all.filter((r) => !ext.enabled.value.has(r.id));
  const list = tab === "installed" ? installed : available;
  const reg = configuring ? all.find((r) => r.id === configuring) : null;

  if (reg?.settings)
    return (
      <section className="sb-settings-section sb-extension-settings">
        <button
          type="button"
          className="sb-settings-back"
          onClick={() => setConfiguring(null)}
        >
          <span className="material-symbols-outlined">arrow_back</span>{" "}
          {t("extensions", { defaultValue: "Extensions" })}
        </button>
        <h3 className="sb-settings-subheading">{reg.label}</h3>
        {Object.entries(reg.settings).map(([key, spec]) => {
          const value = ext.settingOf(reg.id, key);
          const id = `sb-ext-${reg.id}-${key}`;
          const set = (v: string | number | boolean) =>
            void ext.setSetting(reg.id, key, v);
          return (
            <div key={key} className="sb-settings-field-row">
              <label className="sb-settings-field-label" htmlFor={id}>
                {spec.label}
              </label>
              {spec.type === "switch" ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => set((e.target as HTMLInputElement).checked)}
                />
              ) : spec.type === "choice" ? (
                <select
                  id={id}
                  value={String(value)}
                  onChange={(e) => set((e.target as HTMLSelectElement).value)}
                >
                  {(spec.options ?? []).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  className="sb-note-editor"
                  type={spec.type === "number" ? "number" : "text"}
                  min={spec.min}
                  max={spec.max}
                  value={String(value ?? "")}
                  onChange={(e) => {
                    const raw = (e.target as HTMLInputElement).value;
                    if (spec.type !== "number") return set(raw);
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return;
                    set(
                      Math.min(
                        spec.max ?? Infinity,
                        Math.max(spec.min ?? -Infinity, Math.round(n))
                      )
                    );
                  }}
                />
              )}
              {spec.description && (
                <p className="sb-settings-field-description">
                  {spec.description}
                </p>
              )}
            </div>
          );
        })}
        <div className="sb-extension-footer-actions">
          <button
            type="button"
            className="sb-settings-action-button"
            onClick={() => void ext.resetSettings(reg.id)}
          >
            {t("reset-to-defaults", { defaultValue: "Reset to defaults" })}
          </button>
        </div>
      </section>
    );

  const download = () => {
    const blob = new Blob([JSON.stringify(ext.exportSet(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seed-bible-extensions.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file
        .text()
        .then((text) => ext.importSet(JSON.parse(text)))
        .then(() =>
          setMessage(
            t("extensions-uploaded", {
              defaultValue: "Your extensions were put back from the file.",
            })
          )
        )
        .catch(() =>
          setMessage(
            t("extensions-upload-failed", {
              defaultValue: "That file is not a set of extensions.",
            })
          )
        );
    };
    input.click();
  };

  return (
    <section className="sb-settings-section">
      <div
        className="sb-extensions-tabs"
        role="tablist"
        aria-label={t("extensions", { defaultValue: "Extensions" })}
      >
        {(["installed", "available"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`sb-extensions-tab${tab === k ? " sb-extensions-tab-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {k === "installed"
              ? t("installed-extensions", { defaultValue: "Installed" })
              : t("available-extensions", { defaultValue: "Available" })}
            <span className="sb-extensions-tab-count">
              {(k === "installed" ? installed : available).length}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {list.length === 0 ? (
          <div className="sb-settings-empty-state">
            <p>
              {tab === "installed"
                ? t("no-installed-extensions", {
                    defaultValue: "You haven't installed any extensions yet.",
                  })
                : t("no-available-extensions", {
                    defaultValue:
                      "There are no more extensions available to install.",
                  })}
            </p>
          </div>
        ) : (
          <ul className="sb-extensions-list">
            {list.map((r) => {
              const on = ext.enabled.value.has(r.id);
              const error = ext.errors.value[r.id];
              return (
                <li
                  key={r.id}
                  className="sb-extension-row"
                  data-extension={r.id}
                >
                  <div className="sb-extension-row-body">
                    <span
                      className={`material-symbols-outlined sb-extension-state-icon sb-extension-state-${on ? "installed" : "none"}`}
                      title={
                        on
                          ? t("extension-state-installed", {
                              defaultValue: "Installed",
                            })
                          : t("extension-state-none", {
                              defaultValue: "Not installed",
                            })
                      }
                    >
                      {on ? "check_circle" : "extension"}
                    </span>
                    <div className="sb-extension-row-content">
                      <span className="sb-extension-name">{r.label}</span>
                      {r.description && (
                        <span className="sb-extension-description">
                          {r.description}
                        </span>
                      )}
                      {error && <span className="sb-pane-error">{error}</span>}
                    </div>
                    <div className="sb-extension-row-actions">
                      {on && r.settings && (
                        <button
                          type="button"
                          className="sb-extension-row-action-button"
                          aria-label={t("configure-extension", {
                            defaultValue: "Configure",
                          })}
                          title={t("configure-extension", {
                            defaultValue: "Configure",
                          })}
                          onClick={() => setConfiguring(r.id)}
                        >
                          <span className="material-symbols-outlined">
                            tune
                          </span>
                        </button>
                      )}
                      {on ? (
                        <button
                          type="button"
                          className="sb-extension-row-action-button"
                          aria-label={t("uninstall", {
                            defaultValue: "Uninstall",
                          })}
                          title={t("uninstall", { defaultValue: "Uninstall" })}
                          onClick={() => void ext.setEnabled(r.id, false)}
                        >
                          <span className="material-symbols-outlined">
                            delete
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sb-extension-row-action-button"
                          aria-label={t("install", { defaultValue: "Install" })}
                          title={t("install", { defaultValue: "Install" })}
                          onClick={() => void ext.setEnabled(r.id, true)}
                        >
                          <span className="material-symbols-outlined">
                            download
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {message && <p className="sb-small sb-muted">{message}</p>}
      <div className="sb-extension-footer-actions">
        <button
          type="button"
          className="sb-settings-action-button"
          onClick={download}
        >
          {t("download-extensions", { defaultValue: "Download Extensions" })}
        </button>
        <button
          type="button"
          className="sb-settings-action-button"
          onClick={upload}
        >
          {t("upload-extensions", { defaultValue: "Upload Extensions" })}
        </button>
      </div>
    </section>
  );
}

export function AccountPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
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
      <AccountCard state={state} />

      <div className="sb-account-card">
        <ChurchThemeFields state={state} />
        <LanguageField state={state} />
        <ReadingFields state={state} />
      </div>

      {state.session.value && <ProfileCard state={state} />}
      {state.session.value && <PublishAsCard state={state} />}
      {state.session.value && <ConnectorsCard state={state} />}

      <ListeningCard state={state} />
      <PresenceCard state={state} />

      <TextStyleCard state={state} />
      <ToolbarCard state={state} />

      <TutorialsCard state={state} />
      <ExtensionsCard state={state} />
    </section>
  );
}

/** Display & Theme: the old reader's theme gallery — Light, Dark, and System (follows the device). */
export function ThemeGallery({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const choice = state.settings.theme.value;
  const label = (name: string, on: boolean) => (
    <div className="sb-theme-ready-label">
      <span>{name}</span>
      <span
        className={`material-symbols-outlined sb-theme-ready-check${on ? "" : " sb-theme-ready-check-hidden"}`}
        aria-hidden="true"
      >
        check_circle
      </span>
    </div>
  );
  const swatches = (v: (typeof LIGHT_THEME)["variables"]) => (
    <>
      <div
        className="sb-theme-ready-swatch sb-theme-ready-swatch-a"
        style={{ background: v.primaryColor }}
      />
      <div
        className="sb-theme-ready-swatch sb-theme-ready-swatch-b"
        style={{ background: v.secondaryColor }}
      />
      <div
        className="sb-theme-ready-swatch sb-theme-ready-swatch-c"
        style={{ background: v.tertiaryColor }}
      />
    </>
  );
  return (
    <section className="sb-settings-section">
      <h3 className="sb-settings-subheading">
        {t("themes", { defaultValue: "Themes" })}
      </h3>
      <div className="sb-theme-ready-gallery" role="radiogroup">
        {[LIGHT_THEME, DARK_THEME].map((th) => (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={choice === th.id}
            className={`sb-theme-ready-card${choice === th.id ? " sb-theme-ready-card-selected" : ""}`}
            onClick={() =>
              (state.settings.theme.value = th.id as "light" | "dark")
            }
          >
            <div
              className="sb-theme-ready-preview"
              style={{
                background:
                  th.variables.readerBackground ?? th.variables.background,
              }}
            >
              {swatches(th.variables)}
            </div>
            {label(
              th.id === "dark"
                ? t("theme-dark", { defaultValue: "Dark" })
                : t("theme-light", { defaultValue: "Light" }),
              choice === th.id
            )}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={choice === "system"}
          className={`sb-theme-ready-card${choice === "system" ? " sb-theme-ready-card-selected" : ""}`}
          onClick={() => (state.settings.theme.value = "system")}
        >
          <div className="sb-theme-ready-preview sb-theme-ready-preview-system">
            {[LIGHT_THEME, DARK_THEME].map((half) => (
              <div
                key={half.id}
                className="sb-theme-ready-system-half"
                style={{
                  background:
                    half.variables.readerBackground ??
                    half.variables.background,
                }}
              >
                <div
                  className="sb-theme-ready-swatch sb-theme-ready-swatch-a"
                  style={{ background: half.variables.primaryColor }}
                />
              </div>
            ))}
          </div>
          {label(
            t("theme-system-card", { defaultValue: "System" }),
            choice === "system"
          )}
        </button>
      </div>
    </section>
  );
}
