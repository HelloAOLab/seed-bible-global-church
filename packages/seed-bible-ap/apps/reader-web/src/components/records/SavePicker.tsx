// SAVE WINDOW — the old reader's SaveCategoryPicker (packages/seed-bible components/Tabs): one window for every Save
// (the verse toolbar, the chapter's ☆, a tab's ☆, Edit save). Tick any number of folders; "Add to new" stages a
// folder that is only made when you press Save, so closing the window leaves nothing behind. A passage already saved
// opens its save to change its folders (and its label), with Remove from all folders.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { MY_SAVES } from "../../state/records/saves";
import { passageOf } from "../../state/records/marks";
import { chapterOf } from "@seed/seed-protocol";

/** The save window opened for a passage — on its save when it is already saved. */
export function openSavePicker(
  state: ReaderState,
  chapterRef: string,
  verses: { start: number; end: number } | null,
  edition?: string,
  saveId?: string
) {
  state.ui.savePicker.value = {
    chapterRef,
    verses,
    ...(edition ? { edition } : {}),
    ...(saveId ? { saveId } : {}),
  };
}

export function SavePicker({ state }: { state: ReaderState }) {
  const target = state.ui.savePicker.value;
  if (!target) return null;
  return (
    <Picker
      key={`${target.chapterRef}:${target.verses?.start ?? ""}-${target.verses?.end ?? ""}:${target.saveId ?? ""}`}
      state={state}
    />
  );
}

function Picker({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { saves } = state;
  const target = state.ui.savePicker.value!;
  const passage = target.verses
    ? passageOf(target.chapterRef, target.verses.start, target.verses.end)
    : chapterOf(target.chapterRef);
  const existing = target.saveId
    ? saves.all.value.find((s) => s.id === target.saveId)
    : saves.forPassage(passage)[0];
  const folders = saves.folders.value;
  const [chosen, setChosen] = useState<string[]>(() =>
    existing ? saves.shownFolders(existing) : [MY_SAVES]
  );
  const [label, setLabel] = useState(existing?.label ?? "");
  const [staged, setStaged] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => (state.ui.savePicker.value = null);

  // Read through a ref so an Esc right after "Add to new" opened still sees it (see TranslationPicker).
  const addingNow = useRef(adding);
  addingNow.current = adding;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (addingNow.current) {
        setAdding(false);
        setDraft("");
      } else close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const name = (f: string) =>
    f === MY_SAVES ? t("my-saves", { defaultValue: MY_SAVES }) : f;
  const trimmed = draft.trim();
  const collides =
    trimmed.length > 0 &&
    (folders.includes(trimmed) ||
      staged.includes(trimmed) ||
      trimmed === name(MY_SAVES));
  const canStage = adding && trimmed.length > 0 && !collides && !busy;
  const canSave = chosen.length > 0 && !busy;
  const shown = [...folders, ...staged.filter((f) => !folders.includes(f))];

  const toggle = (f: string) =>
    setChosen((cur) =>
      cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]
    );
  const stage = () => {
    if (!canStage) return;
    setStaged((cur) => [...cur, trimmed]);
    setChosen((cur) => (cur.includes(trimmed) ? cur : [...cur, trimmed]));
    setAdding(false);
    setDraft("");
  };
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (existing) await saves.update(existing.id, { folders: chosen, label });
      else await saves.add(passage, target.edition, undefined, chosen);
      close();
    } finally {
      setBusy(false);
    }
  };
  const removeAll = async () => {
    if (!existing || busy) return;
    setBusy(true);
    try {
      await saves.remove(existing.id);
      close();
    } finally {
      setBusy(false);
    }
  };

  const title = existing
    ? t("edit-save", { defaultValue: "Edit save" })
    : t("add-save-modal", { defaultValue: "Add save" });
  return (
    <div className="sb-footnote-modal-overlay" onClick={close}>
      <div
        className="sb-footnote-modal"
        role="dialog"
        aria-label={title}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          <div className="sb-save-picker">
            {existing && (
              <input
                className="sb-save-picker-new-input sb-save-picker-label"
                placeholder={t("save-label", {
                  defaultValue: "Label (optional)",
                })}
                value={label}
                onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
              />
            )}
            <div className="sb-save-picker-categories" role="group">
              {shown.map((f) => {
                const on = chosen.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={busy}
                    className={`sb-save-picker-category${on ? " sb-save-picker-category-selected" : ""}`}
                    onClick={() => toggle(f)}
                  >
                    <span className="sb-save-picker-category-name">
                      {name(f)}
                    </span>
                    <span
                      className={`sb-save-picker-checkbox${on ? " sb-save-picker-checkbox-checked" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
            {!busy && (
              <>
                <div className="sb-save-picker-divider" role="separator" />
                {adding ? (
                  <div className="sb-save-picker-new-row">
                    <input
                      autoFocus
                      className="sb-save-picker-new-input"
                      placeholder={t("new-folder-placeholder", {
                        defaultValue: "New folder name",
                      })}
                      value={draft}
                      onInput={(e) =>
                        setDraft((e.target as HTMLInputElement).value)
                      }
                      onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          stage();
                        }
                      }}
                    />
                    {collides && (
                      <div className="sb-save-picker-new-error">
                        {t("folder-name-taken", {
                          defaultValue:
                            "A folder with that name already exists.",
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sb-save-picker-add-new"
                    onClick={() => {
                      setAdding(true);
                      setDraft("");
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      add
                    </span>
                    <span>
                      {t("add-to-new", { defaultValue: "Add to new" })}
                    </span>
                  </button>
                )}
              </>
            )}
            <div className="sb-save-picker-actions">
              {existing && (
                <button
                  type="button"
                  className="sb-save-picker-remove"
                  disabled={busy}
                  onClick={() => void removeAll()}
                >
                  {t("remove-save-from-all-folders", {
                    defaultValue: "Remove from all folders",
                  })}
                </button>
              )}
              {adding && (
                <button
                  type="button"
                  className="sb-save-picker-stage-folder"
                  disabled={!canStage}
                  onClick={stage}
                >
                  {t("create-folder", { defaultValue: "Create folder" })}
                </button>
              )}
              <button
                type="button"
                className="sb-save-picker-save"
                disabled={!canSave}
                onClick={() => void save()}
              >
                {busy
                  ? t("saving", { defaultValue: "Saving…" })
                  : t("save", { defaultValue: "Save" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
