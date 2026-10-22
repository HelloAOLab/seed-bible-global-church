// NOTES — the chapter's annotations as a side pane: a draft for the selected verses, each note editable, and a
// note that came back twice from a merge (edited on two devices) shown as a conflict the reader settles.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { Note } from "../../state/records/annotations";

function NoteCard({ state, note }: { state: ReaderState; note: Note }) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note);
  const ref = `${state.reading.bookName.value} ${state.reading.chapterNumber.value}:${note.start === note.end ? note.start : `${note.start}–${note.end}`}`;
  return (
    <article
      className={`sb-note-card${note.conflictOf ? " sb-note-card-conflict" : ""}`}
      data-note-id={note.id}
    >
      <header className="sb-note-card-header">
        <button
          className="sb-note-card-ref"
          onClick={() => state.selection.select(note.start, note.end)}
        >
          {ref}
        </button>
        <span className="sb-note-card-when">{note.updatedAt.slice(0, 10)}</span>
      </header>
      {note.conflictOf && (
        <p className="sb-note-card-conflict-note">
          {t("annotation-conflict", {
            defaultValue:
              "This note was edited on two devices. Both versions are kept until you choose one.",
          })}
        </p>
      )}
      {editing ? (
        <>
          <textarea
            className="sb-note-editor"
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            rows={4}
          />
          <div className="sb-note-card-actions">
            <button
              className="sb-note-button sb-note-button-primary"
              disabled={!text.trim()}
              onClick={() => {
                void state.annotations.edit(chapterRef, note.id, text.trim());
                setEditing(false);
              }}
            >
              {t("save", { defaultValue: "Save" })}
            </button>
            <button
              className="sb-note-button"
              onClick={() => {
                setText(note.note);
                setEditing(false);
              }}
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sb-note-card-body">{note.note}</p>
          <div className="sb-note-card-actions">
            {note.conflictOf ||
            state.annotations
              .forChapter(chapterRef)
              .value.some((n) => n.conflictOf === note.id) ? (
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() =>
                  void state.annotations.resolve(chapterRef, note.id)
                }
              >
                {t("keep-this-version", { defaultValue: "Keep this version" })}
              </button>
            ) : null}
            <button className="sb-note-button" onClick={() => setEditing(true)}>
              {t("edit", { defaultValue: "Edit" })}
            </button>
            <button
              className="sb-note-button sb-note-button-danger"
              onClick={() => void state.annotations.remove(chapterRef, note.id)}
            >
              {t("delete-annotation", { defaultValue: "Delete" })}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function NotesPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const draft = state.ui.noteDraft.value;
  const [text, setText] = useState("");
  const focus = state.ui.focusNoteVerse.value;

  useEffect(() => {
    if (focus === null) return;
    const el = document.querySelector<HTMLElement>(
      `.sb-note-card[data-note-id]`
    );
    const target = notes.find((n) => n.start === focus);
    if (target)
      document
        .querySelector<HTMLElement>(`[data-note-id="${CSS.escape(target.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    else el?.scrollIntoView({ block: "nearest" });
    state.ui.focusNoteVerse.value = null;
  }, [focus]);

  return (
    <section
      className="sb-pane sb-notes-pane"
      aria-label={t("notes", { defaultValue: "Notes" })}
    >
      <header className="sb-pane-header">
        <h2>
          {t("chapter-notes-count", {
            count: notes.length,
            defaultValue: `${notes.length} notes for this chapter`,
          })}
        </h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      {draft && (
        <form
          className="sb-note-card sb-note-card-draft"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void state.annotations.add(
              chapterRef,
              draft.start,
              draft.end,
              text.trim()
            );
            setText("");
            state.ui.noteDraft.value = null;
            state.selection.clear();
          }}
        >
          <header className="sb-note-card-header">
            <span className="sb-note-card-ref">
              {state.reading.bookName.value} {state.reading.chapterNumber.value}
              :
              {draft.start === draft.end
                ? draft.start
                : `${draft.start}–${draft.end}`}
            </span>
          </header>
          <textarea
            className="sb-note-editor"
            rows={4}
            autoFocus
            value={text}
            placeholder={t("note", { defaultValue: "Note" })}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
          <div className="sb-note-card-actions">
            <button
              type="submit"
              className="sb-note-button sb-note-button-primary"
              disabled={!text.trim()}
            >
              {t("save", { defaultValue: "Save" })}
            </button>
            <button
              type="button"
              className="sb-note-button"
              onClick={() => {
                state.ui.noteDraft.value = null;
                setText("");
              }}
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </form>
      )}
      {!notes.length && !draft && (
        <p className="sb-pane-empty">
          {t("select-verses-to-note", {
            defaultValue: "Select a verse and tap Note to write one.",
          })}
        </p>
      )}
      {notes.map((n) => (
        <NoteCard key={n.id} state={state} note={n} />
      ))}
    </section>
  );
}
