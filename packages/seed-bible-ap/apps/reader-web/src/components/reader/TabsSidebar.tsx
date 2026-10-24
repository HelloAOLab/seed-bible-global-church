// THE TABS SIDEBAR — the old reader's left rail (`sb-tabs-sidebar`): at the top ⇤ collapse, ⊞ Panels (the pane
// layouts with their little previews) and ⋮ More; beside "Tabs" ☑ Tasks (Today), 🔖 Bookmarks and ☆ Saves (panels
// above the tab list) and +; each tab with its title and translation, ☆ Save chapter on the open one and a ⋮ menu;
// at the bottom the ⚙ that turns the sidebar into Settings (components/chrome/SettingsView.tsx), and who is
// connected. Dressed by the copied
// `tabs.css` / `pane-layout.css`.
import { handleGridKeyNav } from "../keyboardNav";
import { useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { ConnectedChip } from "../chrome/ConnectedChip";
import { SettingsView } from "../chrome/SettingsView";
import { MenuButton, MenuItem } from "../chrome/ContextMenu";
import { BookmarksPanel, SavesPanel, TasksIcon } from "./SidebarPanels";
import { routeOf } from "../../state/reading/route";
import { wakeLockSupported } from "../../state/chrome/wakeLock";
import {
  LAYOUT_OPTIONS,
  slotCountOf,
  type LayoutId,
} from "../../state/reading/tabs";

function LayoutPreview({ layout }: { layout: LayoutId }) {
  return (
    <div
      className="sb-pane-layout-preview"
      data-layout={layout}
      aria-hidden="true"
    >
      {Array.from({ length: slotCountOf(layout) }, (_, i) => (
        <div
          key={i}
          className={`sb-pane-layout-preview-cell sb-pane-layout-preview-cell-${i + 1}`}
        />
      ))}
    </div>
  );
}

export function TabsSidebar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { tabs } = state;
  const [layoutOpen, setLayoutOpen] = useState(false);
  const drawer = state.ui.sidebarDrawer.value;
  const collapsed = state.ui.sidebarCollapsed.value && !drawer;
  const settingsOpen = state.ui.settingsView.value !== null && !collapsed;
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const shareTab = () => {
    const r = tabs.selected.value?.reading;
    if (!r) return;
    state.ui.share.value = {
      title: `${r.bookName.value} ${r.chapterNumber.value}`,
      url: `${location.origin}${routeOf({
        translationId: r.translationId.value,
        bookId: r.bookId.value,
        chapterNumber: r.chapterNumber.value,
      })}`,
    };
  };
  /** Choosing a tab from the phone drawer closes it. */
  const pick = (id: string) => {
    tabs.selectTab(id);
    state.ui.sidebarDrawer.value = false;
  };

  return (
    <aside
      className={`sb-tabs-sidebar${collapsed ? " sb-tabs-sidebar-collapsed" : ""}${drawer ? " sb-tabs-sidebar-drawer" : ""}`}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <div className="sb-sidebar-top-row">
        <div className="sb-sidebar-top-start">
          <button
            type="button"
            className="sb-sidebar-top-icon-button sb-sidebar-collapse-button"
            aria-label={
              collapsed
                ? t("open-sidebar", { defaultValue: "Open sidebar" })
                : t("close-sidebar", { defaultValue: "Close sidebar" })
            }
            onClick={() =>
              drawer
                ? (state.ui.sidebarDrawer.value = false)
                : (state.ui.sidebarCollapsed.value = !collapsed)
            }
          >
            <span className="material-symbols-outlined rtl-mirror">
              {collapsed || drawer ? "menu" : "menu_open"}
            </span>
          </button>
        </div>
        {drawer && (
          <button
            type="button"
            className="sb-sidebar-top-icon-button sb-sidebar-drawer-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.sidebarDrawer.value = false)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
        {!collapsed && !drawer && (
          <div className="sb-sidebar-top-actions sb-pane-layout-anchor">
            <button
              type="button"
              className="sb-sidebar-top-icon-button"
              aria-label={t("pane-layout", { defaultValue: "Pane layout" })}
              title={t("panels", { defaultValue: "Panels" })}
              aria-expanded={layoutOpen}
              onClick={() => setLayoutOpen((o) => !o)}
            >
              <span className="material-symbols-outlined">dashboard</span>
            </button>
            <MenuButton
              label={t("more", { defaultValue: "More" })}
              buttonClassName="sb-sidebar-top-icon-button"
            >
              <MenuItem icon="share" onSelect={shareTab}>
                {t("share", { defaultValue: "Share" })}
              </MenuItem>
              <MenuItem
                icon="group"
                onSelect={() => (state.ui.pane.value = "friends")}
              >
                {t("friends", { defaultValue: "Friends" })}
              </MenuItem>
              <MenuItem
                icon="grid_view"
                onSelect={() => (state.ui.pane.value = "map")}
              >
                {t("scripture-map", { defaultValue: "Scripture map" })}
              </MenuItem>
              {wakeLockSupported() && (
                <MenuItem
                  icon="light_mode"
                  checked={state.settings.keepScreenAwake.value}
                  onSelect={() =>
                    (state.settings.keepScreenAwake.value =
                      !state.settings.keepScreenAwake.value)
                  }
                >
                  {t("keep-screen-awake-short", {
                    defaultValue: "Keep screen awake",
                  })}
                </MenuItem>
              )}
            </MenuButton>
            {layoutOpen && (
              <div
                className="sb-pane-layout-menu"
                role="menu"
                onKeyDown={(e) =>
                  handleGridKeyNav(
                    e as KeyboardEvent,
                    e.currentTarget as HTMLElement
                  )
                }
              >
                <div className="sb-pane-layout-menu-title">
                  {t("pane-layout", { defaultValue: "Pane layout" })}
                </div>
                <div className="sb-pane-layout-options">
                  {LAYOUT_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={tabs.layout.value === o.id}
                      className={`sb-pane-layout-option${tabs.layout.value === o.id ? " sb-pane-layout-option-selected" : ""}`}
                      title={o.label}
                      onClick={() => {
                        tabs.setLayout(o.id);
                        setLayoutOpen(false);
                      }}
                    >
                      <LayoutPreview layout={o.id} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {settingsOpen && <SettingsView state={state} />}
      {!collapsed && !settingsOpen && (
        <>
          <div className="sb-sidebar-tabs-header">
            <h3 className="sb-sidebar-tabs-title">
              {t("tabs", { defaultValue: "Tabs" })}
            </h3>
            <div className="sb-sidebar-tabs-header-actions">
              <button
                type="button"
                className="sb-sidebar-tabs-header-icon-button sb-sidebar-tabs-header-tasks-button"
                aria-label={t("tasks", { defaultValue: "Tasks" })}
                title={t("tasks", { defaultValue: "Tasks" })}
                aria-pressed={state.ui.pane.value === "today"}
                onClick={() =>
                  (state.ui.pane.value =
                    state.ui.pane.value === "today" ? "none" : "today")
                }
              >
                <TasksIcon />
              </button>
              <button
                type="button"
                className={`sb-sidebar-tabs-header-icon-button sb-sidebar-tabs-header-bookmarks-button${bookmarksOpen ? " sb-sidebar-tabs-header-bookmarks-button-active" : ""}`}
                aria-label={t("bookmarks", { defaultValue: "Bookmarks" })}
                aria-pressed={bookmarksOpen}
                title={
                  bookmarksOpen
                    ? t("hide-bookmarks", { defaultValue: "Hide bookmarks" })
                    : t("show-bookmarks", { defaultValue: "Show bookmarks" })
                }
                onClick={() => setBookmarksOpen((o) => !o)}
              >
                <span
                  className={`material-symbols-outlined${bookmarksOpen ? " sb-icon-filled" : ""}`}
                >
                  bookmark
                </span>
              </button>
              <button
                type="button"
                className={`sb-sidebar-tabs-header-icon-button sb-sidebar-tabs-header-saves-button${savesOpen ? " sb-sidebar-tabs-header-saves-button-active" : ""}`}
                aria-label={t("saves", { defaultValue: "Saves" })}
                aria-pressed={savesOpen}
                title={
                  savesOpen
                    ? t("hide-saves", { defaultValue: "Hide saves" })
                    : t("show-saves", { defaultValue: "Show saves" })
                }
                onClick={() => setSavesOpen((o) => !o)}
              >
                <span
                  className={`material-symbols-outlined${savesOpen ? " sb-icon-filled" : ""}`}
                >
                  star
                </span>
              </button>
              <button
                type="button"
                className="sb-tab-add-button"
                aria-label={t("new-tab", { defaultValue: "New tab" })}
                title={t("new-tab", { defaultValue: "New tab" })}
                onClick={() =>
                  tabs.addTab(
                    tabs.selected.value ? { from: tabs.selected.value } : {}
                  )
                }
              >
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          </div>
          {bookmarksOpen && <BookmarksPanel state={state} />}
          {savesOpen && <SavesPanel state={state} />}
          <div className="sb-sidebar-tab-list" role="tablist">
            {tabs.tabs.value.map((tab) => {
              const r = tab.reading;
              const isSelected = tabs.selectedId.value === tab.id;
              const onScreen = tabs.slotTabIds.value.includes(tab.id);
              const chapterRef = `${r.bookId.value}.${r.chapterNumber.value}`;
              const saved = state.saves.forPassage(chapterRef).length > 0;
              const saveChapter = () =>
                void state.saves.toggle(
                  chapterRef,
                  null,
                  r.translationId.value
                );
              return (
                <div
                  key={tab.id}
                  className={`sb-tab-row${isSelected ? " sb-tab-row-selected" : ""}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className="sb-tab-button"
                    onClick={() => pick(tab.id)}
                  >
                    <div
                      className="sb-tab-main-content"
                      dir={r.translation.value?.textDirection ?? "auto"}
                    >
                      <span className="sb-tab-main-title">
                        {r.bookName.value} {r.chapterNumber.value}
                      </span>
                      <span className="sb-tab-main-sep" aria-hidden="true">
                        •
                      </span>
                      <span className="sb-tab-main-translation">
                        {r.translation.value?.shortName ??
                          r.translationId.value}
                      </span>
                      {onScreen && tabs.slotTabIds.value.length > 1 && (
                        <span className="sb-tab-pane-count" aria-hidden="true">
                          {tabs.slotTabIds.value.indexOf(tab.id) + 1}
                        </span>
                      )}
                    </div>
                  </button>
                  {isSelected && (
                    <button
                      type="button"
                      className={`sb-tab-save-button${saved ? " sb-tab-save-button-saved" : ""}`}
                      aria-label={t("save-chapter", {
                        defaultValue: "Save chapter",
                      })}
                      title={t("save-chapter", {
                        defaultValue: "Save chapter",
                      })}
                      aria-pressed={saved}
                      onClick={saveChapter}
                    >
                      <span
                        className={`material-symbols-outlined${saved ? " sb-icon-filled" : ""}`}
                      >
                        star
                      </span>
                    </button>
                  )}
                  <MenuButton
                    label={t("tab-options", { defaultValue: "Tab options" })}
                    anchorClassName="sb-tab-menu-anchor"
                    buttonClassName="sb-tab-menu-button"
                    menuClassName="sb-tab-menu"
                    iconClassName="sb-tab-more-icon"
                  >
                    <MenuItem
                      icon="star"
                      className="sb-tab-menu-item"
                      onSelect={saveChapter}
                    >
                      {saved
                        ? t("remove-save", { defaultValue: "Remove save" })
                        : t("save-chapter", { defaultValue: "Save chapter" })}
                    </MenuItem>
                    <MenuItem
                      icon="splitscreen_right"
                      className="sb-tab-menu-item"
                      onSelect={() => tabs.openInNewPanel(tab.id)}
                    >
                      {t("open-in-new-panel", {
                        defaultValue: "Open in new panel",
                      })}
                    </MenuItem>
                    <MenuItem
                      icon="close"
                      className="sb-tab-menu-item"
                      onSelect={() => tabs.closeTab(tab.id)}
                    >
                      {t("close", { defaultValue: "Close" })}
                    </MenuItem>
                  </MenuButton>
                </div>
              );
            })}
          </div>
        </>
      )}
      {collapsed && (
        <div className="sb-sidebar-collapsed-tab-list">
          {tabs.tabs.value.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sb-sidebar-icon-button${tabs.selectedId.value === tab.id ? " sb-sidebar-icon-button-selected" : ""}`}
              title={`${tab.reading.bookName.value} ${tab.reading.chapterNumber.value}`}
              onClick={() => tabs.selectTab(tab.id)}
            >
              {tab.reading.bookId.value.slice(0, 3)}
            </button>
          ))}
          <button
            type="button"
            className="sb-tab-add-button sb-collapsed-tab-add-button"
            aria-label={t("new-tab", { defaultValue: "New tab" })}
            onClick={() =>
              tabs.addTab(
                tabs.selected.value ? { from: tabs.selected.value } : {}
              )
            }
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      )}
      <div
        className={`sb-sidebar-footer sb-sidebar-bottom-actions${collapsed ? " sb-sidebar-bottom-actions-collapsed" : ""}`}
      >
        <button
          type="button"
          data-tutorial="settings"
          className={`sb-sidebar-icon-button sb-sidebar-settings-button${settingsOpen ? " sb-sidebar-icon-button-selected" : ""}`}
          aria-label={t("open-settings", { defaultValue: "Open settings" })}
          title={t("settings", { defaultValue: "Settings" })}
          aria-pressed={settingsOpen}
          onClick={() => {
            // Settings needs the whole sidebar: from the collapsed rail it opens it first, as the old reader does.
            if (collapsed) state.ui.sidebarCollapsed.value = false;
            state.ui.settingsView.value = settingsOpen ? null : "main";
          }}
        >
          <span className="material-symbols-outlined">settings</span>
        </button>
        <ConnectedChip state={state} compact={collapsed} />
      </div>
    </aside>
  );
}
