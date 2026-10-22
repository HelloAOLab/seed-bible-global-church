// THE TABS SIDEBAR — the old reader's left rail (`sb-tabs-sidebar`): the tab list with each tab's title and
// translation, the add button, and the pane-layout picker with its little previews. Dressed by the copied
// `tabs.css` / `pane-layout.css`.
import { handleGridKeyNav } from "../keyboardNav";
import { useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { ConnectedChip } from "../chrome/ConnectedChip";
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
            <span className="material-symbols-outlined">menu</span>
          </button>
          {!collapsed && (
            <button
              type="button"
              className="sb-sidebar-logo sb-sidebar-logo-button"
              onClick={() => (state.ui.pane.value = "about")}
            >
              Seed Bible
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="sb-sidebar-top-actions sb-pane-layout-anchor">
            <button
              type="button"
              className="sb-sidebar-top-icon-button"
              aria-label={t("scripture-map", { defaultValue: "Scripture map" })}
              title={t("scripture-map", { defaultValue: "Scripture map" })}
              onClick={() => (state.ui.pane.value = "map")}
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button
              type="button"
              className="sb-sidebar-top-icon-button"
              aria-label={t("friends", { defaultValue: "Friends" })}
              title={t("friends", { defaultValue: "Friends" })}
              aria-pressed={state.ui.pane.value === "friends"}
              onClick={() =>
                (state.ui.pane.value =
                  state.ui.pane.value === "friends" ? "none" : "friends")
              }
            >
              <span className="material-symbols-outlined">group</span>
            </button>
            <button
              type="button"
              className="sb-sidebar-top-icon-button"
              aria-label={t("pane-layout", { defaultValue: "Pane layout" })}
              aria-expanded={layoutOpen}
              onClick={() => setLayoutOpen((o) => !o)}
            >
              <span className="material-symbols-outlined">view_column</span>
            </button>
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

      {!collapsed && (
        <>
          <div className="sb-sidebar-tabs-header">
            <h3 className="sb-sidebar-tabs-title">
              {t("tabs", { defaultValue: "Tabs" })}
            </h3>
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
          <div className="sb-sidebar-tab-list" role="tablist">
            {tabs.tabs.value.map((tab) => {
              const r = tab.reading;
              const isSelected = tabs.selectedId.value === tab.id;
              const onScreen = tabs.slotTabIds.value.includes(tab.id);
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
                  <button
                    type="button"
                    className="sb-sidebar-icon-button sb-tab-close-button"
                    aria-label={t("close-tab", { defaultValue: "Close tab" })}
                    title={t("close-tab", { defaultValue: "Close tab" })}
                    onClick={() => tabs.closeTab(tab.id)}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
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
      <div className="sb-sidebar-footer">
        <ConnectedChip state={state} compact={collapsed} />
      </div>
    </aside>
  );
}
