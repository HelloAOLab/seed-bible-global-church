# lib — shared code for the five Workers and the UI

Imported as `@seed/<module>` through `tsconfig.json` `paths` (and matching Vite aliases). These are **not** nested pnpm packages: registering them would need a root `pnpm-workspace.yaml` edit, which the scope rule in [`AGENTS.md`](../AGENTS.md) forbids.

| Module            | What it is                                                                                                              | May import                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `seed-schema/`    | zod schema per `seed:` class, with `@type`/`@context` for Library JSON-LD; checked against `~/skills/ontology/seed.ttl` | zod                            |
| `seed-protocol/`  | wire contracts: harness plan shapes, `SessionOp`, `SessionDocument`, SSE events, join card, `ContextRefV1` helper       | seed-schema                    |
| `scripture/`      | book/chapter/verse counts, reference parsing and bounds, reading URL paths, translation grouping — pure ports           | —                              |
| `a2a-client/`     | `sendMessage`, `sendStreamingMessage`, `subscribeToTask` over fetch + SSE                                               | `@agenticprimitives/a2a` types |
| `library-client/` | `seed-bible/<collection>/<id>.jsonld` paths, artifact envelope, `library.*` call shapes                                 | seed-schema                    |

No DOM or Workers globals unless a module's own README says so. Nothing here imports `@casual-simulation/*` or `packages/seed-bible/**`.
