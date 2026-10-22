// THE VERSE TOOLBAR — what the old BibleReaderToolbar shows over a selection: the reference, the highlight
// swatches, note, clear and close (`sb-verse-toolbar-*` from the copied stylesheet).
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { passageOf } from "../../state/records/marks";

export function VerseToolbar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const verses = state.selection.verses.value;
  if (!verses.length) return null;
  const { reading } = state;
  const chapterRef = reading.chapterRef.value;
  const start = Math.min(...verses);
  const end = Math.max(...verses);
  const ref = `${reading.bookName.value} ${reading.chapterNumber.value}:${start === end ? start : `${start}–${end}`}`;
  const current = state.highlights.forChapter(chapterRef).value.find((h) => {
    const v = h.verse;
    return typeof v === "number"
      ? verses.includes(v)
      : verses.some((n) => n >= v[0] && n <= v[1]);
  });

  return (
    <div
      className="sb-verse-toolbar sb-verse-toolbar-docked"
      role="toolbar"
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <div className="sb-verse-toolbar-ref">
        <span className="sb-verse-toolbar-ref-text">{ref}</span>
      </div>
      <div className="sb-verse-toolbar-tools">
        <div className="sb-verse-toolbar-swatches">
          {state.highlights.colors.map((c) => (
            <button
              key={c}
              className="sb-verse-toolbar-color-button"
              aria-label={
                t("highlight", { defaultValue: "Highlight" }) + ` ${c}`
              }
              aria-pressed={current?.colorId === c}
              onClick={() => {
                void state.highlights.set(chapterRef, start, end, c);
                state.selection.clear();
              }}
            >
              <span
                className={`sb-verse-toolbar-color${current?.colorId === c ? " sb-verse-toolbar-color-active" : ""}`}
                style={{ background: `var(--sb-highlight-${c}-color)` }}
              />
            </button>
          ))}
        </div>
        {state.live.active.value &&
          (state.live.myRole.value === "leader" ||
            state.live.myRole.value === "decorator") && (
            <button
              className="sb-verse-toolbar-action"
              onClick={() => {
                void state.live.decorate(
                  start,
                  end,
                  current?.colorId ?? "yellow"
                );
                state.selection.clear();
              }}
            >
              <span className="material-symbols-outlined sb-verse-toolbar-action-icon">
                campaign
              </span>
              <span className="sb-verse-toolbar-action-label">
                {t("session-show-everyone", { defaultValue: "Show everyone" })}
              </span>
            </button>
          )}
        {[...state.extensions.verseTools.value]
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .filter(
            (tool) =>
              !tool.isVisible ||
              tool.isVisible({ chapterRef, start, end, verses })
          )
          .map((tool) => (
            <button
              key={tool.id}
              className="sb-verse-toolbar-action"
              onClick={() => {
                tool.onSelect({ chapterRef, start, end, verses });
                state.selection.clear();
              }}
            >
              <span className="material-symbols-outlined sb-verse-toolbar-action-icon">
                {tool.icon}
              </span>
              <span className="sb-verse-toolbar-action-label">
                {tool.label}
              </span>
            </button>
          ))}
        {current && (
          <button
            className="sb-verse-toolbar-action sb-verse-toolbar-clear"
            onClick={() => {
              void state.highlights.clear(chapterRef, start, end);
              state.selection.clear();
            }}
          >
            <span className="material-symbols-outlined sb-verse-toolbar-action-icon">
              format_color_reset
            </span>
            <span className="sb-verse-toolbar-action-label">
              {t("clear-highlight", { defaultValue: "Clear highlight" })}
            </span>
          </button>
        )}
        <button
          className="sb-verse-toolbar-action sb-verse-toolbar-annotations"
          onClick={() => {
            state.ui.pane.value = "notes";
            state.ui.noteDraft.value = { start, end };
          }}
        >
          <span className="material-symbols-outlined sb-verse-toolbar-action-icon">
            sticky_note_2
          </span>
          <span className="sb-verse-toolbar-action-label">
            {t("note", { defaultValue: "Note" })}
          </span>
        </button>
        <button
          className="sb-verse-toolbar-action"
          aria-pressed={
            state.saves.forPassage(passageOf(chapterRef, start, end)).length > 0
          }
          onClick={() => {
            void state.saves.toggle(
              chapterRef,
              { start, end },
              reading.translationId.value
            );
            state.selection.clear();
          }}
        >
          <span className="material-symbols-outlined sb-verse-toolbar-action-icon">
            {state.saves.forPassage(passageOf(chapterRef, start, end)).length
              ? "inventory_2"
              : "archive"}
          </span>
          <span className="sb-verse-toolbar-action-label">
            {t("save-verses", { defaultValue: "Save" })}
          </span>
        </button>
        <button
          className="sb-verse-toolbar-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => state.selection.clear()}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}
