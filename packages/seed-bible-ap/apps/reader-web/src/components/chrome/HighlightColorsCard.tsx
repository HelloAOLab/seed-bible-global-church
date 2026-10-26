// HIGHLIGHT COLORS — the old reader's Settings → Themes → Highlight colors: each of the twelve with its background and
// text colour to change for yourself, a reset beside any changed, and Reset all custom colors. Kept on this device
// and laid over whatever theme is in force (state/chrome/settings.ts).
import { HIGHLIGHT_COLORS } from "@seed/seed-schema";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

/** A colour as a colour input takes it (#rrggbb), or black for anything else (a var(), a name). */
const hexOf = (v: string | undefined) => {
  if (!v) return "#000000";
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : "#000000";
};

export function HighlightColorsCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const settings = state.settings;
  const own = settings.highlightOverrides.value;
  const effective = settings.resolvedTheme().highlightColors;
  const set = (id: string, patch: { color?: string; fontColor?: string }) =>
    (settings.highlightOverrides.value = {
      ...own,
      [id]: { ...(own[id] ?? {}), ...patch },
    });
  const reset = (id: string) => {
    const { [id]: _gone, ...rest } = own;
    settings.highlightOverrides.value = rest;
  };
  return (
    <div className="sb-account-card sb-highlight-colors-card">
      <h3 className="sb-settings-subheading">
        {t("highlight-colors", { defaultValue: "Highlight colors" })}
      </h3>
      <ul className="sb-theme-colors-list">
        {HIGHLIGHT_COLORS.map((id) => {
          const bg = effective[id]?.color ?? "";
          const fg = effective[id]?.fontColor ?? "";
          const changed = own[id] !== undefined;
          return (
            <li key={id} className="sb-theme-color-row" data-color={id}>
              <div className="sb-theme-color-row-main">
                <span
                  className="sb-highlight-preview-pill"
                  style={{ background: bg, color: fg }}
                  aria-hidden="true"
                >
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </span>
                <span className="sb-theme-color-value">{bg || "—"}</span>
              </div>
              <div className="sb-theme-color-row-controls">
                <input
                  type="color"
                  className="sb-theme-color-input"
                  aria-label={t("id_highlight-background-color", {
                    id,
                    defaultValue: "{{id}} highlight background color",
                  })}
                  value={hexOf(bg)}
                  onChange={(e) =>
                    set(id, { color: (e.target as HTMLInputElement).value })
                  }
                />
                <input
                  type="color"
                  className="sb-theme-color-input"
                  aria-label={t("id_highlight-text-color", {
                    id,
                    defaultValue: "{{id}} highlight text color",
                  })}
                  value={hexOf(fg)}
                  onChange={(e) =>
                    set(id, { fontColor: (e.target as HTMLInputElement).value })
                  }
                />
                {changed && (
                  <button
                    type="button"
                    className="sb-theme-color-reset"
                    title={t("reset-to-default", {
                      defaultValue: "Reset to default",
                    })}
                    aria-label={t("reset-to-default", {
                      defaultValue: "Reset to default",
                    })}
                    onClick={() => reset(id)}
                  >
                    <span className="material-symbols-outlined">
                      restart_alt
                    </span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {Object.keys(own).length > 0 && (
        <div className="sb-settings-actions">
          <button
            type="button"
            className="sb-settings-action-button"
            onClick={() => (settings.highlightOverrides.value = {})}
          >
            {t("reset-all-custom-colors", {
              defaultValue: "Reset all custom colors",
            })}
          </button>
        </div>
      )}
    </div>
  );
}
