// SYNC DEVICE CONTENT? — the old reader's AdoptDeviceContentModal: signing in on a device that holds highlights or
// notes made signed out asks whether they join this account. Add to account keeps them as yours; Don't add takes
// them off the device. Nothing is sent until there is an answer.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function AdoptPrompt({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const p = state.ui.adoptPrompt.value;
  if (!p) return null;
  const content =
    p.kinds.length === 2
      ? t("adopt-device-content-kind-both", {
          defaultValue: "highlights and notes",
        })
      : p.kinds[0] === "notes"
        ? t("adopt-device-content-kind-notes", { defaultValue: "notes" })
        : t("adopt-device-content-kind-highlights", {
            defaultValue: "highlights",
          });
  const title = t("adopt-device-content-title", {
    defaultValue: "Sync device content?",
  });
  return (
    <div className="sb-footnote-modal-overlay">
      <div className="sb-footnote-modal" role="dialog" aria-label={title}>
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
        </div>
        <div className="sb-footnote-modal-content">
          <div className="sb-adopt-device-content">
            <p>
              {t("adopt-device-content-message", {
                defaultValue:
                  "This device is storing {{content}} that are not associated with any account. Do you want to add them to your account?",
                content,
              })}
            </p>
            <div className="sb-adopt-device-content-actions">
              <button type="button" onClick={() => p.resolve("discard")}>
                {t("adopt-device-content-skip", { defaultValue: "Don't add" })}
              </button>
              <button
                type="button"
                className="sb-adopt-device-content-add"
                onClick={() => p.resolve("add")}
              >
                {t("adopt-device-content-add", {
                  defaultValue: "Add to account",
                })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
