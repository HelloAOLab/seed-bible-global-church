// THE SHARE WINDOW — the old reader's ShareModal: a list of ways to share — Share a link (copied), Embed (the
// compact reader as an iframe, with the theme the host site wants and a live preview), Share via… (the device's share
// sheet, where it has one), and Start and share session (or Share current session) — with the session's QR code
// while one is going. Escape or the backdrop closes it.
import { useEffect, useState } from "preact/hooks";
import { SessionQRCode } from "../sessions/SessionQRCode";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export type EmbedTheme = "system" | "light" | "dark";

/** The compact reader at a URL: `?embed=minimal`, the theme (both `theme` and the old `app.themeId`). */
export function embedUrlFor(shareUrl: string, theme: EmbedTheme): string {
  const u = new URL(shareUrl);
  u.searchParams.set("embed", "minimal");
  if (theme === "system") u.searchParams.delete("theme");
  else u.searchParams.set("theme", theme);
  return u.toString();
}

const attr = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function iframeHtml(embedUrl: string, title: string): string {
  return `<iframe src="${attr(embedUrl)}" title="${attr(title)}" width="560" height="400" style="border:0" allowfullscreen></iframe>`;
}

export function ShareDialog({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const share = state.ui.share.value;
  const [view, setView] = useState<"actions" | "embed">("actions");
  const [theme, setTheme] = useState<EmbedTheme>("system");
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!share) return;
    setView("actions");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      state.ui.share.value = null;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [share]);
  if (!share) return null;
  const close = () => (state.ui.share.value = null);
  const embed = embedUrlFor(share.url, theme);
  const code = iframeHtml(embed, share.title);
  const toast = (key: string) => (state.ui.toast.value = { key });
  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(key);
    } catch {
      /* the clipboard refused */
    }
  };
  const nav = navigator as Navigator & {
    share?: (d: { title: string; url: string }) => Promise<void>;
  };
  const live = state.live;
  const signedIn = !!state.session.value;
  const sessionLink = live.shareLink.value;
  const copySession = async (link: string) => {
    await copyText(link, "session-link-copied");
    close();
  };
  const actions = [
    {
      key: "link",
      icon: "link",
      title: t("share-link", { defaultValue: "Share a link" }),
      subtitle: t("share-link-subtitle", { defaultValue: "Copy to clipboard" }),
      onClick: () => {
        void copyText(share.url, "link-copied");
        close();
      },
    },
    {
      key: "embed",
      icon: "code",
      title: t("share-embed", { defaultValue: "Embed" }),
      subtitle: t("share-embed-subtitle", {
        defaultValue: "Add this passage to a website",
      }),
      onClick: () => setView("embed"),
    },
    ...(nav.share
      ? [
          {
            key: "via",
            icon: "ios_share",
            title: t("share-via", { defaultValue: "Share via…" }),
            subtitle: t("share-via-subtitle", {
              defaultValue: "Use your device share sheet",
            }),
            onClick: () => {
              void nav.share!({ title: share.title, url: share.url }).catch(
                () => undefined
              );
              close();
            },
          },
        ]
      : []),
    ...(state.ui.embed.value
      ? []
      : live.active.value && sessionLink
        ? [
            {
              key: "session",
              icon: "group",
              title: t("share-current-session", {
                defaultValue: "Share current session",
              }),
              subtitle: t("share-current-session-subtitle", {
                defaultValue: "Copy a link to invite others to read along live",
              }),
              onClick: () => void copySession(sessionLink),
            },
          ]
        : signedIn
          ? [
              {
                key: "session",
                icon: "group",
                title: t("start-share-session", {
                  defaultValue: "Start and share session",
                }),
                subtitle: t("start-share-session-subtitle", {
                  defaultValue: "Invite others to read along live",
                }),
                onClick: () => {
                  if (starting) return;
                  setStarting(true);
                  void live
                    .start()
                    .then(() => {
                      const link = live.shareLink.value;
                      if (link) return copySession(link);
                      close();
                    })
                    .catch(() => close())
                    .finally(() => setStarting(false));
                },
              },
            ]
          : []),
  ];
  const title =
    view === "embed"
      ? t("share-embed", { defaultValue: "Embed" })
      : t("share-sheet-title", { defaultValue: "Share" });

  return (
    <div className="sb-footnote-modal-overlay" onClick={close}>
      <div
        className="sb-footnote-modal sb-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("share", { defaultValue: "Share" })}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          {view === "embed" ? (
            <div className="sb-share sb-share-embed">
              <div className="sb-share-embed-scroll">
                <button
                  type="button"
                  className="sb-share-embed-back"
                  onClick={() => setView("actions")}
                >
                  <span className="material-symbols-outlined rtl-mirror">
                    arrow_back
                  </span>
                  {t("back", { defaultValue: "Back" })}
                </button>
                <iframe
                  key={embed}
                  className="sb-share-embed-preview"
                  src={embed}
                  title={t("share-embed-preview", { defaultValue: "Preview" })}
                />
                <label className="sb-share-embed-field">
                  <span>
                    {t("share-embed-theme", { defaultValue: "Theme" })}
                  </span>
                  <select
                    value={theme}
                    onChange={(e) =>
                      setTheme(
                        (e.target as HTMLSelectElement).value as EmbedTheme
                      )
                    }
                  >
                    <option value="system">
                      {t("theme-system", { defaultValue: "System" })}
                    </option>
                    <option value="light">
                      {t("theme-light", { defaultValue: "Light" })}
                    </option>
                    <option value="dark">
                      {t("theme-dark", { defaultValue: "Dark" })}
                    </option>
                  </select>
                </label>
                <textarea
                  className="sb-share-embed-code"
                  readOnly
                  rows={4}
                  spellcheck={false}
                  aria-label={t("share-embed-code", {
                    defaultValue: "Embed code",
                  })}
                  value={code}
                />
              </div>
              <footer className="sb-share-embed-footer">
                <button
                  type="button"
                  className="sb-share-embed-copy"
                  onClick={() => void copyText(code, "copied")}
                >
                  {t("copy", { defaultValue: "Copy" })}
                </button>
              </footer>
            </div>
          ) : (
            <div className="sb-share">
              <div className="sb-share-actions">
                {actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className="sb-share-action"
                    disabled={a.key === "session" && starting}
                    onClick={a.onClick}
                  >
                    <span className="sb-share-action-icon material-symbols-outlined">
                      {a.icon}
                    </span>
                    <span className="sb-share-action-text">
                      <span className="sb-share-action-title">{a.title}</span>
                      <span className="sb-share-action-subtitle">
                        {a.subtitle}
                      </span>
                    </span>
                    <span className="sb-share-action-chevron material-symbols-outlined rtl-mirror">
                      chevron_right
                    </span>
                  </button>
                ))}
              </div>
              {live.active.value && sessionLink && (
                <SessionQRCode url={sessionLink} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
