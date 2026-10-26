#!/usr/bin/env bash
# Launch the five Workers and the web locally. No chain needed; the Home and the reader's agent are the live estate's.
#
#   reader-mcp       :8890   the workspace tools (hello, bucket_merge)
#   reader-a2a       :8891   the reader workspace agent (service host; calls the MCP, the reader's agent, the svc)
#   seed-bible-mcp   :8893   the serving plane's tools (offering_validate)
#   seed-bible-a2a   :8892   seed-bible.svc — the Seed registry (D1, local)
#   reader-web       :5185   the page; proxies /a2a -> reader-a2a
#
# Run `pnpm seed:reader` once first: it writes apps/reader-a2a/.dev.vars (the seed demo reader, the marker, the asking
# key) and apps/seed-bible-a2a/.dev.vars (the marker, the admin token). Without them nobody can sign in locally.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f apps/reader-a2a/.dev.vars ] || echo "[reader] no apps/reader-a2a/.dev.vars — run 'pnpm seed:reader' first"
[ -f apps/seed-bible-a2a/.dev.vars ] || echo "[reader] no apps/seed-bible-a2a/.dev.vars — run 'pnpm seed:reader' first"
pnpm exec wrangler d1 migrations apply seed-reader-a2a --local -c apps/reader-a2a/wrangler.toml --persist-to .wrangler/state >/dev/null
pnpm exec wrangler d1 migrations apply seed-bible-svc --local -c apps/seed-bible-a2a/wrangler.toml --persist-to .wrangler/state >/dev/null
echo "[reader] starting reader-mcp (:8890), reader-a2a (:8891), seed-bible-a2a (:8892), seed-bible-mcp (:8893), reader-web (:5185)"
trap 'kill 0' EXIT
pnpm dev:mcp &
pnpm dev:a2a &
pnpm dev:svc-mcp &
pnpm dev:svc &
pnpm dev:web &
wait
