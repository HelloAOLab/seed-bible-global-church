// THE FRIENDS PANE — the old FriendsPane: your friends on their own, opened from the sidebar, the same section
// Today carries (who is here now, who waits for you to add them back, Add a friend / Invite at your Home).
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { FriendsSection } from "./TodayPane";

export function FriendsPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  return (
    <section
      className="sb-pane sb-friends-pane"
      aria-label={t("friends", { defaultValue: "Friends" })}
    >
      <header className="sb-pane-header">
        <h2>{t("friends", { defaultValue: "Friends" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      <FriendsSection state={state} />
    </section>
  );
}
