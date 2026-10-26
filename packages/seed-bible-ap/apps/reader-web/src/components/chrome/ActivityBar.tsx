// The moving line at the very top while something the reader tapped is still working (state/chrome/activity.ts).
// It waits a moment before showing, so a quick answer never flashes it.
import { useEffect, useState } from "preact/hooks";
import { useI18n } from "../../i18n";
import { activity } from "../../state/chrome/activity";

const SHOW_AFTER_MS = 150;

export function ActivityBar() {
  const { t } = useI18n();
  const busy = activity.busy.value > 0;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!busy) return setShown(false);
    const id = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [busy]);
  if (!shown) return null;
  return (
    <div
      className="sb-activity-bar"
      role="progressbar"
      aria-label={t("working", { defaultValue: "Working…" })}
    />
  );
}
