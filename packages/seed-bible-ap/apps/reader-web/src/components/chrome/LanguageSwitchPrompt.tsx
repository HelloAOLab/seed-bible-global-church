// SWITCH LANGUAGE? — the old reader's UiLanguageSwitchModal: picking a Bible in another language offers the
// interface in that language, asked in that language (the person most likely to want it may not read this one).
import { useEffect } from "preact/hooks";
import {
  answerLanguageSwitch,
  isRightToLeftLanguage,
  languageSwitchOffer,
} from "../../i18n";

/** A language in its own words ("Español"). */
function nativeName(code: string): string {
  try {
    const n = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return n ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : code;
  } catch {
    return code;
  }
}

export function LanguageSwitchPrompt() {
  const offer = languageSwitchOffer.value;
  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      answerLanguageSwitch("no");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [offer]);
  if (!offer) return null;
  const { t, target } = offer;
  return (
    <div className="sb-onboarding-overlay">
      <div
        className="sb-onboarding-card"
        role="dialog"
        aria-modal="true"
        lang={target}
        dir={isRightToLeftLanguage(target) ? "rtl" : "ltr"}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <h2 className="sb-onboarding-title">
          {t("switch-language-title", { defaultValue: "Switch language?" })}
        </h2>
        <p className="sb-onboarding-body">
          {t("switch-language-body", {
            defaultValue:
              "Do you want to switch your language to {{nativeLanguageName}}?",
            nativeLanguageName: nativeName(target),
          })}
        </p>
        <div className="sb-onboarding-actions">
          <button
            type="button"
            className="sb-onboarding-btn sb-onboarding-btn-primary"
            onClick={() => answerLanguageSwitch("switch")}
          >
            {t("switch-language-confirm", { defaultValue: "Switch" })}
          </button>
          <button
            type="button"
            className="sb-onboarding-btn sb-onboarding-btn-secondary"
            onClick={() => answerLanguageSwitch("no")}
          >
            {t("switch-language-dismiss", { defaultValue: "Don't Switch" })}
          </button>
          <button
            type="button"
            className="sb-onboarding-btn sb-onboarding-btn-tertiary"
            onClick={() => answerLanguageSwitch("never")}
          >
            {t("switch-language-never", { defaultValue: "Never Ask Again" })}
          </button>
        </div>
      </div>
    </div>
  );
}
