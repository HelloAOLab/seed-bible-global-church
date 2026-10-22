// NOTES — the chapter's annotations as a side pane: a TipTap draft for the selected verses (the editor loads on
// first use), each note editable, and a note that came back twice from a merge (edited on two devices) shown as a
// conflict the reader settles. A verse reference typed into a note is a link that opens the chapter.
import { lazy, Suspense } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Editor } from "@tiptap/core";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { Note } from "../../state/records/annotations";
import { isHtmlNote, sanitizeNoteHtml } from "./noteHtml";
import { parseRoute } from "../../state/reading/route";

const TipTapEditor = lazy(() => import("./tiptap/TipTapEditor"));

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** A note's body as safe HTML: TipTap output sanitized, plain text of the first cut paragraphed. */
const bodyHtml = (note: string) =>
  isHtmlNote(note)
    ? sanitizeNoteHtml(note)
    : `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>`;

export function NoteEditor(props: {
  initial?: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  saveLabel: string;
  cancelLabel: string;
}) {
  const editorRef = useRef<Editor | null>(null);
  const [empty, setEmpty] = useState(!props.initial);
  const save = () => {
    const html = editorRef.current?.getHTML() ?? "";
    if (!html || editorRef.current?.isEmpty) return;
    props.onSave(html);
  };
  return (
    <>
      <Suspense
        fallback={<div className="sb-note-editor sb-note-editor-loading" />}
      >
        <TipTapEditor
          className="sb-note-editor-tiptap"
          initialContent={props.initial}
          onEditor={(e) => (editorRef.current = e)}
          onEmptyChange={setEmpty}
          onModEnter={save}
          autofocus="end"
        />
      </Suspense>
      <div className="sb-note-card-actions">
        <button
          type="button"
          className="sb-note-button sb-note-button-primary"
          disabled={empty}
          onClick={save}
        >
          {props.saveLabel}
        </button>
        <button
          type="button"
          className="sb-note-button"
          onClick={props.onCancel}
        >
          {props.cancelLabel}
        </button>
      </div>
    </>
  );
}

function NoteCard({ state, note }: { state: ReaderState; note: Note }) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const [editing, setEditing] = useState(false);
  const ref = `${state.reading.bookName.value} ${state.reading.chapterNumber.value}:${note.start === note.end ? note.start : `${note.start}–${note.end}`}`;
  const published = state.publishing.isPublished(note.id);
  const publishing = state.publishing.busy.value === note.id;
  const canPublish = !!state.session.value && state.session.value.wire;
  const hasConflictCopy = state.annotations
    .forChapter(chapterRef)
    .value.some((n) => n.conflictOf === note.id);
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
        <NoteEditor
          initial={isHtmlNote(note.note) ? note.note : bodyHtml(note.note)}
          saveLabel={t("save", { defaultValue: "Save" })}
          cancelLabel={t("cancel", { defaultValue: "Cancel" })}
          onSave={(html) => {
            void state.annotations.edit(chapterRef, note.id, html);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div
            className="sb-note-card-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml(note.note) }}
          />
          <div className="sb-note-card-actions">
            {(note.conflictOf || hasConflictCopy) && (
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() =>
                  void state.annotations.resolve(chapterRef, note.id)
                }
              >
                {t("keep-this-version", { defaultValue: "Keep this version" })}
              </button>
            )}
            <button className="sb-note-button" onClick={() => setEditing(true)}>
              {t("edit", { defaultValue: "Edit" })}
            </button>
            {canPublish && !note.conflictOf && (
              <button
                className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                disabled={publishing}
                title={
                  published
                    ? t("withdraw-note", { defaultValue: "Make private again" })
                    : t("publish-note", {
                        defaultValue: "Publish to your public shelf",
                      })
                }
                onClick={() =>
                  void (
                    published
                      ? state.publishing.withdrawNote(note)
                      : state.publishing.publishNote(
                          chapterRef,
                          note,
                          `${ref} — ${state.session.value?.name ?? ""}`.replace(
                            / — $/,
                            ""
                          )
                        )
                  ).catch(() => {})
                }
              >
                <span className="material-symbols-outlined">
                  {published ? "public_off" : "public"}
                </span>{" "}
                {publishing
                  ? "…"
                  : published
                    ? t("published", { defaultValue: "Published" })
                    : t("publish", { defaultValue: "Publish" })}
              </button>
            )}
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
  const focus = state.ui.focusNoteVerse.value;

  useEffect(() => {
    if (focus === null) return;
    const target = notes.find((n) => n.start === focus);
    if (target)
      document
        .querySelector<HTMLElement>(`[data-note-id="${CSS.escape(target.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    state.ui.focusNoteVerse.value = null;
  }, [focus]);

  // A verse-reference link inside a note opens the chapter here instead of leaving the page.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
      "a.sb-verse-reference-link"
    );
    if (!a) return;
    e.preventDefault();
    const r = parseRoute(a.getAttribute("href") ?? "");
    if (!r) return;
    const verse = a.dataset["verse"];
    void state.reading
      .goTo(state.reading.translationId.value, r.bookId, r.chapterNumber)
      .then(() => {
        if (!verse) return;
        const [s, en] = verse.split("-").map(Number);
        state.selection.select(s!, en ?? s!);
      });
  };

  return (
    <section
      className="sb-pane sb-notes-pane"
      aria-label={t("notes", { defaultValue: "Notes" })}
      onClick={onClick}
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
        <div className="sb-note-card sb-note-card-draft">
          <header className="sb-note-card-header">
            <span className="sb-note-card-ref">
              {state.reading.bookName.value} {state.reading.chapterNumber.value}
              :
              {draft.start === draft.end
                ? draft.start
                : `${draft.start}–${draft.end}`}
            </span>
          </header>
          <NoteEditor
            saveLabel={t("save", { defaultValue: "Save" })}
            cancelLabel={t("cancel", { defaultValue: "Cancel" })}
            onSave={(html) => {
              void state.annotations.add(
                chapterRef,
                draft.start,
                draft.end,
                html
              );
              state.ui.noteDraft.value = null;
              state.selection.clear();
            }}
            onCancel={() => (state.ui.noteDraft.value = null)}
          />
        </div>
      )}
      {state.publishing.error.value && (
        <p className="sb-pane-error">{state.publishing.error.value}</p>
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
