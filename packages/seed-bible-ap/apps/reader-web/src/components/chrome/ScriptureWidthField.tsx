// SCRIPTURE WIDTH — the old reader's control (SettingsPage "Scripture Width"): the longest line, in characters, from
// 24 to 192 with − and +, and here also "Fit the window", which lets the chapter use every bit of the width.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  cleanScriptureWidth,
  DEFAULT_SCRIPTURE_WIDTH,
  MAX_SCRIPTURE_WIDTH,
  MIN_SCRIPTURE_WIDTH,
} from "../../state/chrome/settings";

export function ScriptureWidthField({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const width = state.settings.scriptureWidth;
  const fit = width.value === "fit";
  const n = fit ? DEFAULT_SCRIPTURE_WIDTH : (width.value as number);
  const set = (v: number) => (width.value = cleanScriptureWidth(v));
  return (
    <div className="sb-scripture-width">
      <div className="sb-scripture-margins-label">
        {t("scripture-width", { defaultValue: "Scripture Width" })}
      </div>
      <div className="sb-scripture-margins-row">
        <button
          type="button"
          className="sb-scripture-margins-step"
          disabled={fit || n <= MIN_SCRIPTURE_WIDTH}
          onClick={() => set(n - 1)}
          aria-label={t("decrease-scripture-width", {
            defaultValue: "Decrease scripture width",
          })}
        >
          −
        </button>
        <div className="sb-scripture-margins-value">
          <input
            type="number"
            className="sb-scripture-margins-input"
            value={n}
            min={MIN_SCRIPTURE_WIDTH}
            max={MAX_SCRIPTURE_WIDTH}
            disabled={fit}
            aria-label={t("scripture-width", {
              defaultValue: "Scripture Width",
            })}
            onChange={(e) =>
              set(Number((e.currentTarget as HTMLInputElement).value))
            }
          />
          <span className="sb-scripture-margins-unit">
            {t("scripture-width-unit", { defaultValue: "ch" })}
          </span>
        </div>
        <button
          type="button"
          className="sb-scripture-margins-step"
          disabled={fit || n >= MAX_SCRIPTURE_WIDTH}
          onClick={() => set(n + 1)}
          aria-label={t("increase-scripture-width", {
            defaultValue: "Increase scripture width",
          })}
        >
          +
        </button>
      </div>
      <label className="sb-small sb-check">
        <input
          type="checkbox"
          checked={fit}
          onChange={(e) =>
            (width.value = (e.currentTarget as HTMLInputElement).checked
              ? "fit"
              : DEFAULT_SCRIPTURE_WIDTH)
          }
        />{" "}
        {t("scripture-width-fit", { defaultValue: "Fit the window" })}
      </label>
    </div>
  );
}
