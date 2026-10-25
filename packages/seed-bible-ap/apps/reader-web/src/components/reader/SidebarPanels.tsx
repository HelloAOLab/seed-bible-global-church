// THE SIDEBAR'S PANELS — the old reader's (packages/seed-bible Tabs and Bookmarks): the bookmarks panel and the saves
// folders the 🔖 and ☆ beside "Tabs" show above the tab list, and the ☑ "Tasks" mark that opens Today. A bookmark or
// a save opens its chapter (a save in the translation it was saved in, at its verses).
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { MenuButton, MenuItem } from "../chrome/ContextMenu";
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { MY_SAVES } from "../../state/records/saves";
import { openSavePicker } from "../records/SavePicker";

/** The old reader's Tasks glyph: a page with a tick. */
export function TasksIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M11.5 21H6C5.46957 21 4.96086 20.7893 4.58579 20.4142C4.21071 20.0391 4 19.5304 4 19V5C4 4.46957 4.21071 3.96086 4.58579 3.58579C4.96086 3.21071 5.46957 3 6 3H18C18.5304 3 19.0391 3.21071 19.4142 3.58579C19.7893 3.96086 20 4.46957 20 5V13"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M9 18H11"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M15 19L17 21L21 17"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** Book names per translation, read once each (a save is named in its own translation, as the old reader does). */
const bookNames = signal<Record<string, Record<string, string>>>({});
const asked = new Set<string>();

function useBookNames(state: ReaderState, translationIds: readonly string[]) {
  const key = [...new Set(translationIds)].sort().join();
  useEffect(() => {
    for (const id of new Set(translationIds)) {
      if (!id || asked.has(id)) continue;
      asked.add(id);
      void state.api
        .getTranslationBooks(id)
        .then((out) => {
          bookNames.value = {
            ...bookNames.value,
            [id]: Object.fromEntries(out.books.map((b) => [b.id, b.name])),
          };
        })
        .catch(() => asked.delete(id));
    }
  }, [key]);
}

function chapterName(
  state: ReaderState,
  chapter: string,
  translationId?: string
) {
  const [book, ch] = chapter.split(".");
  const name =
    (translationId && bookNames.value[translationId]?.[book!]) ??
    state.reading.books.value.find((b) => b.id === book)?.name ??
    book;
  return `${name} ${ch}`;
}

function openAt(
  state: ReaderState,
  chapter: string,
  translationId?: string,
  start?: number | null,
  end?: number | null
) {
  const [book, ch] = chapter.split(".");
  const reading = state.reading;
  void reading
    .goTo(translationId || reading.translationId.value, book!, Number(ch))
    .then(() => {
      if (start) state.selection.select(start, end ?? start);
    });
  state.ui.sidebarDrawer.value = false;
}

export function BookmarksPanel({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const all = state.bookmarks.all.value;
  const here = state.reading.translationId.value;
  useBookNames(state, [here]);
  return (
    <div className="sb-bookmarks-panel">
      {!all.length && (
        <p className="sb-bookmarks-panel-empty">
          {t("bookmarks-empty", {
            defaultValue:
              "No bookmarks yet. Use the bookmark button above a chapter to place one.",
          })}
        </p>
      )}
      {all.map((b) => (
        <div key={b.id} className="sb-bookmarks-panel-row">
          <button
            type="button"
            className="sb-bookmarks-panel-open"
            onClick={() => openAt(state, b.chapter)}
          >
            <span
              className="material-symbols-outlined sb-icon-filled"
              aria-hidden="true"
              style={
                b.colorId
                  ? { color: `var(--sb-highlight-${b.colorId}-color)` }
                  : undefined
              }
            >
              bookmark
            </span>
            <span className="sb-tab-main-title">{b.name}</span>
            {b.name !== chapterName(state, b.chapter, here) && (
              <span className="sb-tab-main-translation">
                {chapterName(state, b.chapter, here)}
              </span>
            )}
          </button>
          <MenuButton
            label={t("bookmark-options", { defaultValue: "Bookmark options" })}
            anchorClassName="sb-tab-menu-anchor"
            buttonClassName="sb-tab-menu-button"
            menuClassName="sb-tab-menu"
            iconClassName="sb-tab-more-icon"
          >
            <MenuItem
              icon="edit"
              className="sb-tab-menu-item"
              onSelect={() => (state.ui.pane.value = "content")}
            >
              {t("edit-bookmark", { defaultValue: "Edit bookmark" })}
            </MenuItem>
            <MenuItem
              icon="delete"
              className="sb-tab-menu-item"
              onSelect={() => void state.bookmarks.remove(b.id)}
            >
              {t("delete-bookmark", { defaultValue: "Delete bookmark" })}
            </MenuItem>
          </MenuButton>
        </div>
      ))}
    </div>
  );
}

export function SavesPanel({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const all = state.saves.all.value;
  useBookNames(
    state,
    all.map((s) => s.edition ?? "")
  );
  const names = state.saves.folders.value;
  const [open, setOpen] = useState<Set<string>>(() => new Set([MY_SAVES]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const commitRename = (from: string) => {
    setRenaming(null);
    if (renameTo.trim() && renameTo.trim() !== from) {
      void state.saves.renameFolder(from, renameTo);
      setOpen((cur) => new Set([...cur, renameTo.trim()]));
    }
  };
  const toggle = (name: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  return (
    <div className="sb-saves-section">
      {names.map((name) => {
        const items = all.filter((s) => state.saves.inFolder(s, name));
        const shownName =
          name === MY_SAVES ? t("my-saves", { defaultValue: MY_SAVES }) : name;
        const expanded = open.has(name);
        return (
          <div key={name} className="sb-save-category">
            <div
              className={`sb-save-category-header${expanded ? " sb-save-category-header-expanded" : ""}`}
            >
              <button
                type="button"
                className="sb-save-category-toggle"
                aria-expanded={expanded}
                aria-label={shownName}
                onClick={() => renaming !== name && toggle(name)}
              >
                <span className="sb-save-category-icon" aria-hidden="true">
                  <span className="material-symbols-outlined sb-icon-filled">
                    star
                  </span>
                </span>
                {renaming === name ? (
                  <input
                    className="sb-save-category-rename-input"
                    autoFocus
                    value={renameTo}
                    onInput={(e) =>
                      setRenameTo((e.target as HTMLInputElement).value)
                    }
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(name);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                    onBlur={() => commitRename(name)}
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  />
                ) : (
                  <span className="sb-save-category-name">{shownName}</span>
                )}
                <span
                  className={`sb-save-category-chevron${expanded ? " sb-save-category-chevron-open" : ""}`}
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">expand_more</span>
                </span>
              </button>
              {name !== MY_SAVES && (
                <MenuButton
                  label={t("category-options", {
                    defaultValue: "Folder options",
                  })}
                  anchorClassName="sb-save-category-menu-anchor"
                  buttonClassName="sb-save-category-menu-button"
                  menuClassName="sb-tab-menu"
                  iconClassName="sb-tab-more-icon"
                >
                  <MenuItem
                    icon="edit"
                    className="sb-tab-menu-item"
                    onSelect={() => {
                      setRenaming(name);
                      setRenameTo(name);
                    }}
                  >
                    {t("rename", { defaultValue: "Rename" })}
                  </MenuItem>
                  <MenuItem
                    icon="delete"
                    className="sb-tab-menu-item"
                    onSelect={() => void state.saves.deleteFolder(name)}
                  >
                    {t("delete", { defaultValue: "Delete" })}
                  </MenuItem>
                </MenuButton>
              )}
            </div>
            {expanded && (
              <div className="sb-save-category-items">
                {!items.length ? (
                  <div className="sb-save-category-empty">
                    {t("save-folder-empty", {
                      defaultValue: "No saves here yet.",
                    })}
                  </div>
                ) : (
                  items.map((s) => (
                    <div
                      key={s.id}
                      className={`sb-save-item${s.start ? " sb-save-item-verse" : ""}`}
                      dir="auto"
                    >
                      <button
                        type="button"
                        className="sb-save-item-button"
                        onClick={() =>
                          openAt(state, s.chapter, s.edition, s.start, s.end)
                        }
                      >
                        <span className="sb-tab-main-title">
                          {s.label ||
                            `${chapterName(state, s.chapter, s.edition)}${s.start ? `:${s.start}${s.end && s.end !== s.start ? `-${s.end}` : ""}` : ""}`}
                        </span>
                        {s.edition && (
                          <>
                            <span
                              className="sb-tab-main-sep"
                              aria-hidden="true"
                            >
                              •
                            </span>
                            <span className="sb-tab-main-translation">
                              {s.edition}
                            </span>
                          </>
                        )}
                      </button>
                      <MenuButton
                        label={t("save-options", {
                          defaultValue: "Save options",
                        })}
                        anchorClassName="sb-tab-menu-anchor"
                        buttonClassName="sb-tab-menu-button"
                        menuClassName="sb-tab-menu"
                        iconClassName="sb-tab-more-icon"
                      >
                        <MenuItem
                          icon="edit"
                          className="sb-tab-menu-item"
                          onSelect={() =>
                            openSavePicker(
                              state,
                              s.chapter,
                              s.start
                                ? { start: s.start, end: s.end ?? s.start }
                                : null,
                              s.edition,
                              s.id
                            )
                          }
                        >
                          {t("edit-save", { defaultValue: "Edit save" })}
                        </MenuItem>
                        <MenuItem
                          icon="delete"
                          className="sb-tab-menu-item"
                          onSelect={() => void state.saves.remove(s.id)}
                        >
                          {t("remove-save", { defaultValue: "Remove save" })}
                        </MenuItem>
                      </MenuButton>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
