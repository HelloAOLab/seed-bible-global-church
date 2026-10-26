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
import { Avatar } from "../chrome/ConnectedChip";
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
import { openSavePicker } from "../records/SavePicker";
import { requestEndSession } from "../sessions/SessionSettings";
import { colorOf } from "../sessions/PresenceGutter";
import { BookmarkGlyph, bookmarkButtonLabel } from "../records/Bookmarks";
import type { Reading as ReadingState } from "../../state/reading/reading";

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
  const bookmarksOpen = state.ui.bookmarksPanel.value;
  const savesOpen = state.ui.savesPanel.value;
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
                onClick={() => (state.ui.bookmarksPanel.value = !bookmarksOpen)}
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
                onClick={() => (state.ui.savesPanel.value = !savesOpen)}
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
                openSavePicker(state, chapterRef, null, r.translationId.value);
              // The old reader's Shared tab: the one the live session lives in.
              const shared =
                state.live.active.value && state.sessionTabId.value === tab.id;
              const bookmarksHere = state.bookmarks.onChapter(
                chapterRef,
                r.translationId.value
              );
              const front = bookmarksHere[0];
              const audible = playingIn(state, r, isSelected);
              return (
                <div
                  key={tab.id}
                  className={`sb-tab-row${isSelected ? " sb-tab-row-selected" : ""}${shared ? " sb-tab-row-shared" : ""}`}
                  data-shared={shared ? "true" : undefined}
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
                      {front && (
                        <span
                          className="sb-tab-bookmark-marker"
                          role="img"
                          aria-label={bookmarkButtonLabel(t, bookmarksHere)}
                          title={bookmarkButtonLabel(t, bookmarksHere)}
                        >
                          <BookmarkGlyph colorId={front.colorId} size={12} />
                        </span>
                      )}
                      {audible && (
                        <span
                          className="material-symbols-outlined sb-tab-audio-icon"
                          role="img"
                          aria-label={t("tab-playing-audio", {
                            defaultValue: "Playing audio",
                          })}
                        >
                          volume_up
                        </span>
                      )}
                      {onScreen && tabs.slotTabIds.value.length > 1 && (
                        <span className="sb-tab-pane-count" aria-hidden="true">
                          {tabs.slotTabIds.value.indexOf(tab.id) + 1}
                        </span>
                      )}
                    </div>
                    {shared && <SessionPeople state={state} />}
                  </button>
                  {isSelected && !shared && (
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
                    {shared ? (
                      <>
                        <MenuItem
                          icon="settings"
                          className="sb-tab-menu-item"
                          onSelect={() =>
                            (state.ui.sessionSettings.value = true)
                          }
                        >
                          {t("session-settings", {
                            defaultValue: "Session settings",
                          })}
                        </MenuItem>
                        <MenuItem
                          icon="ios_share"
                          className="sb-tab-menu-item"
                          onSelect={() => {
                            const url = state.live.shareLink.value;
                            if (url)
                              state.ui.share.value = {
                                title: t("share-session", {
                                  defaultValue: "Share session",
                                }),
                                url,
                              };
                          }}
                        >
                          {t("share-session", {
                            defaultValue: "Share session",
                          })}
                        </MenuItem>
                        <MenuItem
                          icon="chat_bubble_outline"
                          className="sb-tab-menu-item"
                          onSelect={() => {
                            state.ui.chatView.value = "session";
                            state.ui.chatOpen.value = true;
                          }}
                        >
                          {t("open-chat", { defaultValue: "Open chat" })}
                        </MenuItem>
                      </>
                    ) : (
                      <MenuItem
                        icon="star"
                        className="sb-tab-menu-item"
                        onSelect={saveChapter}
                      >
                        {saved
                          ? t("remove-save", { defaultValue: "Remove save" })
                          : t("save-chapter", {
                              defaultValue: "Save chapter",
                            })}
                      </MenuItem>
                    )}
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
                      onSelect={() => {
                        // Closing the Shared tab leaves the session (the host is asked whether to end it).
                        if (shared) {
                          if (state.live.isHost.value) {
                            requestEndSession(state);
                            return;
                          }
                          state.live.leave();
                        }
                        tabs.closeTab(tab.id);
                      }}
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
            <CollapsedTile
              key={tab.id}
              state={state}
              tabId={tab.id}
              reading={tab.reading}
            />
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
        {/* The old reader's profile circle: your picture (or the account icon) opens Profile; changes still to send
            are a count on its corner. */}
        <button
          type="button"
          className={`sb-sidebar-icon-button sb-sidebar-profile-button${state.session.value ? " sb-sidebar-profile-button-in" : ""}${state.ui.pane.value === "profile" ? " sb-sidebar-icon-button-selected" : ""}`}
          aria-label={
            state.session.value
              ? t("open-profile-named", {
                  name:
                    state.profile.mine.value?.displayName ||
                    state.session.value.name ||
                    "",
                  defaultValue: "Open profile ({{name}})",
                })
              : t("open-profile", { defaultValue: "Open profile" })
          }
          title={t("profile", { defaultValue: "Profile" })}
          onClick={() =>
            (state.ui.pane.value =
              state.ui.pane.value === "profile" ? "none" : "profile")
          }
        >
          {state.session.value ? (
            <Avatar state={state} />
          ) : (
            <span className="material-symbols-outlined">account_circle</span>
          )}
          {state.outbox.pending.value > 0 && (
            <span className="sb-reader-toolbar-unread-indicator">
              {state.outbox.pending.value}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}

/** The people in the session, on its tab: host first, then co-hosts, each with their badge. */
function SessionPeople({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const s = state.live.state.value;
  if (!s) return null;
  const rank = (agent: string) =>
    s.host?.agent === agent ? 0 : (s.coHosts ?? []).includes(agent) ? 1 : 2;
  const people = s.participants
    .filter((p) => p.connections > 0)
    .sort((a, b) => rank(a.agent) - rank(b.agent));
  return (
    <div className="sb-tab-users-section">
      <span className="sb-tab-shared-tag">
        {t("shared", { defaultValue: "Shared" })}
      </span>
      <div className="sb-tab-users-list">
        {people.map((p) => {
          const r = rank(p.agent);
          const role =
            r === 0
              ? t("host", { defaultValue: "Host" })
              : r === 1
                ? t("co-host", { defaultValue: "Co-host" })
                : null;
          return (
            <span key={p.agent} className="sb-tab-user">
              <span
                className={`sb-tab-user-icon sb-tab-user-icon-animal${p.agent === state.live.me.value ? " sb-tab-user-icon-self" : ""}`}
                title={role ? `${p.name} · ${role}` : p.name}
                style={{
                  borderColor: colorOf(p.agent),
                  backgroundColor: colorOf(p.agent),
                }}
              >
                <span className="material-symbols-outlined">person</span>
              </span>
              {role && (
                <span
                  className={`sb-tab-user-role sb-tab-user-role-${r === 1 ? "cohost" : "host"}`}
                >
                  {role}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Whether this tab's reading is the one being heard (a recording of its chapter, or the device voice on the selected tab). */
function playingIn(
  state: ReaderState,
  r: ReadingState,
  isSelected: boolean
): boolean {
  if (isSelected && state.tts.isSpeaking.value) return true;
  return (
    state.audio.controller.isPlaying.value &&
    state.audio.loaded.value ===
      `${r.translationId.value}/${r.bookId.value}.${r.chapterNumber.value}`
  );
}

/** The old reader's collapsed-rail tile: the short title ("JHN 3"), Shared with its people as dots, and a speaker while it plays. */
function CollapsedTile({
  state,
  tabId,
  reading: r,
}: {
  state: ReaderState;
  tabId: string;
  reading: ReadingState;
}) {
  const { t } = useI18n();
  const tabs = state.tabs;
  const isSelected = tabs.selectedId.value === tabId;
  const shortTitle = r.bookId.value
    ? `${r.bookId.value} ${r.chapterNumber.value}`
    : "";
  const shared = state.live.active.value && state.sessionTabId.value === tabId;
  const s = state.live.state.value;
  const rank = (agent: string) =>
    s?.host?.agent === agent ? 0 : (s?.coHosts ?? []).includes(agent) ? 1 : 2;
  const people = shared
    ? (s?.participants ?? [])
        .filter((p) => p.connections > 0)
        .sort((a, b) => rank(a.agent) - rank(b.agent))
    : [];
  const audible = playingIn(state, r, isSelected);
  const label =
    shared && people.length > 0
      ? t("collapsed-tab-shared-label", {
          title: shortTitle,
          count: people.length,
          defaultValue: "{{title}} — shared session, {{count}} present",
        })
      : shortTitle;
  const shown = people.slice(0, 3);
  return (
    <button
      type="button"
      className={`sb-collapsed-tab-tile${isSelected ? " sb-collapsed-tab-tile-selected" : ""}${shared ? " sb-collapsed-tab-tile-shared" : ""}`}
      aria-label={
        audible
          ? t("collapsed-tab-playing-label", {
              label,
              defaultValue: "{{label}} — playing audio",
            })
          : label
      }
      title={`${r.bookName.value} ${r.chapterNumber.value}`}
      onClick={() => tabs.selectTab(tabId)}
    >
      {shared && (
        <span className="sb-collapsed-tab-tag">
          {t("shared", { defaultValue: "Shared" })}
        </span>
      )}
      <span className="sb-collapsed-tab-title">{shortTitle}</span>
      {audible && (
        <span
          className="material-symbols-outlined sb-collapsed-tab-audio-icon"
          aria-hidden="true"
        >
          volume_up
        </span>
      )}
      {shown.length > 0 && (
        <span className="sb-collapsed-tab-presence" aria-hidden="true">
          {shown.map((p) => {
            const role = rank(p.agent);
            return (
              <span
                key={p.agent}
                className={`sb-collapsed-tab-presence-dot${role === 0 ? " sb-collapsed-tab-presence-dot-host" : role === 1 ? " sb-collapsed-tab-presence-dot-cohost" : ""}`}
                style={{ backgroundColor: colorOf(p.agent) }}
              />
            );
          })}
          {people.length > shown.length && (
            <span className="sb-collapsed-tab-presence-more">
              +{people.length - shown.length}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
