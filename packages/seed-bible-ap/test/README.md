# test — vitest for this package

Mirrors `apps/` and `lib/`:

- `unit/lib/`, `unit/reader-web/`, `unit/reader-a2a/`, `unit/reader-mcp/`, `unit/seed-bible-a2a/`
- `integration/` — triad in-process (grows from `scripts/smoke.ts`), two-device session on `ReadingSessionDO`, svc registry round-trip
- `helpers/` — `waitForCondition`, fake Home JWKS issuer, fake person-agent A2A endpoint, in-memory `ReaderBackend`

Conventions follow the repo's `CLAUDE.md` testing section: assert observable behavior, mock only at the real boundary (reader-a2a's outbound clients, the Home JWKS), poll conditions instead of sleeping, and confirm regression tests go red on the pre-fix code.
