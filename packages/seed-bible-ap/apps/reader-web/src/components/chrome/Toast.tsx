// A short line at the foot of the screen that goes by itself (state `ui.toast`): "Signed in as Ruth".
import { useEffect } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

const SHOWN_MS = 3500;

export function Toast({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const toast = state.ui.toast.value;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => (state.ui.toast.value = null), SHOWN_MS);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="sb-toast" role="status">
      {toast.key === "signed-in-as"
        ? t("signed-in-as", {
            defaultValue: "Signed in as {{name}}",
            name: toast.values?.["name"] ?? "",
          })
        : toast.key}
    </div>
  );
}
