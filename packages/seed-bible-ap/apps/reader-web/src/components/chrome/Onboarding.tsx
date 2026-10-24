// FIRST VISIT — the old reader's (packages/seed-bible TutorialPrompt and Onboarding's install step): the chapter is
// readable at once, with a small card in the top-right corner offering the guided tour. Answered once on a device (the
// flag is a device preference). Turning the tour down then offers, once, to install the reader — where the browser can
// install it, or on an iPhone with the Share-sheet steps. Signing in is not asked for here: it is in the sidebar, the
// phone's account button and More.
import {
  install,
  installPrompt,
  runningAsApp,
} from "../../state/chrome/fullScreen";
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export const ONBOARDING_KEY = "onboarding:done";
export const INSTALL_OFFER_KEY = "onboarding:install-offered";

const isIos = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

export function Onboarding({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<"none" | "tour" | "install">("none");
  const { prefs } = state.stores;

  useEffect(() => {
    if (state.ui.embed.value) return;
    void prefs.get(ONBOARDING_KEY).then((v) => {
      if (!v) setStage("tour");
    });
  }, []);

  const answered = () => prefs.set(ONBOARDING_KEY, new Date().toISOString());
  const canInstall = () =>
    !runningAsApp() && (!!installPrompt.value || isIos());
  const offerInstall = async () => {
    if (!canInstall() || (await prefs.get(INSTALL_OFFER_KEY)))
      return setStage("none");
    await prefs.set(INSTALL_OFFER_KEY, new Date().toISOString());
    setStage("install");
  };

  if (stage === "tour")
    return (
      <div
        className="sb-tutorial-prompt"
        role="dialog"
        aria-modal="false"
        aria-labelledby="sb-tutorial-prompt-title"
      >
        <h3 className="sb-tutorial-prompt-title" id="sb-tutorial-prompt-title">
          {t("tutorial.promptTitle", {
            defaultValue: "Welcome to Seed Bible. Would you like a tutorial?",
          })}
        </h3>
        <p className="sb-tutorial-prompt-body">
          {t("tutorial.promptBody", {
            defaultValue:
              "A guided tour is available to help you learn the ins and outs of Seed Bible.",
          })}
        </p>
        <div className="sb-tutorial-prompt-actions">
          <button
            type="button"
            className="sb-tutorial-prompt-btn sb-tutorial-prompt-btn-secondary"
            onClick={() => void answered().then(offerInstall)}
          >
            {t("tutorial.promptDecline", { defaultValue: "No, thanks" })}
          </button>
          <button
            type="button"
            className="sb-tutorial-prompt-btn sb-tutorial-prompt-btn-primary"
            onClick={() => {
              setStage("none");
              void answered().then(() => state.tours.start("introduction"));
            }}
          >
            {t("tutorial.promptAccept", { defaultValue: "Take the tour" })}
            <span className="sb-tutorial-prompt-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </div>
    );

  if (stage !== "install") return null;
  const phone =
    typeof matchMedia !== "undefined" &&
    matchMedia("(pointer: coarse)").matches;
  const close = () => setStage("none");
  return (
    <div
      className="sb-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-onboarding-install"
    >
      <div className="sb-onboarding-card">
        <div className="sb-onboarding-icon">
          <span className="material-symbols-outlined">
            {isIos() ? "ios_share" : "install_desktop"}
          </span>
        </div>
        <p className="sb-onboarding-body" id="sb-onboarding-install">
          {t("onboarding.installBodyPre", {
            defaultValue: "Add Seed Bible to your ",
          })}
          <strong>
            {phone || isIos()
              ? t("onboarding.installTargetMobile", {
                  defaultValue: "home screen",
                })
              : t("onboarding.installTargetDesktop", {
                  defaultValue: "desktop",
                })}
          </strong>
          {t("onboarding.installBodyPost", {
            defaultValue:
              " to return anytime. You can always find this option later in Settings.",
          })}
        </p>
        {installPrompt.value ? (
          <div className="sb-onboarding-actions">
            <button
              type="button"
              className="sb-onboarding-btn sb-onboarding-btn-primary"
              onClick={() => void install().finally(close)}
            >
              {t("onboarding.installApp", { defaultValue: "Install App" })}
            </button>
            <button
              type="button"
              className="sb-onboarding-btn sb-onboarding-btn-secondary"
              onClick={close}
            >
              {t("onboarding.maybeLater", { defaultValue: "Maybe later" })}
            </button>
          </div>
        ) : (
          <>
            <p className="sb-onboarding-ios-steps">
              {t("onboarding.iosStepsPre", { defaultValue: "Tap " })}
              <span className="material-symbols-outlined sb-onboarding-inline-icon">
                ios_share
              </span>
              {t("onboarding.iosStepsPost", {
                defaultValue:
                  " in the toolbar, then choose “Add to Home Screen”.",
              })}
            </p>
            <div className="sb-onboarding-actions">
              <button
                type="button"
                className="sb-onboarding-btn sb-onboarding-btn-primary"
                onClick={close}
              >
                {t("onboarding.gotIt", { defaultValue: "Got it" })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
