# Porting `ReadingPlansManager` (reading plans and progress, first cut)

Source (read-only): `managers/ReadingPlansManager.tsx` (3,154 lines), `ReadingPlansPane`, `ReadingPlanDetail`,
`ReadingPlanEditor`, `ReadingPlansSection`.

| It did                                                                | With                | Now                                                                                                                                                                               |
| --------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a plan record: sessions of readings, cadence options, status, locale  | CasualOS record     | `seed:ReadingPlan` JSON-LD, a private document in `seed-bible/plans/<id>.jsonld`: `hasSession[].readings[].item`, `cadenceOptions` (`daysPerSession`, 0 = self-paced)             |
| progress per user: selected cadence, start, completed readings, stats | a progress record   | `seed:PlanProgress` — a **mark** in the `progress` bucket (`seed-bible/progress/progress.jsonld`): it syncs, merges and adopts like a highlight; stats are derived (`plans.view`) |
| the day's readings from the cadence                                   | cadence segments    | first cut: one session every N days from `startedAt`, or self-paced (the first unfinished session)                                                                                |
| the plan editor, drafts, the plan's own pane with day tabs            | `ReadingPlanEditor` | a maker from a run of chapters (N a day); the plan card lists sessions with their readings to tick                                                                                |
| shared plan pages, friends' plans                                     | `publicRead`, SSR   | **Publish** → a released slice (kind `plan`) the registry indexes; friends' plans appear in Discover and Today                                                                    |

Dropped for now: cadence segments with skip days and several sessions a day, the partial-chapter progress, the
"nudge" toasts, the editor's draft flow.
