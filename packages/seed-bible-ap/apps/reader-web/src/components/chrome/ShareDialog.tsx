// THE SHARE DIALOG — the old ShareModal: the link to what is being shared (copy it), the system share sheet where
// the device has one, and the embed code (an iframe of the compact reader, with the theme the host site wants and
// a live preview). Opened from the verse toolbar's Share; Escape or the backdrop closes it.
import { useEffect, useState } from "preact/hooks";
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
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const [theme, setTheme] = useState<EmbedTheme>("system");
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  if (!share) return null;
  const close = () => (state.ui.share.value = null);
  const embed = embedUrlFor(share.url, theme);
  const code = iframeHtml(embed, share.title);
  const copy = async (what: "link" | "embed", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      /* the clipboard refused; the text is selectable in the field */
    }
  };
  const nav = navigator as Navigator & {
    share?: (d: { title: string; url: string }) => Promise<void>;
  };
  return (
    <div className="sb-share-overlay" onClick={close}>
      <div
        className="sb-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("share", { defaultValue: "Share" })}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <header className="sb-pane-header">
          <h2>{share.title}</h2>
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <section className="sb-share-section">
          <h3>{t("share-link", { defaultValue: "Share a link" })}</h3>
          <div className="sb-share-row">
            <input
              className="sb-note-editor"
              readOnly
              value={share.url}
              onFocus={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              className="sb-note-button sb-note-button-primary"
              onClick={() => void copy("link", share.url)}
            >
              {copied === "link"
                ? t("copied", { defaultValue: "Copied" })
                : t("copy-link", { defaultValue: "Copy link" })}
            </button>
          </div>
          {nav.share && (
            <button
              className="sb-note-button"
              onClick={() =>
                void nav.share!({ title: share.title, url: share.url }).catch(
                  () => undefined
                )
              }
            >
              {t("share-via", { defaultValue: "Share via…" })}
            </button>
          )}
        </section>
        <section className="sb-share-section">
          <h3>{t("share-embed", { defaultValue: "Embed" })}</h3>
          <label className="sb-small">
            {t("share-embed-theme", { defaultValue: "Theme" })}{" "}
            <select
              value={theme}
              onChange={(e) =>
                setTheme((e.target as HTMLSelectElement).value as EmbedTheme)
              }
            >
              <option value="system">
                {t("theme-system", { defaultValue: "Follow the device" })}
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
            className="sb-note-editor sb-share-embed-code"
            readOnly
            rows={3}
            aria-label={t("share-embed-code", { defaultValue: "Embed code" })}
            value={code}
            onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <button
            className="sb-note-button"
            onClick={() => void copy("embed", code)}
          >
            {copied === "embed"
              ? t("copied", { defaultValue: "Copied" })
              : t("share-copy-embed", { defaultValue: "Copy embed code" })}
          </button>
          <details>
            <summary className="sb-small">
              {t("share-embed-preview", { defaultValue: "Preview" })}
            </summary>
            <iframe
              className="sb-share-embed-preview"
              src={embed}
              title={share.title}
            />
          </details>
        </section>
      </div>
    </div>
  );
}
