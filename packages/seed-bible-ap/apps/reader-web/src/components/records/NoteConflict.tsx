// THIS NOTE CHANGED IN TWO PLACES — the old reader's AnnotationConflictModal: when a note on the open chapter came
// back from the Library twice (edited on two devices from the same copy), a window shows both — Your version (the
// edit that arrived second, usually this device's) and The other version — to tick one or both, then Confirm; "1 of N
// notes to review" when there are more. Both is the merge (one note, both texts). ✕ leaves the choice to the Notes
// pane, where both copies stay with Keep this version.
import { useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { bodyHtml } from "./NotesPane";

function VersionCard(props: {
  label: string;
  when: string | null;
  html: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`sb-annotation-conflict-version${props.selected ? " sb-annotation-conflict-version-selected" : ""}`}
      role="checkbox"
      aria-checked={props.selected}
      tabIndex={0}
      onClick={props.onToggle}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          props.onToggle();
        }
      }}
    >
      <div className="sb-annotation-conflict-version-header">
        <span className="sb-annotation-conflict-checkbox" aria-hidden="true" />
        <span className="sb-annotation-conflict-version-label">
          {props.label}
          {props.when && (
            <span className="sb-annotation-conflict-version-time">
              {" "}
              — {props.when}
            </span>
          )}
        </span>
      </div>
      <div
        className="sb-annotation-conflict-body"
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    </div>
  );
}

export function NoteConflict({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const [mine, setMine] = useState(false);
  const [theirs, setTheirs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const pairs = notes
    .filter((n) => n.conflictOf && !closed.includes(n.id))
    .map((copy) => ({
      copy,
      original: notes.find((n) => n.id === copy.conflictOf),
    }))
    .filter((p) => !!p.original);
  const first = pairs[0];
  if (!first) return null;
  const { copy, original } = first;
  const fmt = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(language, {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(iso))
      : null;
  const title = t("annotation-conflict-title", {
    defaultValue: "This note changed in two places",
  });
  const reset = () => {
    setMine(false);
    setTheirs(false);
  };
  const confirm = async () => {
    setBusy(true);
    try {
      if (mine && theirs) await state.annotations.merge(chapterRef, copy.id);
      else if (mine) await state.annotations.resolve(chapterRef, copy.id);
      else if (theirs)
        await state.annotations.resolve(chapterRef, original!.id);
    } catch {
      state.ui.toast.value = { key: "annotation-conflict-resolve-failed" };
    }
    setBusy(false);
    reset();
  };
  return (
    <div className="sb-footnote-modal-overlay">
      <div
        className="sb-footnote-modal sb-annotation-conflict-modal"
        role="dialog"
        aria-label={title}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => {
              setClosed([...closed, copy.id]);
              reset();
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          <div className="sb-annotation-conflict">
            <p className="sb-annotation-conflict-message">
              {t("annotation-conflict-message", {
                defaultValue:
                  "You changed this note on this device, and it also changed somewhere else. Which do you want to keep?",
              })}
            </p>
            {pairs.length > 1 && (
              <p className="sb-annotation-conflict-progress">
                {t("annotation-conflict-progress", {
                  defaultValue: "1 of {{total}} notes to review",
                  total: pairs.length,
                })}
              </p>
            )}
            <div className="sb-annotation-conflict-versions">
              <VersionCard
                label={t("annotation-conflict-yours", {
                  defaultValue: "Your version",
                })}
                when={fmt(copy.updatedAt)}
                html={bodyHtml(copy.note)}
                selected={mine}
                onToggle={() => !busy && setMine(!mine)}
              />
              <VersionCard
                label={t("annotation-conflict-theirs", {
                  defaultValue: "The other version",
                })}
                when={fmt(original!.updatedAt)}
                html={bodyHtml(original!.note)}
                selected={theirs}
                onToggle={() => !busy && setTheirs(!theirs)}
              />
            </div>
            <div className="sb-annotation-conflict-actions">
              <button
                type="button"
                className="sb-annotation-conflict-confirm"
                disabled={busy || (!mine && !theirs)}
                onClick={() => void confirm()}
              >
                {t("annotation-conflict-confirm", { defaultValue: "Confirm" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
