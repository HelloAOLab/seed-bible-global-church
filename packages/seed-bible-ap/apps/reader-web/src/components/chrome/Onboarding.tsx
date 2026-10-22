// FIRST VISIT — ported in shape from packages/seed-bible Onboarding: one card over the reader on the first visit of
// a device: what this is, sign in with the Home or just read, and install the app where the browser offers it.
// Dismissed once; the flag is a device preference.
import { installPrompt } from "../../state/chrome/fullScreen";
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  DEFAULT_ESTATE,
  HOME_SIGNIN_AVAILABLE,
  connectViaHome,
} from "../../session";
import { estateById } from "../../../../../estate/faithnet";

export const ONBOARDING_KEY = "onboarding:done";

export function Onboarding({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");
  const estate = estateById(DEFAULT_ESTATE)!;
  const standalone =
    typeof matchMedia !== "undefined" &&
    matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    if (state.ui.embed.value || state.session.value) return;
    void state.stores.prefs.get(ONBOARDING_KEY).then((v) => {
      if (!v) setShow(true);
    });
  }, []);

  const done = async () => {
    setShow(false);
    await state.stores.prefs.set(ONBOARDING_KEY, new Date().toISOString());
  };
  if (!show) return null;

  return (
    <div
      className="sb-onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-onboarding-title"
    >
      <div className="sb-onboarding-card">
        <div className="sb-onboarding-icon">
          <span className="material-symbols-outlined">menu_book</span>
        </div>
        <h2 id="sb-onboarding-title" className="sb-onboarding-title">
          {t("onboarding-title", { defaultValue: "Welcome to Seed Bible" })}
        </h2>
        <div className="sb-onboarding-body">
          <p>
            {t("onboarding-read", {
              defaultValue:
                "Read any translation, highlight, write notes, keep bookmarks — it all works right here on this device, even offline.",
            })}
          </p>
          <p>
            {t("onboarding-home", {
              defaultValue:
                "Sign in with your Home and your marks go to your own Library, through your own agent — nothing of yours is kept by this app.",
            })}
          </p>
          <p>
            {t("onboarding-together", {
              defaultValue:
                "Read together: start a live session and friends follow you; publish a note and it reaches their Today.",
            })}
          </p>
        </div>
        <div className="sb-onboarding-actions">
          {HOME_SIGNIN_AVAILABLE && (
            <button
              className="sb-onboarding-btn sb-onboarding-btn-primary"
              disabled={!!busy}
              onClick={() => {
                setBusy("signin");
                void connectViaHome(DEFAULT_ESTATE)
                  .then((s) => s && state.signIn(s))
                  .finally(() => done());
              }}
            >
              {t("sign-in-with", {
                name: estate.label,
                defaultValue: `Sign in with ${estate.label}`,
              })}
            </button>
          )}
          <button
            className="sb-onboarding-btn sb-onboarding-btn-secondary"
            onClick={() => void done()}
          >
            {t("onboarding-just-read", { defaultValue: "Just read" })}
          </button>
          <button
            className="sb-onboarding-btn sb-onboarding-btn-tertiary"
            onClick={() =>
              void done().then(() => state.tours.start("introduction"))
            }
          >
            {t("onboarding-tour", { defaultValue: "Take the tour" })}
          </button>
          {installPrompt.value && !standalone && (
            <button
              className="sb-onboarding-btn sb-onboarding-btn-tertiary"
              onClick={() => {
                const p = installPrompt.value;
                installPrompt.value = null;
                void p?.prompt().then(() => done());
              }}
            >
              <span className="material-symbols-outlined sb-onboarding-inline-icon">
                install_mobile
              </span>{" "}
              {t("onboarding-install", { defaultValue: "Install the app" })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
