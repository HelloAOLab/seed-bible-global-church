# Porting `SettingsManager` and `ThemeManager` (the chrome the core reader needs)

Source (read-only): `managers/SettingsManager.tsx`, `managers/ThemeManager.tsx`, `app/styles/*.css`, the
component stylesheets.

| It did                                                                                                                     | Now                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `LIGHT_THEME` / `DARK_THEME` → `--sb-*` variables on `body`                                                                | `state/chrome/theme.ts` — the two tables copied verbatim, `generateThemeCssVariables` injected body-scoped        |
| per-colour highlight classes                                                                                               | `generateThemeCssClasses` — `.sb-highlight-<id>` sets the font colour and `--sb-highlight-fill`                   |
| scripture elements (numbers, headings, footnotes, red letters, highlights), font size, theme choice; persisted in CasualOS | `state/chrome/settings.ts` — localStorage; the vault `seed.settings.put` follows when settings become a mark      |
| the stylesheets                                                                                                            | copied unchanged into `src/styles/` (base, utilities, reader, selector, toolbar) + `app.css` for this app's layer |

Dropped for now: customizations (org themes), UI scale, line height, margins, the full Settings page. The SVG
highlight ribbon (`app/highlightRibbon.ts`, 390 lines + measurement in `ChapterContent`) is not ported: a run paints
its fill on the verse text (`app.css`) until it is.
