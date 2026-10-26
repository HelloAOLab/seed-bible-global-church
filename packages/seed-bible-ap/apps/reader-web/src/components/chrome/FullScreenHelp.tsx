// USING THE WHOLE SCREEN — shown where the browser has no full-screen mode for a page (Safari on an iPhone): the way
// there is to add Seed Bible to the home screen, which opens it without the browser's bars. Where the browser offers
// to install the reader, the button does it.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  install,
  installPrompt,
  isAppleMobile,
} from "../../state/chrome/fullScreen";

export function FullScreenHelp({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  if (!state.ui.fullScreenHelp.value) return null;
  const close = () => (state.ui.fullScreenHelp.value = false);
  return (
    <div className="sb-share-overlay" onClick={close}>
      <div
        className="sb-share-dialog sb-fullscreen-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-fullscreen-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="sb-fullscreen-title">
          {t("full-screen-title", { defaultValue: "Use the whole screen" })}
        </h3>
        {installPrompt.value ? (
          <>
            <p className="sb-small">
              {t("full-screen-install-body", {
                defaultValue:
                  "Install Seed Bible and it opens on its own, without the browser's bars.",
              })}
            </p>
            <div className="sb-note-card-actions">
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() => void install().then(close)}
              >
                {t("onboarding-install", { defaultValue: "Install the app" })}
              </button>
            </div>
          </>
        ) : isAppleMobile() ? (
          <ol className="sb-small sb-fullscreen-steps">
            <li>
              {t("full-screen-ios-1", {
                defaultValue:
                  "Tap Share (the square with an arrow) in Safari's bar.",
              })}
            </li>
            <li>
              {t("full-screen-ios-2", {
                defaultValue: "Choose Add to Home Screen, then Add.",
              })}
            </li>
            <li>
              {t("full-screen-ios-3", {
                defaultValue:
                  "Open Seed Bible from your home screen: it fills the screen, without Safari's bars.",
              })}
            </li>
          </ol>
        ) : (
          <p className="sb-small">
            {t("full-screen-other", {
              defaultValue:
                "Use your browser's menu: Install app or Add to Home screen, or its full-screen mode (F11 on a computer).",
            })}
          </p>
        )}
        <p className="sb-small sb-muted">
          {t("full-screen-scroll", {
            defaultValue:
              "In the browser, scrolling down the chapter also folds its bars away.",
          })}
        </p>
        <div className="sb-note-card-actions">
          <button className="sb-note-button" onClick={close}>
            {t("close", { defaultValue: "Close" })}
          </button>
        </div>
      </div>
    </div>
  );
}
