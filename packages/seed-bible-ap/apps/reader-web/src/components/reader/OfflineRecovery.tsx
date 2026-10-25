// SAVE IT FOR OFFLINE? — the old reader's OfflineRecoveryToast: once a chapter that failed to load comes back on
// Reload, a small card in the corner offers to keep that translation on the device, so the next dropped connection
// doesn't leave the reader stuck again. A card rather than a window: the chapter is back, and this shouldn't stand
// between the reader and it.
import { useEffect } from "preact/hooks";
import type { ReaderState } from "../../state";
import type { Translation } from "../../backend/bible";
import { useI18n } from "../../i18n";
import { CANCELLED } from "../../state/reading/offlineTranslations";

/** Download a translation and say how it went ("BSB is now available offline"). */
export async function downloadWithToast(state: ReaderState, tr: Translation) {
  try {
    await state.offline.download(tr);
    if (state.offline.has(tr.id))
      state.ui.toast.value = {
        key: "translation-downloaded",
        values: { name: tr.shortName },
      };
  } catch (e) {
    if ((e as Error)?.message !== CANCELLED)
      state.ui.toast.value = {
        key: "translation-download-failed",
        values: { name: tr.shortName },
      };
  }
}

export function OfflineRecovery({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const tr = state.offline.recoveryOffer.value;
  const dismiss = () => (state.offline.recoveryOffer.value = null);
  useEffect(() => {
    if (!tr) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tr]);
  if (!tr) return null;
  return (
    <div
      className="sb-offline-recovery"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sb-offline-recovery-title"
    >
      <h3 className="sb-offline-recovery-title" id="sb-offline-recovery-title">
        {t("offlineRecovery.title", {
          abbreviation: tr.shortName,
          defaultValue: "Save {{abbreviation}} for offline reading?",
        })}
      </h3>
      <p className="sb-offline-recovery-body">
        {t("offlineRecovery.body", {
          defaultValue:
            "That chapter didn't load the first time. With a download, you can keep reading even when your connection drops.",
        })}
      </p>
      <div className="sb-offline-recovery-actions">
        <button
          type="button"
          className="sb-offline-recovery-btn sb-offline-recovery-btn-secondary"
          onClick={dismiss}
        >
          {t("offlineRecovery.notNow", { defaultValue: "Not now" })}
        </button>
        <button
          type="button"
          className="sb-offline-recovery-btn sb-offline-recovery-btn-primary"
          onClick={() => {
            dismiss();
            void downloadWithToast(state, tr);
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            download
          </span>
          {t("offlineRecovery.download", { defaultValue: "Download" })}
        </button>
      </div>
    </div>
  );
}
