// NOTES — the chapter's annotations as a side pane: a TipTap draft for the selected verses (the editor loads on
// first use), each note editable, and a note that came back twice from a merge (edited on two devices) shown as a
// conflict the reader settles. A verse reference typed into a note is a link that opens the chapter.
import { lazy, Suspense } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Editor } from "@tiptap/core";
import { NEEDS_HOME, type ReaderState } from "../../state";
import { estateById } from "../../../../../estate/faithnet";
import { useI18n } from "../../i18n";
import type { Note } from "../../state/records/annotations";
import { isHtmlNote, sanitizeNoteHtml } from "./noteHtml";
import { parseRoute } from "../../state/reading/route";

import { retryChunkImport } from "../../sw/retryChunkImport";

const TipTapEditor = lazy(() =>
  retryChunkImport(() => import("./tiptap/TipTapEditor"))
);

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
  const [copied, setCopied] = useState(false);
  /** A link that opens this chapter with the verses selected and the published note shown in Discover. */
  const shareLink = () => {
    const rec = state.publishing.recordOf(note.id);
    const r = state.reading;
    const base = `${location.origin}/read/${encodeURIComponent(r.translationId.value)}/${encodeURIComponent(r.bookId.value)}/${r.chapterNumber.value}`;
    const v =
      note.start === note.end ? `${note.start}` : `${note.start}-${note.end}`;
    return `${base}?v=${v}${rec ? `&offering=${encodeURIComponent(rec.descriptorId)}` : ""}`;
  };
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
            {published && (
              <button
                className="sb-note-button"
                title={t("note-link-hint", {
                  defaultValue:
                    "A link that opens these verses with your published note",
                })}
                onClick={() => {
                  void navigator.clipboard?.writeText(shareLink());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <span className="material-symbols-outlined">
                  {copied ? "check" : "link"}
                </span>{" "}
                {copied
                  ? t("link-copied", { defaultValue: "Copied" })
                  : t("copy-link", { defaultValue: "Copy link" })}
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
        <p className="sb-pane-error">
          {state.publishing.error.value}
          {NEEDS_HOME.test(state.publishing.error.value) && (
            <>
              {" "}
              {t("first-run-playbook", {
                defaultValue:
                  "Your agent does not offer the reader's behaviour yet. Open your Home once — it gives your agent the behaviour by itself — then come back here: the reader retries on its own.",
              })}{" "}
              <a
                href={`${estateById(state.session.value?.estate)?.home ?? "https://www.faithnet.me"}/`}
                target="_blank"
                rel="noreferrer"
              >
                {t("open-home", { defaultValue: "Open your Home" })}
              </a>
            </>
          )}
        </p>
      )}
      {!draft && state.selection.verses.value.length > 0 && (
        <button
          type="button"
          className="sb-note-button sb-note-button-primary sb-note-on-selection"
          onClick={() => {
            const v = state.selection.verses.value;
            state.ui.noteDraft.value = {
              start: Math.min(...v),
              end: Math.max(...v),
            };
          }}
        >
          {t("note-on-selection", {
            ref: `${state.reading.bookName.value} ${state.reading.chapterNumber.value}:${(() => {
              const v = state.selection.verses.value;
              const lo = Math.min(...v);
              const hi = Math.max(...v);
              return lo === hi ? `${lo}` : `${lo}–${hi}`;
            })()}`,
            defaultValue: "Write a note on {{ref}}",
          })}
        </button>
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
