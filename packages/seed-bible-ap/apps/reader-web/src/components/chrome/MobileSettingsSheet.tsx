// THEME & TEXT — the old reader's phone sheet (packages/seed-bible components/MobileSettingsSheet), from the sliders
// in the chapter's top bar: the text smaller or larger, the line spacing (one button cycles it), the UI size, keep the
// screen awake, and Go to all settings. Each choice is the same setting the Display page sets.
import { useEffect } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type {
  FontSize,
  LineHeight,
  UiScale,
} from "../../state/chrome/settings";

const FONT_SIZES: FontSize[] = ["xs", "s", "m", "l", "xl", "xxl"];
const LINE_HEIGHTS: LineHeight[] = ["compact", "normal", "relaxed", "loose"];
const UI_SIZES: UiScale[] = ["s", "m", "l", "xl"];

/** The old reader's line-spacing glyph: three bars, wider apart as the spacing grows. */
function LineHeightIcon({ index }: { index: number }) {
  const gap = 3 + index * 1.2;
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 20 14"
      fill="none"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x="0"
          y={1 + i * gap}
          width="20"
          height="2"
          rx="1"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function MobileSettingsSheet({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { settings, ui } = state;
  const open = ui.textSheet.value;
  // Its short tip, the first time it opens (once; never if tutorials are off).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => state.tours.startContextual("text-sheet"), 400);
    return () => clearTimeout(id);
  }, [open]);
  if (!open) return null;
  const close = () => (ui.textSheet.value = false);
  const font = FONT_SIZES.indexOf(settings.fontSize.value);
  const line = Math.max(0, LINE_HEIGHTS.indexOf(settings.lineHeight.value));
  return (
    <>
      <div
        className="sb-mobile-settings-sheet-overlay"
        onClick={close}
        aria-hidden="true"
      />
      <div
        className="sb-mobile-settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("theme-and-text", { defaultValue: "Theme & text" })}
        onKeyDown={(e) => {
          if ((e as KeyboardEvent).key === "Escape") close();
        }}
      >
        <div className="sb-mobile-settings-sheet-header">
          <div className="sb-mobile-settings-sheet-title">
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: "1.375rem" }}
            >
              auto_stories
            </span>
            <span>{t("theme-and-text", { defaultValue: "Theme & text" })}</span>
          </div>
          <button
            type="button"
            className="sb-mobile-settings-sheet-close"
            onClick={close}
            aria-label={t("close", { defaultValue: "Close" })}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-mobile-settings-sheet-body">
          <div className="sb-mobile-settings-sheet-section-label">
            {t("scripture-settings", { defaultValue: "Scripture settings" })}
          </div>
          <div className="sb-mobile-settings-sheet-scripture-row">
            <button
              type="button"
              className="sb-mobile-settings-sheet-scripture-button"
              disabled={font <= 0}
              aria-label={t("decrease-scripture-font-size", {
                defaultValue: "Decrease scripture font size",
              })}
              style={{ fontSize: "0.875rem" }}
              onClick={() =>
                (settings.fontSize.value = FONT_SIZES[Math.max(0, font - 1)]!)
              }
            >
              A
            </button>
            <button
              type="button"
              className="sb-mobile-settings-sheet-scripture-button"
              disabled={font >= FONT_SIZES.length - 1}
              aria-label={t("increase-scripture-font-size", {
                defaultValue: "Increase scripture font size",
              })}
              style={{ fontSize: "1.25rem", fontWeight: 500 }}
              onClick={() =>
                (settings.fontSize.value =
                  FONT_SIZES[Math.min(FONT_SIZES.length - 1, font + 1)]!)
              }
            >
              A
            </button>
            <button
              type="button"
              className="sb-mobile-settings-sheet-scripture-button"
              aria-label={t("change-line-spacing", {
                defaultValue: "Change line spacing",
              })}
              onClick={() =>
                (settings.lineHeight.value =
                  LINE_HEIGHTS[(line + 1) % LINE_HEIGHTS.length]!)
              }
            >
              <LineHeightIcon index={line} />
            </button>
          </div>
          <div className="sb-mobile-settings-sheet-section-label">
            {t("ui-size", { defaultValue: "UI size" })}
          </div>
          <div className="sb-mobile-settings-sheet-size-row">
            {UI_SIZES.map((size, i) => (
              <button
                key={size}
                type="button"
                className={`sb-mobile-settings-sheet-size-button${settings.uiScale.value === size ? " sb-mobile-settings-sheet-size-button-selected" : ""}`}
                aria-pressed={settings.uiScale.value === size}
                aria-label={size.toUpperCase()}
                style={{ fontSize: `${(12 + i * 2) / 16}rem` }}
                onClick={() => (settings.uiScale.value = size)}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="sb-settings-toggle-row sb-mobile-settings-sheet-toggle-row">
            <label
              className="sb-settings-toggle-label"
              htmlFor="sb-mobile-wake-lock-toggle"
            >
              {t("keep-screen-awake-short", {
                defaultValue: "Keep screen awake",
              })}
            </label>
            <input
              id="sb-mobile-wake-lock-toggle"
              type="checkbox"
              checked={settings.keepScreenAwake.value}
              onChange={(e) =>
                (settings.keepScreenAwake.value = (
                  e.target as HTMLInputElement
                ).checked)
              }
            />
          </div>
          <div className="sb-mobile-settings-sheet-divider" />
          <button
            type="button"
            className="sb-mobile-settings-sheet-all-settings"
            onClick={() => {
              close();
              ui.sidebarDrawer.value = true;
              ui.settingsView.value = "main";
            }}
          >
            <span
              className="material-symbols-outlined sb-mobile-settings-icon"
              aria-hidden="true"
            >
              settings
            </span>
            <span>
              {t("go-to-all-settings", { defaultValue: "Go to all settings" })}
            </span>
            <span
              className="material-symbols-outlined sb-mobile-settings-sheet-all-settings-chevron rtl-mirror"
              aria-hidden="true"
            >
              chevron_right
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
