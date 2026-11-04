// SHARED WITH YOU — on Today, what friends shared with this reader (state/social/share.ts): each friend's shelf, read
// by the reader's own agent under the grant their link carried; a note on a passage opens it.
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function SharedWithMe({
  state,
  onOpen,
}: {
  state: ReaderState;
  onOpen: (chapterRef: string) => void;
}) {
  const { t } = useI18n();
  const received = state.sharing.received.value;
  if (!received.length) return null;
  const shelves = state.sharing.shelves.value;
  const profiles = state.today.profiles.value;
  return (
    <div className="sb-today-titled-section">
      <div className="sb-today-titled-section-header">
        <h5>{t("shared-with-you", { defaultValue: "Shared with you" })}</h5>
      </div>
      {received.map((r) => {
        const got = shelves[`${r.from}|${r.shelf}`];
        const friend = state.today.friends.value.find(
          (f) => f.contact.toLowerCase() === r.from
        );
        const who =
          profiles[r.from]?.displayName || friend?.name || r.name || r.from;
        return (
          <div key={`${r.from}|${r.shelf}`} className="sb-content-section">
            <div className="sb-content-section-head">
              <h3 className="sb-content-section-title">{who}</h3>
            </div>
            {!got ? (
              <p className="sb-muted">
                {t("loading", { defaultValue: "Loading…" })}
              </p>
            ) : "error" in got ? (
              <p className="sb-muted">
                {t("shared-unreadable", {
                  defaultValue:
                    "This can't be read right now. They may have stopped sharing it.",
                })}
              </p>
            ) : !got.items.length ? (
              <p className="sb-muted">
                {t("shared-empty", { defaultValue: "Nothing shared yet." })}
              </p>
            ) : (
              <ul className="sb-shared-items">
                {got.items.map((it) => (
                  <li key={it.key} className="sb-shared-item">
                    {it.passage ? (
                      <button
                        type="button"
                        className="sb-content-save"
                        onClick={() => onOpen(it.passage!)}
                      >
                        <span className="sb-content-save-name">{it.title}</span>
                      </button>
                    ) : (
                      <strong>{it.title}</strong>
                    )}
                    <p className="sb-shared-item-text">{it.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
