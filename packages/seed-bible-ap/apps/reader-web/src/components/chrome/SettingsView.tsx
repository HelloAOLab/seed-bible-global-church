// SETTINGS — the old reader's (packages/seed-bible Tabs `Settings` and SettingsPage): the ⚙ at the bottom of the
// sidebar turns the sidebar into the Settings list — Account settings, Display & Theme, Toolbar, Extensions, Install
// App, Launch tutorial, Customize, About Seed Bible, then Language and the version — and each row opens its page in
// the sidebar, with ← back to the list. The pages hold the same cards as the Account settings pane.
import { useState } from "preact/hooks";
import { HighlightColorsCard } from "./HighlightColorsCard";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import type { SettingsPage } from "../../state";
import { AVAILABLE_LANGUAGES, setLanguage, useI18n } from "../../i18n";
import { APP_VERSION, BUILD_ID } from "../../build";
import { LANG_META } from "../../i18n/languageMeta";
import {
  install,
  installPrompt,
  runningAsApp,
} from "../../state/chrome/fullScreen";
import {
  AccountCard,
  ChurchThemeFields,
  ConnectorsCard,
  ExtensionsCard,
  ListeningCard,
  PresenceCard,
  ProfileCard,
  PublishAsCard,
  ReadingFields,
  TextStyleCard,
  ThemeGallery,
  ToolbarCard,
  TutorialsCard,
} from "./AccountPane";

/** A language in its own words ("Français"), as the old reader's picker lists it. */
function languageName(code: string): string {
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code;
  } catch {
    return code;
  }
}

interface Row {
  id: Exclude<SettingsPage, "main">;
  icon: string;
  label: string;
}

export function SettingsView({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const page = state.ui.settingsView.value ?? "main";
  const go = (p: SettingsPage | null) => (state.ui.settingsView.value = p);
  const rows: Row[] = [
    {
      id: "account",
      icon: "person",
      label: t("account", { defaultValue: "Account" }),
    },
    {
      id: "display",
      icon: "contrast",
      label: t("display-and-theme", { defaultValue: "Display & Theme" }),
    },
    {
      id: "extensions",
      icon: "extension",
      label: t("extensions", { defaultValue: "Extensions" }),
    },
    ...(runningAsApp()
      ? []
      : [
          {
            id: "install" as const,
            icon: "install_desktop",
            label: t("install-app", { defaultValue: "Install App" }),
          },
        ]),
    {
      id: "tutorial",
      icon: "school",
      label: t("launch-tutorial", { defaultValue: "Launch tutorial" }),
    },
  ];
  // What this reader adds to the old reader's list — after About, so the list reads as seedbible.org's.
  const extras: Row[] = [
    {
      id: "toolbar",
      icon: "tune",
      label: t("toolbar", { defaultValue: "Toolbar" }),
    },
    {
      id: "customize",
      icon: "palette",
      label: t("customize", { defaultValue: "Customize" }),
    },
  ];
  const title =
    page === "main"
      ? ""
      : ([...rows, ...extras].find((r) => r.id === page)?.label ?? "");

  const body = (): ComponentChildren => {
    switch (page) {
      case "account":
        return (
          <>
            <div className="sb-account-card">
              <AccountCard state={state} />
            </div>
            {state.session.value && <ProfileCard state={state} />}
            {state.session.value && <PublishAsCard state={state} />}
            <PresenceCard state={state} />
          </>
        );
      case "display":
        return (
          <>
            <ThemeGallery state={state} />
            <HighlightColorsCard state={state} />
            <div className="sb-account-card">
              <ReadingFields state={state} />
            </div>
            <TextStyleCard state={state} />
            <ListeningCard state={state} />
          </>
        );
      case "toolbar":
        return <ToolbarCard state={state} />;
      case "extensions":
        return (
          <>
            <ExtensionsCard state={state} />
            {state.session.value && <ConnectorsCard state={state} />}
          </>
        );
      case "install":
        return (
          <div className="sb-account-card">
            <p className="sb-small">
              {t("onboarding.installBodyPre", {
                defaultValue: "Add Seed Bible to your ",
              })}
              <strong>
                {t("onboarding.installTargetDesktop", {
                  defaultValue: "desktop",
                })}
              </strong>
              {t("install-body-post-settings", {
                defaultValue: " or your phone's home screen to return anytime.",
              })}
            </p>
            {installPrompt.value ? (
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() => void install()}
              >
                {t("onboarding.installApp", { defaultValue: "Install App" })}
              </button>
            ) : (
              <button
                className="sb-note-button"
                onClick={() => (state.ui.fullScreenHelp.value = true)}
              >
                {t("install-how", { defaultValue: "How to install" })}
              </button>
            )}
          </div>
        );
      case "tutorial":
        return <TutorialsCard state={state} />;
      case "customize":
        return (
          <div className="sb-account-card">
            <ChurchThemeFields state={state} />
            <button
              className="sb-note-button"
              onClick={() => (state.ui.pane.value = "library")}
            >
              {t("customize-make-your-own", {
                defaultValue: "Make your own in Library → Customizations",
              })}
            </button>
          </div>
        );
      default:
        return (
          <div className="sb-settings-page">
            <section className="sb-settings-section">
              <ul className="sb-settings-list">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      className="sb-settings-nav-item"
                      onClick={() => go(r.id)}
                    >
                      <span className="sb-settings-nav-icon">
                        <span className="material-symbols-outlined">
                          {r.icon}
                        </span>
                      </span>
                      <span className="sb-settings-nav-label">{r.label}</span>
                      <span className="material-symbols-outlined rtl-mirror">
                        chevron_right
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    className="sb-settings-nav-item"
                    onClick={() => (state.ui.pane.value = "about")}
                  >
                    <span className="sb-settings-nav-icon">
                      <span className="material-symbols-outlined">info</span>
                    </span>
                    <span className="sb-settings-nav-label">
                      {t("about-title", { defaultValue: "About Seed Bible" })}
                    </span>
                    <span className="material-symbols-outlined rtl-mirror">
                      chevron_right
                    </span>
                  </button>
                </li>
                {extras.map((r) => (
                  <li key={r.id}>
                    <button
                      className="sb-settings-nav-item"
                      onClick={() => go(r.id)}
                    >
                      <span className="sb-settings-nav-icon">
                        <span className="material-symbols-outlined">
                          {r.icon}
                        </span>
                      </span>
                      <span className="sb-settings-nav-label">{r.label}</span>
                      <span className="material-symbols-outlined rtl-mirror">
                        chevron_right
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="sb-settings-section">
              <label
                className="sb-settings-field-label"
                htmlFor="sb-settings-language"
              >
                {t("language", { defaultValue: "Language" })}
              </label>
              <div className="sb-settings-language-row">
                {LANG_META[language]?.cc && (
                  <img
                    className="sb-settings-language-flag"
                    src={`https://flagcdn.com/w40/${LANG_META[language]!.cc}.png`}
                    alt=""
                  />
                )}
                <select
                  id="sb-settings-language"
                  className="sb-settings-language-select"
                  value={language}
                  onChange={(e) =>
                    void setLanguage((e.target as HTMLSelectElement).value)
                  }
                >
                  {AVAILABLE_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {LANG_META[l]?.display ?? languageName(l)}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            <section className="sb-settings-section">
              <button
                type="button"
                className="sb-settings-action-button"
                onClick={() => window.open(REPORT_A_BUG, "_blank")}
              >
                {t("report-a-bug", { defaultValue: "Report a bug" })}
              </button>
            </section>
            <VersionFooter />
          </div>
        );
    }
  };

  return (
    <div className="sb-sidebar-settings-view">
      <div className="sb-sidebar-tabs-header">
        {page !== "main" && (
          <button
            className="sb-settings-breadcrumbs-back"
            aria-label={t("back", { defaultValue: "Back" })}
            title={t("back", { defaultValue: "Back" })}
            onClick={() => go("main")}
          >
            <span className="material-symbols-outlined rtl-mirror">
              arrow_back
            </span>
          </button>
        )}
        <h3 className="sb-sidebar-tabs-title">
          {page === "main"
            ? t("settings", { defaultValue: "Settings" })
            : title}
        </h3>
        <button
          onClick={() => go(null)}
          className="sb-sidebar-settings-close-button"
          aria-label={t("close-settings", { defaultValue: "Close Settings" })}
          title={t("close-settings", { defaultValue: "Close Settings" })}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="sb-sidebar-settings-content">{body()}</div>
    </div>
  );
}

/** seedbible.org's bug report form (its Settings → Report a bug). */
const REPORT_A_BUG =
  "https://docs.google.com/forms/d/e/1FAIpQLSejiuVM8xguEHKZ2Kv5DX-jE98zYwxFiPwpYrFSmvVgMejZzQ/viewform";

/** The old reader's version line, "v1.16.0 · e89b23c": tapping it copies the version. */
function VersionFooter() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="sb-settings-version"
      title={t("copy", { defaultValue: "Copy" })}
      onClick={() =>
        void navigator.clipboard
          ?.writeText(`v${APP_VERSION} (${BUILD_ID})`)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {})
      }
    >
      {copied
        ? t("copied", { defaultValue: "Copied" })
        : t("app-version", {
            version: APP_VERSION,
            commit: BUILD_ID.slice(0, 7),
            defaultValue: "v{{version}} · {{commit}}",
          })}
    </button>
  );
}
