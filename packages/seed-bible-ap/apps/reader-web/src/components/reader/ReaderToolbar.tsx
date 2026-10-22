// THE READER TOOLBAR — the floating pill at the bottom of the old reader (`sb-reader-toolbar`): previous / book
// and chapter / next, then notes, theme, and the account.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

function Item(props: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  badge?: number;
}) {
  return (
    <div
      className={`sb-reader-toolbar-item${props.className ? ` ${props.className}` : ""}`}
    >
      <button
        type="button"
        className="sb-reader-toolbar-button"
        aria-label={props.label}
        title={props.label}
        aria-pressed={props.active}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        <span className="material-symbols-outlined">{props.icon}</span>
        {props.badge ? (
          <span className="sb-reader-toolbar-unread-indicator">
            {props.badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

export function ReaderToolbar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, ui, settings } = state;
  const notes = state.annotations.forChapter(reading.chapterRef.value).value
    .length;
  const pending = state.outbox.pending.value;
  const dark = settings.resolvedTheme().id === "dark";
  const togglePane = (p: "notes" | "account" | "content") =>
    (ui.pane.value = ui.pane.value === p ? "none" : p);
  return (
    <nav
      className="sb-reader-toolbar"
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <Item
        icon="chevron_left"
        className="sb-reader-toolbar-item-arrow"
        label={t("previous-chapter", { defaultValue: "Previous Chapter" })}
        disabled={!reading.hasPrev.value}
        onClick={() => void reading.prev()}
      />
      <div className="sb-reader-toolbar-item sb-reader-toolbar-center-item">
        <button
          type="button"
          className="sb-reader-toolbar-button sb-reader-toolbar-center-button"
          onClick={() => (ui.selector.value = "books")}
        >
          {reading.bookName.value} {reading.chapterNumber.value}
        </button>
      </div>
      <Item
        icon="chevron_right"
        className="sb-reader-toolbar-item-arrow"
        label={t("next-chapter", { defaultValue: "Next Chapter" })}
        disabled={!reading.hasNext.value}
        onClick={() => void reading.next()}
      />
      <span className="sb-reader-toolbar-divider" aria-hidden="true" />
      <Item
        icon="sticky_note_2"
        label={t("notes", { defaultValue: "Notes" })}
        active={ui.pane.value === "notes"}
        badge={notes}
        onClick={() => togglePane("notes")}
      />
      <Item
        icon="library_books"
        label={t("your-content", { defaultValue: "Your content" })}
        active={ui.pane.value === "content"}
        onClick={() => togglePane("content")}
      />
      <Item
        icon={dark ? "light_mode" : "dark_mode"}
        label={t("themes", { defaultValue: "Themes" })}
        onClick={() => settings.toggleTheme()}
      />
      <Item
        icon={
          pending
            ? "cloud_upload"
            : state.session.value
              ? "account_circle"
              : "person"
        }
        label={t("account-settings", { defaultValue: "Account settings" })}
        active={ui.pane.value === "account"}
        badge={pending}
        onClick={() => togglePane("account")}
      />
    </nav>
  );
}
