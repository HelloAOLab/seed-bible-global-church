// NOTES — the chapter's notes as the old reader shows them (packages/seed-bible DiscoverPane/AnnotationsSection): in
// groups by the verses they are on (a note on the whole chapter has its own), each with its author and when it was
// last changed, a ⋮ with Edit and Delete (Delete asks first) — and here also Publish and Copy link. A TipTap draft
// (loaded on first use) follows the selected verses while it is open; with none selected it is on the whole chapter.
// A note that came back twice from a merge (edited on two devices) shows as a conflict the reader settles. A verse
// reference typed into a note is a link that opens the chapter.
import { lazy, Suspense } from "preact/compat";
import { Component, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { MenuButton, MenuItem } from "../chrome/ContextMenu";
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

/** Falls back when the rich editor cannot be loaded (offline, a failed download): `onFail` takes over. */
class EditorBoundary extends Component<
  { onFail: () => void; children: ComponentChildren },
  { failed: boolean }
> {
  override state = { failed: false };
  override componentDidCatch() {
    // Its own state change is what tells Preact the error was handled here.
    this.setState({ failed: true });
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Plain text as the note's HTML: paragraphs, line breaks kept. */
const plainToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

export function NoteEditor(props: {
  initial?: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  saveLabel: string;
  cancelLabel: string;
}) {
  const { t } = useI18n();
  const editorRef = useRef<Editor | null>(null);
  const [empty, setEmpty] = useState(!props.initial);
  // The old reader's PlainTextAnnotationEditor: a text box when the rich editor could not be loaded.
  const [plain, setPlain] = useState<string | null>(null);
  const save = () => {
    if (plain !== null) {
      if (plain.trim()) props.onSave(plainToHtml(plain.trim()));
      return;
    }
    const html = editorRef.current?.getHTML() ?? "";
    if (!html || editorRef.current?.isEmpty) return;
    props.onSave(html);
  };
  const toPlain = () => {
    const div = document.createElement("div");
    div.innerHTML = sanitizeNoteHtml(props.initial ?? "");
    setPlain(div.innerText ?? "");
  };
  return (
    <>
      {plain !== null ? (
        <>
          <textarea
            className="sb-note-editor sb-note-editor-plain"
            rows={5}
            value={plain}
            autoFocus
            aria-label={t("note", { defaultValue: "Note" })}
            onInput={(e) => {
              const v = (e.target as HTMLTextAreaElement).value;
              setPlain(v);
              setEmpty(!v.trim());
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
          />
          <p className="sb-small sb-muted">
            {t("plain-editor-note", {
              defaultValue:
                "The full editor could not be loaded, so this is plain text.",
            })}
          </p>
        </>
      ) : (
        <EditorBoundary onFail={toPlain}>
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
        </EditorBoundary>
      )}
      <div className="sb-note-card-actions">
        <button
          type="button"
          className="sb-note-button sb-note-button-primary"
          disabled={empty}
          title={
            MAC
              ? t("save-shortcut-mac", { defaultValue: "Save (⌘+Enter)" })
              : t("save-shortcut", { defaultValue: "Save (Ctrl+Enter)" })
          }
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

/** "John 3:16", "John 3:16–18", or "John 3" for a note on the whole chapter. */
function rangeLabel(state: ReaderState, n: { start: number; end: number }) {
  const ch = `${state.reading.bookName.value} ${state.reading.chapterNumber.value}`;
  if (n.start <= 0) return ch;
  return `${ch}:${n.start === n.end ? n.start : `${n.start}–${n.end}`}`;
}

/** Your face beside your notes: your picture, or the account icon. */
function Author({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const pic = state.profile.mine.value?.picture;
  return (
    <span className="sb-annotation-comment-author">
      {pic ? (
        <span className="sb-tab-user-icon sb-tab-user-icon-has-image">
          <img className="sb-tab-user-icon-image" src={pic} alt="" />
        </span>
      ) : (
        <span className="sb-tab-user-icon sb-tab-user-icon-generic">
          <span className="material-symbols-outlined">account_circle</span>
        </span>
      )}
      <span className="sb-annotation-comment-author-name">
        {t("you", { defaultValue: "You" })}
      </span>
    </span>
  );
}

function NoteItem({
  state,
  note,
  onDelete,
}: {
  state: ReaderState;
  note: Note;
  onDelete: (n: Note) => void;
}) {
  const { t, language } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const [editing, setEditing] = useState(false);
  const ref = rangeLabel(state, note);
  const published = state.publishing.isPublished(note.id);
  const publishing = state.publishing.busy.value === note.id;
  /** A link that opens this chapter with the verses selected and the published note shown in Discover. */
  const shareLink = () => {
    const rec = state.publishing.recordOf(note.id);
    const r = state.reading;
    const base = `${location.origin}/read/${encodeURIComponent(r.translationId.value)}/${encodeURIComponent(r.bookId.value)}/${r.chapterNumber.value}`;
    const v = note.whole
      ? ""
      : `v=${note.start === note.end ? `${note.start}` : `${note.start}-${note.end}`}`;
    const o = rec ? `offering=${encodeURIComponent(rec.descriptorId)}` : "";
    const q = [v, o].filter(Boolean).join("&");
    return q ? `${base}?${q}` : base;
  };
  const canPublish = !!state.session.value && state.session.value.wire;
  const hasConflictCopy = state.annotations
    .forChapter(chapterRef)
    .value.some((n) => n.conflictOf === note.id);
  const when = note.updatedAt
    ? new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(note.updatedAt))
    : "";
  const togglePublish = () =>
    void (
      published
        ? state.publishing.withdrawNote(note)
        : state.publishing.publishNote(
            chapterRef,
            note,
            `${ref} — ${state.session.value?.name ?? ""}`.replace(/ — $/, "")
          )
    ).catch(() => {});

  return (
    <li
      className={`sb-annotation-item sb-note-card${note.conflictOf ? " sb-note-card-conflict" : ""}`}
      data-note-id={note.id}
      dir="auto"
      onClick={(e: MouseEvent) => {
        if (editing || note.whole) return;
        if ((e.target as HTMLElement).closest("a, button, [contenteditable]"))
          return;
        state.selection.select(note.start, note.end);
      }}
    >
      {editing ? (
        <div className="sb-annotation-item-main">
          <NoteEditor
            initial={isHtmlNote(note.note) ? note.note : bodyHtml(note.note)}
            saveLabel={t("save", { defaultValue: "Save" })}
            cancelLabel={t("cancel", { defaultValue: "Cancel" })}
            onSave={(html) => {
              void state.annotations
                .edit(chapterRef, note.id, html)
                .then(
                  () => (state.ui.toast.value = { key: "annotation-saved" })
                )
                .catch(
                  () =>
                    (state.ui.toast.value = { key: "annotation-save-failed" })
                );
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="sb-annotation-item-main">
          {note.conflictOf && (
            <p className="sb-note-card-conflict-note">
              {t("annotation-conflict", {
                defaultValue:
                  "This note was edited on two devices. Both versions are kept until you choose one.",
              })}
            </p>
          )}
          <div
            className="sb-annotation-item-preview sb-note-card-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml(note.note) }}
          />
          <span className="sb-annotation-comment-meta">
            <Author state={state} />
            {when && (
              <span className="sb-annotation-comment-updated">| {when}</span>
            )}
            {published && (
              <span className="sb-note-published-tag">
                <span className="material-symbols-outlined" aria-hidden="true">
                  public
                </span>{" "}
                {t("published", { defaultValue: "Published" })}
              </span>
            )}
          </span>
          {(note.conflictOf || hasConflictCopy) && (
            <div className="sb-note-card-actions">
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() =>
                  void state.annotations.resolve(chapterRef, note.id)
                }
              >
                {t("keep-this-version", { defaultValue: "Keep this version" })}
              </button>
              {note.conflictOf && (
                <button
                  className="sb-note-button"
                  onClick={() =>
                    void state.annotations.merge(chapterRef, note.id)
                  }
                >
                  {t("keep-both-merged", {
                    defaultValue: "Keep both, merged",
                  })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!editing && (
        <MenuButton
          label={t("annotation-options", {
            defaultValue: "Annotation options",
          })}
          buttonClassName="sb-annotation-item-menu"
          menuClassName="sb-tab-menu"
        >
          <MenuItem icon="edit" onSelect={() => setEditing(true)}>
            {t("edit-annotation", { defaultValue: "Edit" })}
          </MenuItem>
          {canPublish && !note.conflictOf && (
            <MenuItem
              icon={published ? "public_off" : "public"}
              onSelect={togglePublish}
            >
              {publishing
                ? "…"
                : published
                  ? t("withdraw-note", { defaultValue: "Make private again" })
                  : t("publish-note-menu", {
                      defaultValue: "Publish to your public shelf",
                    })}
            </MenuItem>
          )}
          {published && (
            <MenuItem
              icon="link"
              onSelect={() => {
                void navigator.clipboard?.writeText(shareLink());
                state.ui.toast.value = { key: "link-copied" };
              }}
            >
              {t("copy-link", { defaultValue: "Copy link" })}
            </MenuItem>
          )}
          <MenuItem
            icon="delete"
            className="sb-context-menu-item--danger"
            onSelect={() => onDelete(note)}
          >
            {t("delete-annotation", { defaultValue: "Delete" })}
          </MenuItem>
        </MenuButton>
      )}
    </li>
  );
}

/** One verse range's notes: a header that folds them away, then the notes. */
function NoteGroup(props: {
  state: ReaderState;
  label: string;
  notes: Note[];
  highlighted: boolean;
  onDelete: (n: Note) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`sb-annotation-group${props.highlighted ? " sb-annotation-group--highlighted" : ""}`}
    >
      <button
        type="button"
        className="sb-annotation-group-header"
        aria-expanded={open}
        aria-label={
          open
            ? t("annotation-group-collapse", { defaultValue: "Collapse group" })
            : t("annotation-group-expand", { defaultValue: "Expand group" })
        }
        onClick={() => setOpen(!open)}
      >
        <span className="sb-annotation-group-header-title">{props.label}</span>
        <span
          className={`material-symbols-outlined sb-annotation-group-header-icon${open ? "" : " sb-annotation-group-header-icon--collapsed"}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && (
        <ul className="sb-annotation-group-list">
          {props.notes.map((n) => (
            <NoteItem
              key={n.id}
              state={props.state}
              note={n}
              onDelete={props.onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotesPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const draft = state.ui.noteDraft.value;
  const focus = state.ui.focusNoteVerse.value;
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const selected = state.selection.verses.value;

  // The draft follows the verses chosen while it is open (the old reader's), whole chapter when none are.
  useEffect(() => {
    if (!draft || !selected.length) return;
    const start = Math.min(...selected);
    const end = Math.max(...selected);
    if (draft.start !== start || draft.end !== end)
      state.ui.noteDraft.value = { start, end };
  }, [selected.join(), !!draft]);

  const groups: Array<{ key: string; label: string; notes: Note[] }> = [];
  for (const n of notes) {
    const key = n.whole ? "chapter" : `${n.start}-${n.end}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.notes.push(n);
    else groups.push({ key, label: rangeLabel(state, n), notes: [n] });
  }

  useEffect(() => {
    if (focus === null) return;
    const g = groups.find((x) =>
      x.notes.some((n) => !n.whole && n.start <= focus && focus <= n.end)
    );
    if (g) {
      setFlash(g.key);
      setTimeout(() => setFlash(null), 1600);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-note-id="${CSS.escape(g.notes[0]!.id)}"]`
          )
          ?.scrollIntoView({ block: "center" })
      );
    }
    state.ui.focusNoteVerse.value = null;
  }, [focus]);

  // A verse-reference link inside a note opens the chapter here instead of leaving the page.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>(
      "a.sb-verse-reference-link"
    );
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
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

  /** Create a note: on the chosen verses, or on the whole chapter when none are chosen. */
  const createNote = () => {
    const v = state.selection.verses.value;
    state.ui.noteDraft.value = v.length
      ? { start: Math.min(...v), end: Math.max(...v) }
      : { start: 0, end: 0 };
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
            <span className="sb-note-card-ref">{rangeLabel(state, draft)}</span>
          </header>
          <NoteEditor
            saveLabel={t("save", { defaultValue: "Save" })}
            cancelLabel={t("cancel", { defaultValue: "Cancel" })}
            onSave={(html) => {
              void state.annotations
                .add(chapterRef, draft.start, draft.end, html)
                .then(
                  () => (state.ui.toast.value = { key: "annotation-saved" })
                )
                .catch(
                  () =>
                    (state.ui.toast.value = { key: "annotation-save-failed" })
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
      {!draft && selected.length > 0 && (
        <button
          type="button"
          className="sb-note-button sb-note-button-primary sb-note-on-selection"
          onClick={createNote}
        >
          {t("note-on-selection", {
            ref: rangeLabel(state, {
              start: Math.min(...selected),
              end: Math.max(...selected),
            }),
            defaultValue: "Write a note on {{ref}}",
          })}
        </button>
      )}
      {!notes.length && !draft ? (
        <div className="sb-discover-empty">
          {t("discover-annotations-empty", {
            defaultValue: "You don't have any notes for this chapter.",
          })}{" "}
          <button
            type="button"
            className="sb-discover-empty-action"
            onClick={createNote}
          >
            {t("discover-annotations-empty-create", {
              defaultValue: "Create a note",
            })}
          </button>
        </div>
      ) : (
        groups.map((g) => (
          <NoteGroup
            key={g.key}
            state={state}
            label={g.label}
            notes={g.notes}
            highlighted={flash === g.key}
            onDelete={setDeleting}
          />
        ))
      )}
      {deleting && (
        <div
          className="sb-footnote-modal-overlay"
          onClick={() => setDeleting(null)}
        >
          <div
            className="sb-footnote-modal sb-content-dialog"
            role="dialog"
            aria-label={t("delete-annotation-confirm-title", {
              defaultValue: "Delete annotation?",
            })}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="sb-footnote-modal-header">
              <h3 className="sb-footnote-modal-title">
                {t("delete-annotation-confirm-title", {
                  defaultValue: "Delete annotation?",
                })}
              </h3>
            </div>
            <div className="sb-confirm-delete">
              <p className="sb-confirm-delete-message">
                {t("delete-annotation-confirm-message", {
                  defaultValue: "Delete this annotation? This can't be undone.",
                })}
              </p>
              <div className="sb-confirm-delete-actions">
                <button
                  type="button"
                  className="sb-note-button"
                  onClick={() => setDeleting(null)}
                >
                  {t("cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  className="sb-note-button sb-note-button-danger"
                  onClick={() => {
                    const n = deleting;
                    setDeleting(null);
                    void state.annotations.remove(chapterRef, n.id).catch(
                      () =>
                        (state.ui.toast.value = {
                          key: "annotation-delete-failed",
                        })
                    );
                  }}
                >
                  {t("delete", { defaultValue: "Delete" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
