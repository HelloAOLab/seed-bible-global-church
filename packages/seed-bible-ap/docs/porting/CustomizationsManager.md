# Porting `CustomizationsManager` and `CustomizationVariantSelectionsManager` (first cut)

Source (read-only): `managers/CustomizationsManager.tsx` (2,417 lines), `CustomizationVariantSelectionsManager`,
`CustomizationEditPane`, the branding parts of `ThemeManager`.

| It did                                                                                               | With                                           | Now                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a customization record: brand, logo, theme variants, fonts, recommended features, extension defaults | CasualOS record, `?customization=` in the URL  | `seed:Customization` (`hasVariant[]` of `seed:ThemeVariant` with the reader's theme `variables`, `logo`, `defaultEdition`); a work in `seed-bible/customizations`          |
| the editor pane (colours, fonts, logo, preview)                                                      | `CustomizationEditPane`                        | the Library pane's **Customizations** tab: a variant per scheme, ten colour variables, logo from your gallery, default edition — the first cut of the editor               |
| publish so readers can use it                                                                        | `publicRead`, the share link                   | **Publish** → a released slice of kind `customization` on the publisher's shelf; the registry lists it by kind (`/registry/offerings?kind=customization`)                  |
| a reader selects a customization and variant                                                         | `CustomizationVariantSelectionsManager` record | the account pane's **Church theme** picker from what the registry lists; the selection and the work are kept on the device (`seed:CustomizationSelection` as a mark later) |
| the theme applied over the built-ins                                                                 | `createTheme(settings, brandingThemes)`        | `settings.resolvedTheme()` takes the selected variant for the scheme over LIGHT/DARK (`themeFromVariant`)                                                                  |

**The organization is not the publisher yet.** Today the signed-in person publishes from their own shelf; a church's
`.church` agent publishing under a steward's standing is `seed.workspace.ask.org` (hard-problems §11), an ap-home
question. Fonts, UI scale, recommended extensions and the embed-mode `?customization=` link are later cuts.
