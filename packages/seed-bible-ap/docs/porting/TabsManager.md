# Porting `TabsManager`, `TabsLayoutManager`, `PanesManager` (tabs and panes)

Source (read-only): `managers/TabsManager.tsx` (1,317 lines), `managers/TabsLayoutManager.tsx`,
`managers/PanesManager.tsx`, `components/Tabs/Tabs.tsx` (2,892), `components/TabsLayout.tsx`, `components/PaneLayout`.

| It did                                                          | Now (`reader-web/src`)                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| one `BibleReadingState` per tab; a selected tab                 | `state/reading/tabs.ts` — one `Reading` per tab; the selected slot decides the selected tab             |
| layouts `single … split-4v` with N slots bound to tabs by id    | the same six layouts (`LAYOUT_OPTIONS`); a new slot takes the first tab not on screen, else a fresh tab |
| sidebar: tab list, add, layout menu with previews, collapse     | `components/reader/TabsSidebar.tsx` with the copied `tabs.css` / `pane-layout.css`                      |
| `sb-panes-layout[data-layout]` grid, one `sb-pane-shell` a slot | `components/reader/PanesLayout.tsx`; a click in a slot selects it                                       |
| the URL and the device position follow the selected tab         | the same (`state/index.ts`)                                                                             |
| tab persistence across visits (CasualOS / local storage)        | **not yet** — one tab from the URL or the last position on load                                         |

Not in this cut: slot-only tabs, shared-session tabs and their participants, the pane resize handles, the mobile
tab strip, the saves/bookmarks sections the sidebar also hosted (those live in Your Content now), the context menus.
