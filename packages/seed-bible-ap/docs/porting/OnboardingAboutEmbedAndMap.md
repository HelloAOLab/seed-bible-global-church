# Porting `OnboardingManager`, the About page, `EmbedMode`, the sitemap and the Scripture map (step 9, first cut)

Source (read-only): `managers/OnboardingManager.tsx`, `components/About*`, `EmbedMode`, `server/` (sitemap, OG),
`packages/scripture-map`.

| It did                                                                | Now                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| onboarding flag in CasualOS user record; PWA install prompt           | `onboarding:done` in the device prefs (`components/chrome/Onboarding.tsx`); `beforeinstallprompt` kept on the device, never sent     |
| About page with the mission copy, release notes, Discord, donate      | `AboutPane`: the same copy keys plus an "on this estate" paragraph; release notes / Discord / donate links are not in this cut       |
| legal modals from `i18n/policies/<policy>/<lang>.json`                | the same bundles copied under `reader-web/src/i18n/policies`, loaded on demand, English fallback; acceptance never persisted         |
| `server/` rendered OG tags and `/sitemap.xml` from the API book list  | `entry-server.ogTags` + `worker/index.ts` sitemap/robots (ADR-0010); canonical added                                                 |
| `EmbedMode` read `?embed`, `?theme`, `?customization`                 | `state/index.ts start()`: `ui.embed`, `settings.theme`, `customizations.select` by descriptor id; `App.tsx` renders the bare reader  |
| `packages/scripture-map` (2D grid, reading heat from reading history) | `ScriptureMapPane`: the grid, the open chapter outlined, heat from marks on the device; reading history waits on `seed:ReadingEvent` |

Dropped for now: tutorials (`TutorialManager`), feature flags (PostHog); the 3D patterns stay a later embed track.
